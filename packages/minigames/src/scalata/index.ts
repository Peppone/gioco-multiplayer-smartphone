import { z } from "zod";
import { type MinigameType, type ParticipantInfo, type RoundResult, fairTime } from "@gioco/shared";
import { GRACE_MS, rankByPoints } from "../util.js";

const questionSchema = z.object({
  text: z.string().trim().min(1).max(200).meta({ title: "Domanda", widget: "textarea" }),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(6).meta({ title: "Risposte", itemLabel: "Risposta" }),
  correctIndex: z.number().int().min(0).meta({ title: "Risposta corretta", widget: "optionIndex", optionsKey: "options" }),
  timeSec: z.number().int().min(5).max(120).optional().meta({ title: "Tempo (s)", description: "Vuoto = tempo predefinito" }),
});

export const scalataConfigSchema = z
  .object({
    questions: z
      .array(questionSchema)
      .min(1)
      .max(30)
      .meta({ title: "Domande, dalla più facile alla più difficile", description: "Si giocano nell'ordine in cui sono scritte", itemLabel: "Domanda" }),
    prizePoints: z.number().int().min(0).max(100_000).default(1000).meta({
      title: "Punti in palio",
      description: "Li dividono in parti uguali quelli che non sbagliano mai. Se tutti sbagliano almeno una volta, vanno a chi ha il punteggio più alto",
    }),
    basePoints: z.number().int().min(0).max(10_000).default(100).meta({
      title: "Punti per risposta giusta",
      description: "Moltiplicati per il livello: la domanda 1 vale una volta questo valore, la 2 due volte, e così via",
    }),
    afterOutPercent: z.number().int().min(0).max(100).default(50).meta({
      title: "Valore delle risposte dopo l'eliminazione (%)",
      description: "Chi ha già sbagliato continua a rispondere, ma ogni risposta giusta vale questa percentuale",
    }),
    defaultTimeSec: z.number().int().min(5).max(120).default(15).meta({ title: "Tempo predefinito (s)" }),
    revealSec: z.number().int().min(1).max(20).default(5).meta({ title: "Pausa dopo la rivelazione (s)", description: "Poi si passa da soli alla domanda dopo (la regia può anticipare)" }),
  })
  .refine((c) => c.questions.every((q) => q.correctIndex < q.options.length), {
    message: "La risposta corretta deve essere una delle risposte indicate",
    path: ["questions"],
  });

export type ScalataConfig = z.infer<typeof scalataConfigSchema>;

const inputSchema = z.object({ type: z.literal("answer"), choice: z.number().int().min(0).max(5) });
const commandSchema = z.object({ type: z.literal("next") });
type Input = z.infer<typeof inputSchema>;
type Command = z.infer<typeof commandSchema>;

export interface ScalataState {
  cfg: ScalataConfig;
  participants: ParticipantInfo[];
  index: number;
  phase: "question" | "reveal" | "done";
  openedAt: number;
  deadline: number;
  revealUntil: number;
  /** Chi non ha ancora sbagliato nemmeno una volta. */
  alive: string[];
  answers: Record<string, { choice: number; time: number }>;
  /** Livello (indice della domanda) in cui ciascuno ha sbagliato per la prima volta. */
  out: Record<string, number>;
  /** Punti delle risposte giuste, per giocatore (senza la quota del montepremi). */
  points: Record<string, number>;
  /** Punti guadagnati nella domanda appena rivelata. */
  earned: Record<string, number>;
  /** Tempo totale di risposta nelle risposte giuste: serve solo a spartire l'eventuale resto dei punti. */
  speed: Record<string, number>;
  /** Chi è stato eliminato in questa rivelazione. */
  lastOut: string[];
}

const durationMs = (cfg: ScalataConfig, index: number) => (cfg.questions[index]!.timeSec ?? cfg.defaultTimeSec) * 1000;

function open(s: ScalataState, index: number, now: number): ScalataState {
  return { ...s, index, phase: "question", openedAt: now, deadline: now + durationMs(s.cfg, index), answers: {}, earned: {}, lastOut: [] };
}

/** Punti di una risposta giusta: crescono col livello e valgono meno per chi era già stato eliminato. */
function worth(s: ScalataState, stillAlive: boolean): number {
  const full = s.cfg.basePoints * (s.index + 1);
  return stillAlive ? full : Math.round((full * s.cfg.afterOutPercent) / 100);
}

function reveal(s: ScalataState, now: number): ScalataState {
  const q = s.cfg.questions[s.index]!;
  const earned: Record<string, number> = {};
  const points = { ...s.points };
  const speed = { ...s.speed };
  const out = { ...s.out };
  const lastOut: string[] = [];
  for (const p of s.participants) {
    const a = s.answers[p.id];
    const stillAlive = s.alive.includes(p.id);
    if (a?.choice === q.correctIndex) {
      const pts = worth(s, stillAlive);
      earned[p.id] = pts;
      points[p.id] = (points[p.id] ?? 0) + pts;
      speed[p.id] = (speed[p.id] ?? 0) + Math.max(0, a.time - s.openedAt);
    } else if (stillAlive) {
      out[p.id] = s.index; // sbagliato o nessuna risposta: da qui in poi vale meno
      lastOut.push(p.id);
    }
  }
  return {
    ...s,
    phase: "reveal",
    revealUntil: now + s.cfg.revealSec * 1000,
    alive: s.alive.filter((id) => !lastOut.includes(id)),
    out,
    points,
    earned,
    speed,
    lastOut,
  };
}

function advance(s: ScalataState, now: number): ScalataState {
  return s.index + 1 >= s.cfg.questions.length ? { ...s, phase: "done" } : open(s, s.index + 1, now);
}

/**
 * Chi si divide il montepremi: chi non ha mai sbagliato; se non c'è nessuno, chi ha il punteggio più alto
 * (a pari merito in più). Con tutti a zero punti non vince nessuno.
 */
function winners(s: ScalataState): string[] {
  if (s.phase !== "done") return [];
  if (s.alive.length > 0) return s.alive;
  const top = Math.max(0, ...s.participants.map((p) => s.points[p.id] ?? 0));
  return top > 0 ? s.participants.filter((p) => (s.points[p.id] ?? 0) === top).map((p) => p.id) : [];
}

/** Quota di montepremi di ciascun vincitore: parti uguali; l'eventuale resto va un punto ciascuno ai più veloci. */
function shares(s: ScalataState): Record<string, number> {
  const w = winners(s);
  if (w.length === 0) return {};
  const base = Math.floor(s.cfg.prizePoints / w.length);
  const rest = s.cfg.prizePoints - base * w.length;
  const byspeed = [...w].sort((a, b) => (s.speed[a] ?? 0) - (s.speed[b] ?? 0) || a.localeCompare(b));
  return Object.fromEntries(byspeed.map((id, i) => [id, base + (i < rest ? 1 : 0)]));
}

/** Punti totali del round: risposte giuste più quota del montepremi. */
function totals(s: ScalataState): Record<string, number> {
  const sh = shares(s);
  return Object.fromEntries(s.participants.map((p) => [p.id, (s.points[p.id] ?? 0) + (sh[p.id] ?? 0)]));
}

const nameOf = (s: ScalataState, id: string) => s.participants.find((p) => p.id === id)?.nickname ?? "?";
const people = (s: ScalataState, ids: string[]) => ids.map((id) => ({ id, nickname: nameOf(s, id) }));

function publicQuestion(s: ScalataState) {
  const q = s.cfg.questions[s.index]!;
  return {
    index: s.index,
    total: s.cfg.questions.length,
    question: q.text,
    options: q.options,
    openedAt: s.openedAt,
    deadline: s.deadline,
    prize: s.cfg.prizePoints,
    alive: people(s, s.alive),
    playerCount: s.participants.length,
  };
}

function counts(s: ScalataState): number[] {
  const c = s.cfg.questions[s.index]!.options.map(() => 0);
  for (const a of Object.values(s.answers)) c[a.choice] = (c[a.choice] ?? 0) + 1;
  return c;
}

/** I primi cinque per punti delle risposte, per lo schermo. */
function topFive(s: ScalataState) {
  return [...s.participants]
    .map((p) => ({ id: p.id, nickname: p.nickname, points: s.points[p.id] ?? 0, alive: s.alive.includes(p.id) }))
    .sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname))
    .slice(0, 5);
}

function doneView(s: ScalataState) {
  const sh = shares(s);
  const w = winners(s);
  return {
    phase: "done" as const,
    prize: s.cfg.prizePoints,
    byScore: s.alive.length === 0,
    winners: people(s, w).map((p) => ({ ...p, points: sh[p.id] ?? 0 })),
  };
}

export const scalata: MinigameType<ScalataConfig, ScalataState, Input, Command> = {
  id: "scalata",
  title: "La scalata (eliminazione)",
  defaultTheme: "gameshow",
  configSchema: scalataConfigSchema as unknown as z.ZodType<ScalataConfig>,
  inputSchema,
  commandSchema,
  sampleConfig: {
    questions: [
      { text: "Quanti sono i continenti?", options: ["5", "6", "7", "8"], correctIndex: 2 },
      { text: "Qual è la capitale della Spagna?", options: ["Madrid", "Barcellona", "Lisbona"], correctIndex: 0 },
      { text: "In che anno è caduto il Muro di Berlino?", options: ["1985", "1989", "1991", "1993"], correctIndex: 1 },
    ],
    prizePoints: 1000,
    basePoints: 100,
    afterOutPercent: 50,
    defaultTimeSec: 15,
    revealSec: 5,
  },

  init(config, ctx, now) {
    const base: ScalataState = {
      cfg: config,
      participants: ctx.players,
      index: 0,
      phase: "question",
      openedAt: now,
      deadline: now,
      revealUntil: 0,
      alive: ctx.players.map((p) => p.id),
      answers: {},
      out: {},
      points: {},
      earned: {},
      speed: {},
      lastOut: [],
    };
    return open(base, 0, now);
  },

  onInput(state, playerId, input, meta) {
    if (state.phase !== "question") return state;
    if (!state.participants.some((p) => p.id === playerId)) return state;
    if (state.answers[playerId]) return state; // la prima risposta è definitiva
    if (input.choice >= state.cfg.questions[state.index]!.options.length) return state;
    if (meta.receivedAt > state.deadline + GRACE_MS) return state;
    const time = fairTime({ claimed: meta.claimedTime, receivedAt: meta.receivedAt, rtt: meta.rtt, openedAt: state.openedAt });
    if (time > state.deadline) return state;
    return { ...state, answers: { ...state.answers, [playerId]: { choice: input.choice, time } } };
  },

  onTick(state, now) {
    if (state.phase === "question") {
      const everyone = state.participants.length > 0 && state.participants.every((p) => state.answers[p.id]);
      return everyone || now >= state.deadline + GRACE_MS ? reveal(state, now) : state;
    }
    if (state.phase === "reveal" && now >= state.revealUntil) return advance(state, now);
    return state;
  },

  onHostCommand(state, _command, now) {
    if (state.phase === "question") return reveal(state, now);
    if (state.phase === "reveal") return advance(state, now);
    return state;
  },

  isFinished: (state) => state.phase === "done",
  result: (state): RoundResult => rankByPoints(totals(state), state.participants.map((p) => p.id)),

  // Le risposte giuste si pagano subito; il montepremi solo a round concluso.
  scores: (state) =>
    Object.entries(totals(state))
      .filter(([, points]) => points !== 0)
      .map(([playerId, points]) => ({ playerId, teamId: null, points, reason: "La scalata" })),

  // La risposta giusta e chi è stato eliminato compaiono solo alla rivelazione.
  screenView(state) {
    if (state.phase === "done") return doneView(state);
    const q = state.cfg.questions[state.index]!;
    return {
      phase: state.phase,
      ...publicQuestion(state),
      answered: Object.keys(state.answers).length,
      ...(state.phase === "reveal" && {
        reveal: { correctIndex: q.correctIndex, counts: counts(state), eliminated: people(state, state.lastOut), top: topFive(state) },
      }),
    };
  },

  viewFor(state, playerId) {
    const mine = state.points[playerId] ?? 0;
    if (state.phase === "done") {
      return {
        ...doneView(state),
        status: state.alive.includes(playerId) ? ("survivor" as const) : ("out" as const),
        eliminatedAt: state.out[playerId] ?? null,
        myPoints: totals(state)[playerId] ?? 0,
        isWinner: winners(state).includes(playerId),
      };
    }
    const q = state.cfg.questions[state.index]!;
    const choice = state.answers[playerId];
    return {
      phase: state.phase,
      ...publicQuestion(state),
      // «falling»: sbaglia proprio in questa domanda (lo scopre alla rivelazione); «out»: ha già sbagliato prima
      status: state.alive.includes(playerId) ? ("alive" as const) : state.lastOut.includes(playerId) && state.phase === "reveal" ? ("falling" as const) : ("out" as const),
      myChoice: choice ? choice.choice : null,
      myPoints: mine,
      ...(state.phase === "reveal" && { reveal: { correctIndex: q.correctIndex, earned: state.earned[playerId] ?? 0 } }),
    };
  },

  hostView(state) {
    const q = state.cfg.questions[state.index];
    const last = state.index + 1 >= state.cfg.questions.length;
    return {
      info: {
        phase: state.phase,
        index: state.index,
        total: state.cfg.questions.length,
        question: q?.text,
        correct: q ? q.options[q.correctIndex] : undefined,
        answered: Object.keys(state.answers).length,
        playerCount: state.participants.length,
        aliveCount: state.alive.length,
      },
      actions: [
        {
          id: "next",
          label: state.phase === "question" ? "Rivela ora la risposta" : last ? "Concludi" : "Prossima domanda subito",
          enabled: state.phase !== "done",
        },
      ],
    };
  },
};
