import { z } from "zod";
import { type MinigameType, type ParticipantInfo, fairTime } from "@gioco/shared";
import { rankByPoints, totalsToScores } from "../util.js";

/**
 * Finestra di raccolta: dopo la prima pressione ricevuta si aspetta questo tempo prima di decidere
 * chi ha vinto, così un telefono con rete lenta ma pressione precedente non viene scavalcato.
 */
export const COLLECT_WINDOW_MS = 250;

export const buzzerConfigSchema = z.object({
  questions: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(200).meta({ title: "Domanda", widget: "textarea" }),
        /** Visibile solo alla regia, che convalida la risposta data a voce. */
        answer: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .meta({ title: "Risposta (solo regia)", description: "Non viene mai mostrata a schermo né ai telefoni" }),
        points: z
          .number()
          .int()
          .min(1)
          .max(10_000)
          .optional()
          .meta({ title: "Punti", description: "Vuoto = punti predefiniti" }),
      }),
    )
    .min(1)
    .max(50)
    .meta({ title: "Domande", itemLabel: "Domanda" }),
  defaultPoints: z.number().int().min(1).max(10_000).default(100).meta({ title: "Punti predefiniti" }),
  wrongPenalty: z
    .number()
    .int()
    .min(0)
    .max(10_000)
    .default(50)
    .meta({ title: "Penalità per risposta sbagliata", description: "0 = nessuna penalità" }),
});

export type BuzzerConfig = z.infer<typeof buzzerConfigSchema>;

const inputSchema = z.object({ type: z.literal("buzz") });
const commandSchema = z.object({ type: z.enum(["open", "correct", "wrong", "skip", "next"]) });

type Input = z.infer<typeof inputSchema>;
type Command = z.infer<typeof commandSchema>;

interface Press {
  playerId: string;
  /** Ora equa (corretta per latenza) della pressione. */
  time: number;
  receivedAt: number;
}

export interface BuzzerState {
  cfg: BuzzerConfig;
  participants: ParticipantInfo[];
  index: number;
  /**
   * idle: domanda mostrata, buzzer non armato · open: armato · collecting: prima pressione ricevuta,
   * finestra aperta · answering: risponde `queue[current]` · resolved: domanda chiusa · done.
   */
  phase: "idle" | "open" | "collecting" | "answering" | "resolved" | "done";
  openedAt: number;
  collectUntil: number;
  /** Pressioni in ordine di merito (dopo la finestra) o di arrivo (durante). */
  queue: Press[];
  current: number;
  /** Chi ha già avuto la sua occasione in questa domanda (o ha premuto): non può ripremere. */
  locked: string[];
  /** Esito dell'ultima domanda risolta, per mostrarlo. */
  outcome: { playerId: string | null; points: number } | null;
  totals: Record<string, number>;
}

const byMerit = (a: Press, b: Press) =>
  a.time - b.time || a.receivedAt - b.receivedAt || a.playerId.localeCompare(b.playerId);

const nick = (s: BuzzerState, id: string | null | undefined) =>
  s.participants.find((p) => p.id === id)?.nickname ?? null;

const questionPoints = (s: BuzzerState) =>
  s.cfg.questions[s.index]!.points ?? s.cfg.defaultPoints;

function nextQuestion(s: BuzzerState): BuzzerState {
  if (s.index + 1 >= s.cfg.questions.length) return { ...s, phase: "done" };
  return {
    ...s,
    index: s.index + 1,
    phase: "idle",
    queue: [],
    current: 0,
    locked: [],
    outcome: null,
  };
}

function add(s: BuzzerState, playerId: string, delta: number): Record<string, number> {
  return { ...s.totals, [playerId]: (s.totals[playerId] ?? 0) + delta };
}

export const buzzer: MinigameType<BuzzerConfig, BuzzerState, Input, Command> = {
  id: "buzzer",
  title: "Buzzer",
  defaultTheme: "gameshow",
  configSchema: buzzerConfigSchema as unknown as z.ZodType<BuzzerConfig>,
  inputSchema,
  commandSchema,
  sampleConfig: {
    questions: [
      { text: "Chi ha dipinto la Gioconda?", answer: "Leonardo da Vinci" },
      { text: "Simbolo chimico dell'oro?", answer: "Au", points: 150 },
    ],
    defaultPoints: 100,
    wrongPenalty: 50,
  },

  init(config, ctx) {
    return {
      cfg: config,
      participants: ctx.players,
      index: 0,
      phase: "idle",
      openedAt: 0,
      collectUntil: 0,
      queue: [],
      current: 0,
      locked: [],
      outcome: null,
      totals: {},
    };
  },

  onInput(s, playerId, _input, meta) {
    if (s.phase !== "open" && s.phase !== "collecting" && s.phase !== "answering") return s;
    if (!s.participants.some((p) => p.id === playerId)) return s;
    if (s.locked.includes(playerId)) return s;

    const press: Press = {
      playerId,
      receivedAt: meta.receivedAt,
      time: fairTime({
        claimed: meta.claimedTime,
        receivedAt: meta.receivedAt,
        rtt: meta.rtt,
        openedAt: s.openedAt,
      }),
    };
    const locked = [...s.locked, playerId];

    if (s.phase === "open") {
      return { ...s, phase: "collecting", collectUntil: meta.receivedAt + COLLECT_WINDOW_MS, queue: [press], current: 0, locked };
    }
    if (s.phase === "collecting") return { ...s, queue: [...s.queue, press], locked };
    // answering: chi arriva tardi si accoda dopo chi sta rispondendo, in ordine di merito.
    const tail = [...s.queue.slice(s.current + 1), press].sort(byMerit);
    return { ...s, queue: [...s.queue.slice(0, s.current + 1), ...tail], locked };
  },

  onTick(s, now) {
    if (s.phase !== "collecting" || now < s.collectUntil) return s;
    return { ...s, phase: "answering", queue: [...s.queue].sort(byMerit), current: 0 };
  },

  onHostCommand(s, { type }, now) {
    switch (type) {
      case "open":
        return s.phase === "idle" ? { ...s, phase: "open", openedAt: now } : s;
      case "correct": {
        if (s.phase !== "answering") return s;
        const who = s.queue[s.current]!.playerId;
        const points = questionPoints(s);
        return { ...s, phase: "resolved", totals: add(s, who, points), outcome: { playerId: who, points } };
      }
      case "wrong": {
        if (s.phase !== "answering") return s;
        const who = s.queue[s.current]!.playerId;
        const totals = s.cfg.wrongPenalty > 0 ? add(s, who, -s.cfg.wrongPenalty) : s.totals;
        const current = s.current + 1;
        // Coda esaurita: il buzzer si riarma per chi non ha ancora avuto la sua occasione.
        if (current >= s.queue.length) return { ...s, phase: "open", openedAt: now, queue: [], current: 0, totals };
        return { ...s, current, totals };
      }
      case "skip":
        return s.phase === "idle" || s.phase === "open" || s.phase === "collecting" || s.phase === "answering"
          ? { ...s, phase: "resolved", outcome: { playerId: null, points: 0 } }
          : s;
      case "next":
        return s.phase === "resolved" ? nextQuestion(s) : s;
    }
  },

  isFinished: (s) => s.phase === "done",
  result: (s) =>
    rankByPoints(
      s.totals,
      s.participants.map((p) => p.id),
    ),
  scores: (s) => totalsToScores(s.totals, "Buzzer"),

  // La risposta giusta non compare mai nelle viste pubbliche: solo in `hostView`.
  screenView(s) {
    if (s.phase === "done") return { phase: "done" as const };
    const answeringId = s.phase === "answering" ? s.queue[s.current]?.playerId : undefined;
    return {
      phase: s.phase,
      index: s.index,
      total: s.cfg.questions.length,
      question: s.cfg.questions[s.index]!.text,
      answering: answeringId ? { playerId: answeringId, nickname: nick(s, answeringId) } : null,
      // Ordine di prenotazione, noto solo dopo la chiusura della finestra di raccolta.
      queue: s.phase === "answering" ? s.queue.map((p) => ({ playerId: p.playerId, nickname: nick(s, p.playerId) })) : [],
      current: s.current,
      winner: s.outcome ? { playerId: s.outcome.playerId, nickname: nick(s, s.outcome.playerId), points: s.outcome.points } : null,
    };
  },

  viewFor(s, playerId) {
    if (s.phase === "done") return { phase: "done" as const };
    const answeringId = s.phase === "answering" ? s.queue[s.current]?.playerId : undefined;
    const position = s.phase === "answering" ? s.queue.findIndex((p) => p.playerId === playerId) : -1;
    return {
      phase: s.phase,
      question: s.cfg.questions[s.index]!.text,
      canBuzz: (s.phase === "open" || s.phase === "collecting" || s.phase === "answering") && !s.locked.includes(playerId),
      buzzed: s.locked.includes(playerId),
      isAnswering: answeringId === playerId,
      /** Posizione in coda (0 = sta rispondendo), null se non ha prenotato. */
      position: position >= 0 ? position - s.current : null,
      won: s.outcome?.playerId === playerId,
    };
  },

  hostView(s) {
    const q = s.cfg.questions[s.index];
    const answering = s.phase === "answering";
    return {
      info: {
        phase: s.phase,
        index: s.index,
        total: s.cfg.questions.length,
        question: q?.text,
        answer: q?.answer,
        points: q ? questionPoints(s) : 0,
        answering: answering ? nick(s, s.queue[s.current]?.playerId) : null,
        queue: answering ? s.queue.map((p) => nick(s, p.playerId)) : [],
      },
      actions: [
        { id: "open", label: "Apri il buzzer", enabled: s.phase === "idle" },
        { id: "correct", label: "Risposta corretta", enabled: answering },
        { id: "wrong", label: "Risposta sbagliata", enabled: answering, danger: true },
        { id: "skip", label: "Salta la domanda", enabled: ["idle", "open", "collecting", "answering"].includes(s.phase), danger: true },
        {
          id: "next",
          label: s.index + 1 >= s.cfg.questions.length ? "Concludi" : "Prossima domanda",
          enabled: s.phase === "resolved",
        },
      ],
    };
  },
};
