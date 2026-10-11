import { z } from "zod";
import { type MinigameType, type ParticipantInfo, fairTime } from "@gioco/shared";
import { rankByPoints, totalsToScores } from "../util.js";

/** Risposte che arrivano entro questo margine dopo la scadenza contano se la pressione era in tempo. */
const GRACE_MS = 500;

const questionSchema = z.object({
  text: z.string().trim().min(1).max(200).meta({ title: "Domanda", widget: "textarea" }),
  options: z
    .array(z.string().trim().min(1).max(80))
    .min(2)
    .max(6)
    .meta({ title: "Risposte", itemLabel: "Risposta" }),
  correctIndex: z
    .number()
    .int()
    .min(0)
    .meta({ title: "Risposta corretta", widget: "optionIndex", optionsKey: "options" }),
  timeSec: z
    .number()
    .int()
    .min(5)
    .max(120)
    .optional()
    .meta({ title: "Tempo (s)", description: "Vuoto = tempo predefinito del quiz" }),
});

export const quizConfigSchema = z
  .object({
    questions: z
      .array(questionSchema)
      .min(1)
      .max(50)
      .meta({ title: "Domande", itemLabel: "Domanda" }),
    defaultTimeSec: z.number().int().min(5).max(120).default(20).meta({ title: "Tempo predefinito (s)" }),
    maxPoints: z
      .number()
      .int()
      .min(1)
      .max(10_000)
      .default(1000)
      .meta({ title: "Punti massimi", description: "Per una risposta corretta istantanea" }),
    minPoints: z
      .number()
      .int()
      .min(0)
      .max(10_000)
      .default(300)
      .meta({ title: "Punti minimi", description: "Per una risposta corretta all'ultimo secondo" }),
  })
  .refine((c) => c.questions.every((q) => q.correctIndex < q.options.length), {
    message: "La risposta corretta deve essere una delle risposte indicate",
    path: ["questions"],
  })
  .refine((c) => c.minPoints <= c.maxPoints, {
    message: "I punti minimi non possono superare i massimi",
    path: ["minPoints"],
  });

export type QuizConfig = z.infer<typeof quizConfigSchema>;

const inputSchema = z.object({ type: z.literal("answer"), choice: z.number().int().min(0).max(5) });
const commandSchema = z.object({ type: z.literal("next") });

type Input = z.infer<typeof inputSchema>;
type Command = z.infer<typeof commandSchema>;

export interface QuizState {
  cfg: QuizConfig;
  participants: ParticipantInfo[];
  index: number;
  phase: "question" | "reveal" | "done";
  openedAt: number;
  deadline: number;
  answers: Record<string, { choice: number; time: number }>;
  /** Punti guadagnati nella domanda corrente (valorizzati alla rivelazione). */
  earned: Record<string, number>;
  totals: Record<string, number>;
}

const durationMs = (cfg: QuizConfig, index: number) =>
  (cfg.questions[index]!.timeSec ?? cfg.defaultTimeSec) * 1000;

function openQuestion(state: QuizState, index: number, now: number): QuizState {
  return {
    ...state,
    index,
    phase: "question",
    openedAt: now,
    deadline: now + durationMs(state.cfg, index),
    answers: {},
    earned: {},
  };
}

function reveal(state: QuizState): QuizState {
  const q = state.cfg.questions[state.index]!;
  const duration = state.deadline - state.openedAt;
  const earned: Record<string, number> = {};
  const totals = { ...state.totals };
  for (const [playerId, a] of Object.entries(state.answers)) {
    if (a.choice !== q.correctIndex) continue;
    const elapsed = Math.min(Math.max(a.time - state.openedAt, 0), duration);
    const { maxPoints, minPoints } = state.cfg;
    const points = Math.round(minPoints + (maxPoints - minPoints) * (1 - elapsed / duration));
    earned[playerId] = points;
    totals[playerId] = (totals[playerId] ?? 0) + points;
  }
  return { ...state, phase: "reveal", earned, totals };
}

function counts(state: QuizState): number[] {
  const q = state.cfg.questions[state.index]!;
  const c = q.options.map(() => 0);
  for (const a of Object.values(state.answers)) c[a.choice] = (c[a.choice] ?? 0) + 1;
  return c;
}

function publicQuestion(state: QuizState) {
  const q = state.cfg.questions[state.index]!;
  return {
    index: state.index,
    total: state.cfg.questions.length,
    question: q.text,
    options: q.options,
    openedAt: state.openedAt,
    deadline: state.deadline,
  };
}

export const quizMultipla: MinigameType<QuizConfig, QuizState, Input, Command> = {
  id: "quiz-multipla",
  title: "Quiz a scelta multipla",
  defaultTheme: "gameshow",
  configSchema: quizConfigSchema as unknown as z.ZodType<QuizConfig>,
  inputSchema,
  commandSchema,
  sampleConfig: {
    questions: [
      { text: "Quanti continenti ci sono?", options: ["5", "6", "7", "8"], correctIndex: 2 },
      { text: "Capitale d'Italia?", options: ["Milano", "Roma", "Napoli"], correctIndex: 1, timeSec: 15 },
    ],
    defaultTimeSec: 20,
    maxPoints: 1000,
    minPoints: 300,
  },

  init(config, ctx, now) {
    const base: QuizState = {
      cfg: config,
      participants: ctx.players,
      index: 0,
      phase: "question",
      openedAt: now,
      deadline: now,
      answers: {},
      earned: {},
      totals: {},
    };
    return openQuestion(base, 0, now);
  },

  onInput(state, playerId, input, meta) {
    if (state.phase !== "question") return state;
    if (!state.participants.some((p) => p.id === playerId)) return state;
    if (state.answers[playerId]) return state; // la prima risposta è definitiva
    if (input.choice >= state.cfg.questions[state.index]!.options.length) return state;
    if (meta.receivedAt > state.deadline + GRACE_MS) return state;
    const time = fairTime({
      claimed: meta.claimedTime,
      receivedAt: meta.receivedAt,
      rtt: meta.rtt,
      openedAt: state.openedAt,
    });
    if (time > state.deadline) return state;
    return { ...state, answers: { ...state.answers, [playerId]: { choice: input.choice, time } } };
  },

  onTick(state, now) {
    if (state.phase !== "question") return state;
    const everyoneAnswered =
      state.participants.length > 0 && state.participants.every((p) => state.answers[p.id]);
    if (everyoneAnswered || now >= state.deadline + GRACE_MS) return reveal(state);
    return state;
  },

  onHostCommand(state, _command, now) {
    if (state.phase === "question") return reveal(state);
    if (state.phase === "reveal") {
      return state.index + 1 < state.cfg.questions.length
        ? openQuestion(state, state.index + 1, now)
        : { ...state, phase: "done" };
    }
    return state;
  },

  isFinished: (state) => state.phase === "done",
  result: (state) =>
    rankByPoints(
      state.totals,
      state.participants.map((p) => p.id),
    ),
  scores: (state) => totalsToScores(state.totals, "Quiz"),

  screenView(state) {
    if (state.phase === "done") return { phase: "done" as const };
    return {
      phase: state.phase,
      ...publicQuestion(state),
      answered: Object.keys(state.answers).length,
      playerCount: state.participants.length,
      // La risposta corretta e la distribuzione compaiono solo alla rivelazione.
      ...(state.phase === "reveal" && {
        reveal: { correctIndex: state.cfg.questions[state.index]!.correctIndex, counts: counts(state) },
      }),
    };
  },

  viewFor(state, playerId) {
    if (state.phase === "done") return { phase: "done" as const };
    const mine = state.answers[playerId];
    return {
      phase: state.phase,
      ...publicQuestion(state),
      myChoice: mine ? mine.choice : null,
      ...(state.phase === "reveal" && {
        reveal: {
          correctIndex: state.cfg.questions[state.index]!.correctIndex,
          earned: state.earned[playerId] ?? 0,
        },
      }),
    };
  },

  hostView(state) {
    const last = state.index + 1 >= state.cfg.questions.length;
    const q = state.cfg.questions[state.index];
    return {
      info: {
        phase: state.phase,
        index: state.index,
        total: state.cfg.questions.length,
        question: q?.text,
        correct: q ? q.options[q.correctIndex] : undefined,
        answered: Object.keys(state.answers).length,
        playerCount: state.participants.length,
      },
      actions: [
        {
          id: "next",
          label:
            state.phase === "question"
              ? "Rivela ora la risposta"
              : last
                ? "Concludi il quiz"
                : "Prossima domanda",
          enabled: state.phase !== "done",
        },
      ],
    };
  },
};
