import { z } from "zod";
import { type MinigameType, type ParticipantInfo, fairTime } from "@gioco/shared";
import { GRACE_MS, addTo, rankByPoints, speedPoints, totalsToScores } from "../util.js";

const statementSchema = z.object({
  text: z.string().trim().min(1).max(160).meta({ title: "Affermazione", widget: "textarea" }),
  answer: z.boolean().meta({ title: "È vera?" }),
});

export const veroFalsoConfigSchema = z
  .object({
    statements: z
      .array(statementSchema)
      .min(1)
      .max(100)
      .meta({ title: "Affermazioni", itemLabel: "Affermazione" }),
    timeSec: z.number().int().min(3).max(60).default(8).meta({ title: "Tempo per affermazione (s)" }),
    maxPoints: z.number().int().min(1).max(10_000).default(100).meta({ title: "Punti massimi", description: "Per una risposta giusta istantanea" }),
    minPoints: z.number().int().min(0).max(10_000).default(40).meta({ title: "Punti minimi", description: "Per una risposta giusta all'ultimo secondo" }),
    wrongPenalty: z.number().int().min(0).max(10_000).default(0).meta({ title: "Penalità per risposta sbagliata" }),
    streakBonus: z
      .number()
      .int()
      .min(0)
      .max(10_000)
      .default(20)
      .meta({ title: "Bonus serie", description: "Punti in più per ogni risposta giusta consecutiva (fino a 5 passi)" }),
    revealSec: z.number().int().min(1).max(10).default(2).meta({ title: "Pausa dopo la rivelazione (s)", description: "Poi si passa da soli alla successiva" }),
  })
  .refine((c) => c.minPoints <= c.maxPoints, { message: "I punti minimi non possono superare i massimi", path: ["minPoints"] });

export type VeroFalsoConfig = z.infer<typeof veroFalsoConfigSchema>;

const inputSchema = z.object({ type: z.literal("answer"), value: z.boolean() });
const commandSchema = z.object({ type: z.literal("next") });
type Input = z.infer<typeof inputSchema>;
type Command = z.infer<typeof commandSchema>;

const MAX_STREAK_STEPS = 5;

export interface VeroFalsoState {
  cfg: VeroFalsoConfig;
  participants: ParticipantInfo[];
  index: number;
  phase: "statement" | "reveal" | "done";
  openedAt: number;
  deadline: number;
  revealUntil: number;
  answers: Record<string, { value: boolean; time: number }>;
  /** Punti guadagnati (o persi) nell'affermazione corrente, valorizzati alla rivelazione. */
  earned: Record<string, number>;
  /** Risposte giuste consecutive per giocatore. */
  streaks: Record<string, number>;
  totals: Record<string, number>;
}

function open(state: VeroFalsoState, index: number, now: number): VeroFalsoState {
  return {
    ...state,
    index,
    phase: "statement",
    openedAt: now,
    deadline: now + state.cfg.timeSec * 1000,
    answers: {},
    earned: {},
  };
}

function reveal(state: VeroFalsoState, now: number): VeroFalsoState {
  const correct = state.cfg.statements[state.index]!.answer;
  const { maxPoints, minPoints, wrongPenalty, streakBonus } = state.cfg;
  const earned: Record<string, number> = {};
  const streaks: Record<string, number> = {};
  let totals = state.totals;

  for (const p of state.participants) {
    const a = state.answers[p.id];
    if (a && a.value === correct) {
      const streak = (state.streaks[p.id] ?? 0) + 1;
      streaks[p.id] = streak;
      const points =
        speedPoints(minPoints, maxPoints, state.openedAt, state.deadline, a.time) +
        streakBonus * Math.min(streak - 1, MAX_STREAK_STEPS);
      earned[p.id] = points;
      totals = addTo(totals, p.id, points);
    } else {
      streaks[p.id] = 0; // risposta sbagliata o mancata: la serie si interrompe
      if (a && wrongPenalty > 0) {
        earned[p.id] = -wrongPenalty;
        totals = addTo(totals, p.id, -wrongPenalty);
      }
    }
  }
  return { ...state, phase: "reveal", revealUntil: now + state.cfg.revealSec * 1000, earned, streaks, totals };
}

function advance(state: VeroFalsoState, now: number): VeroFalsoState {
  return state.index + 1 < state.cfg.statements.length ? open(state, state.index + 1, now) : { ...state, phase: "done" };
}

function counts(state: VeroFalsoState) {
  let yes = 0;
  let no = 0;
  for (const a of Object.values(state.answers)) a.value ? yes++ : no++;
  return { true: yes, false: no };
}

function publicStatement(state: VeroFalsoState) {
  return {
    index: state.index,
    total: state.cfg.statements.length,
    text: state.cfg.statements[state.index]!.text,
    openedAt: state.openedAt,
    deadline: state.deadline,
  };
}

export const veroFalso: MinigameType<VeroFalsoConfig, VeroFalsoState, Input, Command> = {
  id: "vero-falso",
  title: "Vero o falso a raffica",
  defaultTheme: "retro80",
  configSchema: veroFalsoConfigSchema as unknown as z.ZodType<VeroFalsoConfig>,
  inputSchema,
  commandSchema,
  sampleConfig: {
    statements: [
      { text: "Il Sole è una stella.", answer: true },
      { text: "Il pomodoro è un frutto.", answer: true },
      { text: "Il Monte Bianco è in Svizzera.", answer: false },
    ],
    timeSec: 8,
    maxPoints: 100,
    minPoints: 40,
    wrongPenalty: 0,
    streakBonus: 20,
    revealSec: 2,
  },

  init(config, ctx, now) {
    const base: VeroFalsoState = {
      cfg: config,
      participants: ctx.players,
      index: 0,
      phase: "statement",
      openedAt: now,
      deadline: now,
      revealUntil: 0,
      answers: {},
      earned: {},
      streaks: {},
      totals: {},
    };
    return open(base, 0, now);
  },

  onInput(state, playerId, input, meta) {
    if (state.phase !== "statement") return state;
    if (!state.participants.some((p) => p.id === playerId)) return state;
    if (state.answers[playerId]) return state; // la prima risposta è definitiva
    if (meta.receivedAt > state.deadline + GRACE_MS) return state;
    const time = fairTime({ claimed: meta.claimedTime, receivedAt: meta.receivedAt, rtt: meta.rtt, openedAt: state.openedAt });
    if (time > state.deadline) return state;
    return { ...state, answers: { ...state.answers, [playerId]: { value: input.value, time } } };
  },

  onTick(state, now) {
    if (state.phase === "statement") {
      const everyone = state.participants.length > 0 && state.participants.every((p) => state.answers[p.id]);
      return everyone || now >= state.deadline + GRACE_MS ? reveal(state, now) : state;
    }
    if (state.phase === "reveal" && now >= state.revealUntil) return advance(state, now);
    return state;
  },

  onHostCommand(state, _command, now) {
    if (state.phase === "statement") return reveal(state, now);
    if (state.phase === "reveal") return advance(state, now);
    return state;
  },

  isFinished: (state) => state.phase === "done",
  result: (state) => rankByPoints(state.totals, state.participants.map((p) => p.id)),
  scores: (state) => totalsToScores(state.totals, "Vero o falso"),

  // La risposta giusta compare solo dalla rivelazione in poi.
  screenView(state) {
    if (state.phase === "done") return { phase: "done" as const };
    return {
      phase: state.phase,
      ...publicStatement(state),
      answered: Object.keys(state.answers).length,
      playerCount: state.participants.length,
      ...(state.phase === "reveal" && {
        reveal: { answer: state.cfg.statements[state.index]!.answer, counts: counts(state) },
      }),
    };
  },

  viewFor(state, playerId) {
    if (state.phase === "done") return { phase: "done" as const };
    const mine = state.answers[playerId];
    const correct = state.cfg.statements[state.index]!.answer;
    return {
      phase: state.phase,
      ...publicStatement(state),
      myAnswer: mine ? mine.value : null,
      ...(state.phase === "reveal" && {
        reveal: {
          answer: correct,
          correct: mine ? mine.value === correct : null,
          earned: state.earned[playerId] ?? 0,
          streak: state.streaks[playerId] ?? 0,
        },
      }),
    };
  },

  hostView(state) {
    const s = state.cfg.statements[state.index];
    return {
      info: {
        phase: state.phase,
        index: state.index,
        total: state.cfg.statements.length,
        question: s?.text,
        answer: s ? (s.answer ? "VERO" : "FALSO") : undefined,
        answered: Object.keys(state.answers).length,
        playerCount: state.participants.length,
      },
      actions: [
        {
          id: "next",
          label: state.phase === "statement" ? "Rivela ora" : state.index + 1 >= state.cfg.statements.length ? "Concludi" : "Prossima subito",
          enabled: state.phase !== "done",
        },
      ],
    };
  },
};
