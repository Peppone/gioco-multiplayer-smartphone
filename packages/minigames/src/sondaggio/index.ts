import { z } from "zod";
import { type MinigameType, type ParticipantInfo, fairTime } from "@gioco/shared";
import { GRACE_MS, addTo, rankByPoints, totalsToScores } from "../util.js";

const questionSchema = z.object({
  text: z.string().trim().min(1).max(200).meta({ title: "Domanda", widget: "textarea" }),
  kind: z
    .enum(["options", "players"])
    .default("options")
    .meta({
      title: "Tipo di voto",
      enumLabels: { options: "Scelta tra opzioni", players: "Voto a un giocatore" },
    }),
  options: z
    .array(z.string().trim().min(1).max(60))
    .min(2)
    .max(6)
    .default(["Sì", "No"])
    .meta({ title: "Opzioni", description: "Usate solo con «Scelta tra opzioni»", itemLabel: "Opzione" }),
});

export const sondaggioConfigSchema = z.object({
  questions: z.array(questionSchema).min(1).max(50).meta({ title: "Domande", itemLabel: "Domanda" }),
  timeSec: z.number().int().min(5).max(180).default(20).meta({ title: "Tempo per domanda (s)" }),
  crowdPoints: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .default(50)
    .meta({ title: "Punti a chi vota come la maggioranza", description: "Solo per la scelta tra opzioni; 0 = nessun punto" }),
  winnerPoints: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .default(100)
    .meta({ title: "Punti al giocatore più votato", description: "Solo per il voto a un giocatore; 0 = nessun punto" }),
});

export type SondaggioConfig = z.infer<typeof sondaggioConfigSchema>;

const inputSchema = z.union([
  z.object({ type: z.literal("vote"), option: z.number().int().min(0).max(5) }),
  z.object({ type: z.literal("vote"), target: z.string().min(1).max(64) }),
]);
const commandSchema = z.object({ type: z.literal("next") });
type Input = z.infer<typeof inputSchema>;
type Command = z.infer<typeof commandSchema>;

/** Un voto è l'indice dell'opzione oppure l'id del giocatore votato. */
type Vote = number | string;

interface Tally {
  /** Chiave = indice opzione (come stringa) o id giocatore. */
  counts: Record<string, number>;
  /** Chiavi con il massimo dei voti (più di una in caso di parità). */
  top: string[];
}

export interface SondaggioState {
  cfg: SondaggioConfig;
  participants: ParticipantInfo[];
  index: number;
  phase: "voting" | "reveal" | "done";
  openedAt: number;
  deadline: number;
  /** Il voto di ciascuno (cambiabile finché c'è tempo). Non esce mai da qui se non come voto proprio. */
  votes: Record<string, { vote: Vote; time: number }>;
  tally: Tally | null;
  earned: Record<string, number>;
  totals: Record<string, number>;
}

function open(state: SondaggioState, index: number, now: number): SondaggioState {
  return { ...state, index, phase: "voting", openedAt: now, deadline: now + state.cfg.timeSec * 1000, votes: {}, tally: null, earned: {} };
}

function reveal(state: SondaggioState): SondaggioState {
  const q = state.cfg.questions[state.index]!;
  const counts: Record<string, number> = {};
  if (q.kind === "options") q.options.forEach((_, i) => (counts[String(i)] = 0));
  else state.participants.forEach((p) => (counts[p.id] = 0));
  for (const { vote } of Object.values(state.votes)) counts[String(vote)] = (counts[String(vote)] ?? 0) + 1;

  const max = Math.max(0, ...Object.values(counts));
  const top = max > 0 ? Object.keys(counts).filter((k) => counts[k] === max) : [];

  const earned: Record<string, number> = {};
  let totals = state.totals;
  const award = (id: string, points: number) => {
    if (points <= 0) return;
    earned[id] = (earned[id] ?? 0) + points;
    totals = addTo(totals, id, points);
  };
  if (q.kind === "options") {
    for (const [voter, { vote }] of Object.entries(state.votes)) if (top.includes(String(vote))) award(voter, state.cfg.crowdPoints);
  } else {
    for (const id of top) award(id, state.cfg.winnerPoints);
  }
  return { ...state, phase: "reveal", tally: { counts, top }, earned, totals };
}

function publicQuestion(state: SondaggioState) {
  const q = state.cfg.questions[state.index]!;
  return {
    index: state.index,
    total: state.cfg.questions.length,
    question: q.text,
    kind: q.kind,
    options: q.kind === "options" ? q.options : [],
    openedAt: state.openedAt,
    deadline: state.deadline,
  };
}

export const sondaggio: MinigameType<SondaggioConfig, SondaggioState, Input, Command> = {
  id: "sondaggio",
  title: "Sondaggio e voto",
  defaultTheme: "manga",
  configSchema: sondaggioConfigSchema as unknown as z.ZodType<SondaggioConfig>,
  inputSchema,
  commandSchema,
  sampleConfig: {
    questions: [
      { text: "Pizza con l'ananas?", kind: "options", options: ["Sì, la adoro", "Mai e poi mai"] },
      { text: "Chi è il più probabile a far tardi a una cena?", kind: "players", options: ["Sì", "No"] },
    ],
    timeSec: 20,
    crowdPoints: 50,
    winnerPoints: 100,
  },

  init(config, ctx, now) {
    const base: SondaggioState = {
      cfg: config,
      participants: ctx.players,
      index: 0,
      phase: "voting",
      openedAt: now,
      deadline: now,
      votes: {},
      tally: null,
      earned: {},
      totals: {},
    };
    return open(base, 0, now);
  },

  onInput(state, playerId, input, meta) {
    if (state.phase !== "voting") return state;
    if (!state.participants.some((p) => p.id === playerId)) return state;
    const q = state.cfg.questions[state.index]!;

    let vote: Vote;
    if ("option" in input) {
      if (q.kind !== "options" || input.option >= q.options.length) return state;
      vote = input.option;
    } else {
      // Si vota un altro partecipante, mai sé stessi.
      if (q.kind !== "players" || input.target === playerId) return state;
      if (!state.participants.some((p) => p.id === input.target)) return state;
      vote = input.target;
    }

    if (meta.receivedAt > state.deadline + GRACE_MS) return state;
    const time = fairTime({ claimed: meta.claimedTime, receivedAt: meta.receivedAt, rtt: meta.rtt, openedAt: state.openedAt });
    if (time > state.deadline) return state;
    const previous = state.votes[playerId];
    if (previous && previous.time > time) return state;
    return { ...state, votes: { ...state.votes, [playerId]: { vote, time } } };
  },

  onTick(state, now) {
    return state.phase === "voting" && now >= state.deadline + GRACE_MS ? reveal(state) : state;
  },

  onHostCommand(state, _command, now) {
    if (state.phase === "voting") return reveal(state);
    if (state.phase === "reveal") {
      return state.index + 1 < state.cfg.questions.length ? open(state, state.index + 1, now) : { ...state, phase: "done" };
    }
    return state;
  },

  isFinished: (state) => state.phase === "done",
  result: (state) => rankByPoints(state.totals, state.participants.map((p) => p.id)),
  scores: (state) => totalsToScores(state.totals, "Sondaggio"),

  // I voti sono anonimi: schermo e telefoni vedono solo i totali alla rivelazione e il proprio voto.
  screenView(state) {
    if (state.phase === "done") return { phase: "done" as const };
    const q = state.cfg.questions[state.index]!;
    const name = (id: string) => state.participants.find((p) => p.id === id)?.nickname ?? "?";
    return {
      phase: state.phase,
      ...publicQuestion(state),
      voted: Object.keys(state.votes).length,
      playerCount: state.participants.length,
      ...(state.phase === "reveal" &&
        state.tally && {
          reveal: {
            bars: Object.entries(state.tally.counts)
              .map(([key, count]) => ({
                label: q.kind === "options" ? q.options[Number(key)]! : name(key),
                count,
                top: state.tally!.top.includes(key),
              }))
              .sort((a, b) => (q.kind === "players" ? b.count - a.count : 0)),
          },
        }),
    };
  },

  viewFor(state, playerId) {
    if (state.phase === "done") return { phase: "done" as const };
    const q = state.cfg.questions[state.index]!;
    const mine = state.votes[playerId]?.vote;
    return {
      phase: state.phase,
      ...publicQuestion(state),
      // Candidati per il voto a un giocatore: gli altri partecipanti (informazione pubblica).
      candidates: q.kind === "players" ? state.participants.filter((p) => p.id !== playerId).map((p) => ({ id: p.id, nickname: p.nickname })) : [],
      myVote: mine ?? null,
      ...(state.phase === "reveal" && { reveal: { earned: state.earned[playerId] ?? 0 } }),
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
        voted: Object.keys(state.votes).length,
        playerCount: state.participants.length,
      },
      actions: [
        {
          id: "next",
          label: state.phase === "voting" ? "Rivela i risultati" : state.index + 1 >= state.cfg.questions.length ? "Concludi" : "Prossima domanda",
          enabled: state.phase !== "done",
        },
      ],
    };
  },
};
