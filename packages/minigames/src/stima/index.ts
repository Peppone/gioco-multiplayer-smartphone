import { z } from "zod";
import { type MinigameType, type ParticipantInfo, fairTime } from "@gioco/shared";
import { GRACE_MS, addTo, rankByPoints, totalsToScores } from "../util.js";

const questionSchema = z.object({
  text: z.string().trim().min(1).max(200).meta({ title: "Domanda", widget: "textarea" }),
  answer: z.number().finite().meta({ title: "Valore esatto", description: "Visibile solo alla regia fino alla rivelazione" }),
  unit: z.string().trim().max(12).optional().meta({ title: "Unità", description: "Es. km, anni, %" }),
  min: z.number().finite().optional().meta({ title: "Minimo (cursore)", description: "Con minimo e massimo il telefono mostra un cursore" }),
  max: z.number().finite().optional().meta({ title: "Massimo (cursore)" }),
});

export const stimaConfigSchema = z
  .object({
    questions: z.array(questionSchema).min(1).max(50).meta({ title: "Domande", itemLabel: "Domanda" }),
    timeSec: z.number().int().min(5).max(180).default(25).meta({ title: "Tempo per domanda (s)" }),
    rewards: z
      .array(z.number().int().min(0).max(10_000))
      .min(1)
      .max(10)
      .default([1000, 600, 300])
      .meta({ title: "Punti per i più vicini", description: "1° posto, 2° posto, 3° posto…", itemLabel: "Posto" }),
    exactBonus: z.number().int().min(0).max(10_000).default(200).meta({ title: "Bonus risposta esatta" }),
  })
  .refine((c) => c.questions.every((q) => q.min === undefined || q.max === undefined || q.min < q.max), {
    message: "Il minimo deve essere inferiore al massimo",
    path: ["questions"],
  })
  .refine((c) => c.questions.every((q) => (q.min === undefined || q.answer >= q.min) && (q.max === undefined || q.answer <= q.max)), {
    message: "Il valore esatto deve stare tra minimo e massimo",
    path: ["questions"],
  });

export type StimaConfig = z.infer<typeof stimaConfigSchema>;

const MAX_ABS = 1e12;
const inputSchema = z.object({ type: z.literal("guess"), value: z.number().finite().min(-MAX_ABS).max(MAX_ABS) });
const commandSchema = z.object({ type: z.literal("next") });
type Input = z.infer<typeof inputSchema>;
type Command = z.infer<typeof commandSchema>;

interface Outcome {
  playerId: string;
  value: number;
  /** Distanza assoluta dal valore esatto. */
  distance: number;
  rank: number;
  points: number;
}

export interface StimaState {
  cfg: StimaConfig;
  participants: ParticipantInfo[];
  index: number;
  phase: "question" | "reveal" | "done";
  openedAt: number;
  deadline: number;
  /** Ultima stima di ciascuno: si può cambiare finché c'è tempo. */
  guesses: Record<string, { value: number; time: number }>;
  outcomes: Outcome[];
  totals: Record<string, number>;
}

function open(state: StimaState, index: number, now: number): StimaState {
  return { ...state, index, phase: "question", openedAt: now, deadline: now + state.cfg.timeSec * 1000, guesses: {}, outcomes: [] };
}

/** Vince chi si avvicina di più (distanza assoluta); a pari distanza stesso posto e stesso premio. */
function reveal(state: StimaState): StimaState {
  const q = state.cfg.questions[state.index]!;
  const rows = Object.entries(state.guesses)
    .map(([playerId, g]) => ({ playerId, value: g.value, distance: Math.abs(g.value - q.answer) }))
    .sort((a, b) => a.distance - b.distance || a.playerId.localeCompare(b.playerId));

  let rank = 0;
  let totals = state.totals;
  const outcomes: Outcome[] = rows.map((r, i) => {
    if (i === 0 || r.distance !== rows[i - 1]!.distance) rank = i + 1;
    const points = (state.cfg.rewards[rank - 1] ?? 0) + (r.distance === 0 ? state.cfg.exactBonus : 0);
    totals = addTo(totals, r.playerId, points);
    return { ...r, rank, points };
  });
  return { ...state, phase: "reveal", outcomes, totals };
}

function publicQuestion(state: StimaState) {
  const q = state.cfg.questions[state.index]!;
  return {
    index: state.index,
    total: state.cfg.questions.length,
    question: q.text,
    unit: q.unit ?? null,
    min: q.min ?? null,
    max: q.max ?? null,
    openedAt: state.openedAt,
    deadline: state.deadline,
  };
}

export const stima: MinigameType<StimaConfig, StimaState, Input, Command> = {
  id: "stima",
  title: "Stima numerica",
  defaultTheme: "pixel",
  configSchema: stimaConfigSchema as unknown as z.ZodType<StimaConfig>,
  inputSchema,
  commandSchema,
  sampleConfig: {
    questions: [
      { text: "Quanti anni ha la Torre di Pisa (dall'inizio dei lavori)?", answer: 850, unit: "anni" },
      { text: "Quanti chilometri è lunga la costa italiana?", answer: 7500, unit: "km", min: 0, max: 20000 },
    ],
    timeSec: 25,
    rewards: [1000, 600, 300],
    exactBonus: 200,
  },

  init(config, ctx, now) {
    const base: StimaState = {
      cfg: config,
      participants: ctx.players,
      index: 0,
      phase: "question",
      openedAt: now,
      deadline: now,
      guesses: {},
      outcomes: [],
      totals: {},
    };
    return open(base, 0, now);
  },

  onInput(state, playerId, input, meta) {
    if (state.phase !== "question") return state;
    if (!state.participants.some((p) => p.id === playerId)) return state;
    const q = state.cfg.questions[state.index]!;
    if ((q.min !== undefined && input.value < q.min) || (q.max !== undefined && input.value > q.max)) return state;
    if (meta.receivedAt > state.deadline + GRACE_MS) return state;
    const time = fairTime({ claimed: meta.claimedTime, receivedAt: meta.receivedAt, rtt: meta.rtt, openedAt: state.openedAt });
    if (time > state.deadline) return state;
    const previous = state.guesses[playerId];
    if (previous && previous.time > time) return state; // un messaggio vecchio arrivato in ritardo non sovrascrive uno più recente
    return { ...state, guesses: { ...state.guesses, [playerId]: { value: input.value, time } } };
  },

  onTick(state, now) {
    return state.phase === "question" && now >= state.deadline + GRACE_MS ? reveal(state) : state;
  },

  onHostCommand(state, _command, now) {
    if (state.phase === "question") return reveal(state);
    if (state.phase === "reveal") {
      return state.index + 1 < state.cfg.questions.length ? open(state, state.index + 1, now) : { ...state, phase: "done" };
    }
    return state;
  },

  isFinished: (state) => state.phase === "done",
  result: (state) => rankByPoints(state.totals, state.participants.map((p) => p.id)),
  scores: (state) => totalsToScores(state.totals, "Stima"),

  // Le stime degli altri e il valore esatto restano segreti fino alla rivelazione.
  screenView(state) {
    if (state.phase === "done") return { phase: "done" as const };
    const name = (id: string) => state.participants.find((p) => p.id === id)?.nickname ?? "?";
    return {
      phase: state.phase,
      ...publicQuestion(state),
      answered: Object.keys(state.guesses).length,
      playerCount: state.participants.length,
      ...(state.phase === "reveal" && {
        reveal: {
          answer: state.cfg.questions[state.index]!.answer,
          results: state.outcomes.map((o) => ({ nickname: name(o.playerId), value: o.value, distance: o.distance, rank: o.rank, points: o.points })),
        },
      }),
    };
  },

  viewFor(state, playerId) {
    if (state.phase === "done") return { phase: "done" as const };
    const mine = state.guesses[playerId];
    const outcome = state.outcomes.find((o) => o.playerId === playerId);
    return {
      phase: state.phase,
      ...publicQuestion(state),
      myGuess: mine ? mine.value : null,
      ...(state.phase === "reveal" && {
        reveal: {
          answer: state.cfg.questions[state.index]!.answer,
          distance: outcome ? outcome.distance : null,
          rank: outcome ? outcome.rank : null,
          points: outcome ? outcome.points : 0,
        },
      }),
    };
  },

  hostView(state) {
    const q = state.cfg.questions[state.index];
    return {
      info: {
        phase: state.phase,
        index: state.index,
        total: state.cfg.questions.length,
        question: q?.text,
        answer: q ? `${q.answer}${q.unit ? ` ${q.unit}` : ""}` : undefined,
        answered: Object.keys(state.guesses).length,
        playerCount: state.participants.length,
      },
      actions: [
        {
          id: "next",
          label: state.phase === "question" ? "Rivela ora" : state.index + 1 >= state.cfg.questions.length ? "Concludi" : "Prossima domanda",
          enabled: state.phase !== "done",
        },
      ],
    };
  },
};
