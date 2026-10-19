import { z } from "zod";
import { type MinigameType, type ParticipantInfo, fairTime } from "@gioco/shared";
import { GRACE_MS, rankByPoints, totalsToScores } from "../util.js";
import { deriveSeed, makeRng, shuffle } from "../knight-duel/rng.js";
import { lookupWordList } from "../word-list.js";

const wordSchema = z.string().trim().min(1).max(60);

const orderField = z.enum(["random", "listed", "reverse"]).default("random").meta({
  title: "Ordine delle parole",
  enumLabels: {
    random: "Casuale (diverso a ogni round)",
    listed: "Quello della lista",
    reverse: "Dall'ultima alla prima",
  },
});
const startFromField = z.number().int().min(1).max(500).default(1).meta({
  title: "Parti dalla parola n°",
  description: "Solo con ordine «della lista» o «inverso»: per continuare da dove si era arrivati nel round precedente",
});

const settingsShape = {
  turns: z.number().int().min(1).max(20).default(1).meta({ title: "Turni", description: "Quante terne giocano in questo round: la regia sceglie i tre giocatori prima di ogni turno" }),
  timeSec: z.number().int().min(10).max(300).default(60).meta({ title: "Tempo per turno (s)" }),
  maxPasses: z.number().int().min(0).max(20).default(3).meta({ title: "Passate per turno", description: "Quante volte chi dà gli indizi può passare alla parola successiva" }),
  pointsPerWord: z.number().int().min(0).max(1000).default(1).meta({ title: "Punti per parola indovinata" }),
  errorPenalty: z.number().int().min(0).max(1000).default(1).meta({ title: "Penalità per errore", description: "Si perdono questi punti a ogni risposta sbagliata" }),
  extraTimeSec: z.number().int().min(1).max(120).default(10).meta({ title: "Tempo extra (s)", description: "Quanto aggiunge il pulsante «+ tempo» della regia" }),
  showWordOnScreen: z.boolean().default(true).meta({ title: "Parola sullo schermo", description: "Se spento la parola compare solo sui telefoni di chi dà gli indizi" }),
};

/** Configurazione completa con cui parte il plugin: le parole sono già risolte. */
export const reazioneConfigSchema = z.object({
  words: z.array(wordSchema).min(1).max(800).meta({ title: "Parole", itemLabel: "Parola" }),
  order: orderField,
  startFrom: startFromField,
  ...settingsShape,
});

/**
 * Istanza in libreria, come la compila l'admin: riferisce una lista di parole condivisa (e/o ne ha di proprie).
 * Lo stesso elenco può servire a più round, ciascuno con il suo ordine; all'avvio della partita `buildConfig`
 * lo risolve in `ReazioneConfig`.
 */
export const reazioneLibrarySchema = z
  .object({
    wordList: z.string().min(1).optional().meta({ title: "Lista di parole", widget: "instance", instanceKind: "word-list", description: "Contenuto della libreria, riusabile in più round" }),
    words: z.array(wordSchema).max(300).default([]).meta({ title: "Parole proprie di questo round", description: "In più rispetto alla lista (facoltative)", itemLabel: "Parola", widget: "lines" }),
    order: orderField,
    startFrom: startFromField,
    ...settingsShape,
  })
  .refine((c) => !!c.wordList || c.words.length > 0, { message: "Scegli una lista di parole o scrivine alcune", path: ["wordList"] });

export type ReazioneConfig = z.infer<typeof reazioneConfigSchema>;

/** Ordine in cui si pescano le parole (indici in `words`): sorteggiato col seme, oppure fisso a partire da `startFrom`. */
export function orderWords(words: readonly string[], order: ReazioneConfig["order"], startFrom: number, seed: number, seen: readonly string[] = []): number[] {
  const count = words.length;
  const idx = Array.from({ length: count }, (_, i) => i);
  let sequence: number[];
  if (order === "random") sequence = shuffle(idx, makeRng(seed));
  else {
    const base = order === "reverse" ? idx.reverse() : idx;
    const start = (startFrom - 1) % Math.max(1, count);
    sequence = [...base.slice(start), ...base.slice(0, start)];
  }
  // Le parole già mostrate nei round precedenti vanno in fondo: tornano solo quando le nuove sono finite.
  const used = new Set(seen.map((w) => w.toLowerCase()));
  const isNew = (i: number) => !used.has(words[i]!.toLowerCase());
  return [...sequence.filter(isNew), ...sequence.filter((i) => !isNew(i))];
}

const inputSchema = z.discriminatedUnion("type", [z.object({ type: z.literal("pass") }), z.object({ type: z.literal("buzz") })]);
const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pick"), giverA: z.string().min(1), giverB: z.string().min(1).nullable(), guesser: z.string().min(1) }),
  z.object({ type: z.literal("shuffle") }),
  z.object({ type: z.literal("begin") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("correct") }),
  z.object({ type: z.literal("wrong") }),
  z.object({ type: z.literal("skip") }),
  z.object({ type: z.literal("addTime"), seconds: z.number().int().min(1).max(300).optional() }),
  z.object({ type: z.literal("endTurn") }),
  z.object({ type: z.literal("next") }),
]);
type Input = z.infer<typeof inputSchema>;
type Command = z.infer<typeof commandSchema>;

export interface Trio {
  giverA: string | null;
  giverB: string | null;
  guesser: string | null;
}

export interface TurnRecord extends Trio {
  turn: number;
  correct: number;
  wrong: number;
  passes: number;
  points: number;
}

type EventKind = "begin" | "correct" | "wrong" | "pass" | "skip" | "buzz" | "pause" | "time" | "extra";

export interface ReazioneState {
  cfg: ReazioneConfig;
  participants: ParticipantInfo[];
  seed: number;
  /** setup: la regia sceglie la terna · playing: il tempo scorre · paused: tempo fermo · turn-over: turno finito · done. */
  phase: "setup" | "playing" | "paused" | "turn-over" | "done";
  /** Perché il tempo è fermo: «answer» il giocatore ha premuto, «pass» una passata, «ready» in attesa del via, «host» pausa della regia. */
  pauseReason: "answer" | "pass" | "ready" | "host" | null;
  turnIndex: number;
  rerolls: number;
  trio: Trio;
  /** Ordine casuale delle parole (indici in `cfg.words`) e posizione corrente. */
  order: number[];
  cursor: number;
  /** La parola corrente è già stata data via dalla regia? Finché no, nessuno (tranne la regia) la vede. */
  wordShown: boolean;
  /** Parole già mostrate (a chi dà gli indizi) in questo round: servono a non riproporle nei round dopo. */
  shown: string[];
  /** Inizio del tratto di tempo in corso (serve all'ora equa dei tasti). */
  segmentStart: number;
  deadline: number;
  timeLeftMs: number;
  totalMs: number;
  correct: number;
  wrong: number;
  passes: number;
  passesLeft: number;
  /** Ultimo evento del turno: `n` cresce a ogni evento, così le viste sanno quando suonare. */
  lastEvent: { n: number; kind: EventKind; word?: string } | null;
  history: TurnRecord[];
  totals: Record<string, number>;
}

const isActive = (s: ReazioneState) => s.phase === "playing" || s.phase === "paused";
const wordAt = (s: ReazioneState, cursor: number) => s.cfg.words[s.order[cursor % s.order.length]!]!;
const currentWord = (s: ReazioneState) => wordAt(s, s.cursor);
const trioIds = (t: Trio) => [t.giverA, t.giverB, t.guesser].filter((id): id is string => id !== null);
const turnNet = (s: ReazioneState) => s.correct * s.cfg.pointsPerWord - s.wrong * s.cfg.errorPenalty;

function withEvent(s: ReazioneState, kind: EventKind, word?: string): ReazioneState {
  return { ...s, lastEvent: { n: (s.lastEvent?.n ?? 0) + 1, kind, ...(word !== undefined && { word }) } };
}

/** Terna proposta: chi ha giocato meno, a sorte tra pari; `rerolls` cambia la sorte per «Sorteggia ancora». */
function propose(s: Pick<ReazioneState, "participants" | "history" | "seed">, turnIndex: number, rerolls: number): Trio {
  const played: Record<string, number> = {};
  for (const h of s.history) for (const id of trioIds(h)) played[id] = (played[id] ?? 0) + 1;
  const rng = makeRng(deriveSeed(s.seed, turnIndex * 997 + rerolls));
  const ids = shuffle(s.participants.map((p) => p.id), rng).sort((a, b) => (played[a] ?? 0) - (played[b] ?? 0));
  if (ids.length >= 3) return { giverA: ids[0]!, giverB: ids[1]!, guesser: ids[2]! };
  return { giverA: ids[0] ?? null, giverB: null, guesser: ids[1] ?? null };
}

function setupTurn(s: ReazioneState, turnIndex: number): ReazioneState {
  return {
    ...s,
    phase: "setup",
    pauseReason: null,
    turnIndex,
    rerolls: 0,
    trio: propose(s, turnIndex, 0),
    wordShown: false,
    correct: 0,
    wrong: 0,
    passes: 0,
    passesLeft: s.cfg.maxPasses,
    lastEvent: null,
    timeLeftMs: s.cfg.timeSec * 1000,
    totalMs: s.cfg.timeSec * 1000,
  };
}

/** Chiude il turno: registra la cronologia e assegna il netto (parole giuste − errori) a tutti e tre. */
function endTurn(s: ReazioneState, kind: EventKind | null): ReazioneState {
  const net = turnNet(s);
  const totals = { ...s.totals };
  for (const id of trioIds(s.trio)) totals[id] = (totals[id] ?? 0) + net;
  const record: TurnRecord = { ...s.trio, turn: s.turnIndex + 1, correct: s.correct, wrong: s.wrong, passes: s.passes, points: net };
  const ended: ReazioneState = { ...s, phase: "turn-over", pauseReason: null, wordShown: false, timeLeftMs: 0, history: [...s.history, record], totals };
  return kind ? withEvent(ended, kind) : ended;
}

/** Ferma il tempo all'istante `at` (ora equa del tasto, o `now` per la regia). */
function stopAt(s: ReazioneState, at: number, reason: NonNullable<ReazioneState["pauseReason"]>): ReazioneState {
  return { ...s, phase: "paused", pauseReason: reason, timeLeftMs: Math.max(0, s.deadline - at) };
}

/** Passa alla parola dopo: resta in pausa e nascosta finché la regia non dà il via. */
/** Dà via la parola corrente e la annota tra quelle mostrate. */
function revealWord(s: ReazioneState): ReazioneState {
  const word = currentWord(s);
  return { ...s, wordShown: true, shown: s.shown.includes(word) ? s.shown : [...s.shown, word] };
}

function loadNext(s: ReazioneState, reason: "pass" | "ready" = "ready"): ReazioneState {
  return { ...s, cursor: s.cursor + 1, wordShown: false, pauseReason: reason, phase: "paused" };
}

function liveTotals(s: ReazioneState): Record<string, number> {
  if (!isActive(s)) return s.totals;
  const net = turnNet(s);
  const totals = { ...s.totals };
  for (const id of trioIds(s.trio)) totals[id] = (totals[id] ?? 0) + net;
  return totals;
}

function nameOf(s: ReazioneState, id: string | null) {
  const p = id ? s.participants.find((x) => x.id === id) : undefined;
  return p ? { id: p.id, nickname: p.nickname } : null;
}

function publicTurn(s: ReazioneState) {
  return {
    turn: s.turnIndex + 1,
    turns: s.cfg.turns,
    trio: { giverA: nameOf(s, s.trio.giverA), giverB: nameOf(s, s.trio.giverB), guesser: nameOf(s, s.trio.guesser) },
  };
}

function timing(s: ReazioneState) {
  return {
    running: s.phase === "playing",
    deadline: s.phase === "playing" ? s.deadline : null,
    timeLeftMs: s.phase === "playing" ? null : s.timeLeftMs,
    totalMs: s.totalMs,
  };
}

function counters(s: ReazioneState) {
  return { correct: s.correct, wrong: s.wrong, passes: s.passes, passesLeft: s.passesLeft, points: turnNet(s) };
}

/** Evento pubblico: la parola compare solo per giusta/sbagliata (è appena stata detta), mai per le altre. */
const publicEvent = (s: ReazioneState) => s.lastEvent;

const summary = (s: ReazioneState) =>
  s.history.map((h) => ({ turn: h.turn, correct: h.correct, wrong: h.wrong, passes: h.passes, points: h.points, players: trioIds(h).map((id) => nameOf(s, id)!.nickname) }));

export const reazioneACatena: MinigameType<ReazioneConfig, ReazioneState, Input, Command> = {
  id: "reazione-a-catena",
  title: "Reazione a catena",
  defaultTheme: "gameshow",
  configSchema: reazioneConfigSchema as unknown as z.ZodType<ReazioneConfig>,
  inputSchema,
  commandSchema,
  master: true,

  // Istanza in libreria (con la lista di parole condivisa) e sua traduzione in configurazione completa all'avvio.
  libraryConfigSchema: reazioneLibrarySchema as unknown as z.ZodType<unknown>,
  draftLibraryConfig: { words: [], order: "random" },
  buildConfig(raw, lookup) {
    const parsed = reazioneLibrarySchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`).join("; ") };
    const { wordList, words: own, ...rest } = parsed.data;
    let words: string[] = [];
    if (wordList) {
      const list = lookupWordList(lookup, wordList);
      if (!list) return { ok: false, error: "Lista di parole non valida o non trovata" };
      words = list;
    }
    // Senza doppioni (anche se scritti con maiuscole diverse): una parola ripetuta tornerebbe a turno ravvicinato.
    const seen = new Set<string>();
    const merged = [...words, ...own].filter((w) => !seen.has(w.toLowerCase()) && seen.add(w.toLowerCase()));
    if (merged.length === 0) return { ok: false, error: "nessuna parola disponibile" };
    return { ok: true, config: reazioneConfigSchema.parse({ ...rest, words: merged }) };
  },

  sampleConfig: {
    words: ["Pizza", "Spiaggia", "Telefono", "Montagna", "Chitarra", "Gelato", "Aeroplano", "Biblioteca"],
    order: "random",
    startFrom: 1,
    turns: 1,
    timeSec: 60,
    maxPasses: 3,
    pointsPerWord: 1,
    errorPenalty: 1,
    extraTimeSec: 10,
    showWordOnScreen: true,
  },

  init(config, ctx, now) {
    const order = orderWords(config.words, config.order, config.startFrom, ctx.seed, ctx.seen);
    const base: ReazioneState = {
      cfg: config,
      participants: ctx.players,
      seed: ctx.seed,
      phase: "setup",
      pauseReason: null,
      turnIndex: 0,
      rerolls: 0,
      trio: { giverA: null, giverB: null, guesser: null },
      order,
      cursor: 0,
      wordShown: false,
      shown: [],
      segmentStart: now,
      deadline: now,
      timeLeftMs: config.timeSec * 1000,
      totalMs: config.timeSec * 1000,
      correct: 0,
      wrong: 0,
      passes: 0,
      passesLeft: config.maxPasses,
      lastEvent: null,
      history: [],
      totals: {},
    };
    return setupTurn(base, 0);
  },

  onInput(state, playerId, input, meta) {
    if (state.phase !== "playing") return state;
    const isGiver = playerId === state.trio.giverA || playerId === state.trio.giverB;
    if (input.type === "pass" ? !isGiver || state.passesLeft <= 0 : playerId !== state.trio.guesser) return state;
    if (meta.receivedAt > state.deadline + GRACE_MS) return state;
    const time = fairTime({ claimed: meta.claimedTime, receivedAt: meta.receivedAt, rtt: meta.rtt, openedAt: state.segmentStart });
    if (time > state.deadline) return state;
    if (input.type === "buzz") return withEvent(stopAt(state, time, "answer"), "buzz");
    // La passata ferma il tempo e carica la parola dopo, che resta nascosta fino al via della regia.
    const stopped = stopAt(state, time, "pass");
    return withEvent(loadNext({ ...stopped, passes: state.passes + 1, passesLeft: state.passesLeft - 1 }, "pass"), "pass");
  },

  onTick(state, now) {
    if (state.phase === "playing" && now >= state.deadline + GRACE_MS) return endTurn(state, "time");
    return state;
  },

  onHostCommand(state, command, now) {
    switch (command.type) {
      case "pick": {
        if (state.phase !== "setup") return state;
        const ids = [command.giverA, command.giverB, command.guesser].filter((id): id is string => id !== null);
        if (new Set(ids).size !== ids.length || ids.some((id) => !state.participants.some((p) => p.id === id))) return state;
        return { ...state, trio: { giverA: command.giverA, giverB: command.giverB, guesser: command.guesser } };
      }
      case "shuffle": {
        if (state.phase !== "setup") return state;
        const rerolls = state.rerolls + 1;
        return { ...state, rerolls, trio: propose(state, state.turnIndex, rerolls) };
      }
      case "begin": {
        if (state.phase !== "setup" || !state.trio.giverA || !state.trio.guesser) return state;
        const ms = state.cfg.timeSec * 1000;
        return withEvent(revealWord({ ...state, phase: "playing", pauseReason: null, segmentStart: now, deadline: now + ms, timeLeftMs: ms, totalMs: ms }), "begin");
      }
      case "resume": {
        if (state.phase !== "paused") return state;
        // Il tempo era già finito quando è stato premuto il tasto: dopo il giudizio il turno si chiude.
        if (state.timeLeftMs <= 0) return endTurn(state, "time");
        return withEvent(revealWord({ ...state, phase: "playing", pauseReason: null, segmentStart: now, deadline: now + state.timeLeftMs }), "begin");
      }
      case "pause":
        return state.phase === "playing" ? withEvent(stopAt(state, now, "host"), "pause") : state;
      case "correct":
      case "wrong": {
        if (!isActive(state) || !state.wordShown) return state;
        const stopped = state.phase === "playing" ? stopAt(state, now, "ready") : state;
        const word = currentWord(state);
        const judged = command.type === "correct" ? { ...stopped, correct: stopped.correct + 1 } : { ...stopped, wrong: stopped.wrong + 1 };
        // Se il tempo era già finito (tasto premuto all'ultimo istante) il turno si chiude subito dopo il giudizio.
        if (judged.timeLeftMs <= 0) return endTurn(withEvent(judged, command.type, word), "time");
        return withEvent(loadNext(judged), command.type, word);
      }
      case "skip": {
        if (!isActive(state)) return state;
        const stopped = state.phase === "playing" ? stopAt(state, now, "ready") : state;
        return withEvent(loadNext(stopped), "skip");
      }
      case "addTime": {
        const ms = (command.seconds ?? state.cfg.extraTimeSec) * 1000;
        if (state.phase === "playing") return withEvent({ ...state, deadline: state.deadline + ms, totalMs: state.totalMs + ms }, "extra");
        if (state.phase === "paused") return withEvent({ ...state, timeLeftMs: state.timeLeftMs + ms, totalMs: state.totalMs + ms }, "extra");
        return state;
      }
      case "endTurn":
        return isActive(state) ? endTurn(state, null) : state;
      case "next": {
        // Da «setup» il turno si salta (ad esempio con troppo pochi giocatori): niente punti, si passa oltre.
        if (state.phase !== "setup" && state.phase !== "turn-over") return state;
        return state.turnIndex + 1 < state.cfg.turns ? setupTurn(state, state.turnIndex + 1) : { ...state, phase: "done" };
      }
    }
  },

  shownItems: (state) => state.shown,
  isFinished: (state) => state.phase === "done",
  result: (state) => rankByPoints(liveTotals(state), state.participants.map((p) => p.id)),
  scores: (state) => totalsToScores(liveTotals(state), "Reazione a catena"),

  // La parola corrente compare solo se è stata data via, e sullo schermo solo se la configurazione lo prevede.
  screenView(state) {
    if (state.phase === "done") return { phase: "done" as const, history: summary(state) };
    const showWord = state.cfg.showWordOnScreen && state.wordShown && isActive(state);
    return {
      phase: state.phase,
      pauseReason: state.pauseReason,
      ...publicTurn(state),
      ...timing(state),
      ...counters(state),
      wordShown: state.wordShown && isActive(state),
      word: showWord ? currentWord(state) : null,
      event: publicEvent(state),
      history: summary(state),
    };
  },

  viewFor(state, playerId) {
    if (state.phase === "done") return { phase: "done" as const, history: summary(state) };
    const role = playerId === state.trio.guesser ? "guesser" : playerId === state.trio.giverA || playerId === state.trio.giverB ? "giver" : "spectator";
    const showWord = role === "giver" && state.wordShown && isActive(state);
    return {
      phase: state.phase,
      pauseReason: state.pauseReason,
      role: state.phase === "setup" ? "spectator" : role,
      ...publicTurn(state),
      ...timing(state),
      ...counters(state),
      wordShown: state.wordShown && isActive(state),
      word: showWord ? currentWord(state) : null,
      event: publicEvent(state),
      history: summary(state),
    };
  },

  hostView(state) {
    const can = {
      begin: state.phase === "setup" && !!state.trio.giverA && !!state.trio.guesser,
      judge: isActive(state) && state.wordShown,
    };
    return {
      info: {
        phase: state.phase,
        pauseReason: state.pauseReason,
        participants: state.participants.map((p) => ({ id: p.id, nickname: p.nickname })),
        trioIds: state.trio,
        ...publicTurn(state),
        ...timing(state),
        ...counters(state),
        wordShown: state.wordShown,
        /** Per la regia: la parola corrente anche se non è ancora stata data via. */
        word: isActive(state) ? currentWord(state) : null,
        extraTimeSec: state.cfg.extraTimeSec,
        event: state.lastEvent,
        history: summary(state),
      },
      actions: [
        { id: "begin", label: "Via!", enabled: can.begin },
        { id: "resume", label: state.wordShown ? "Riprendi" : "Via alla parola", enabled: state.phase === "paused" },
        { id: "correct", label: "Giusta", enabled: can.judge },
        { id: "wrong", label: "Sbagliata", enabled: can.judge },
        { id: "skip", label: "Parola successiva", enabled: isActive(state) },
        { id: "pause", label: "Ferma il tempo", enabled: state.phase === "playing" },
        { id: "addTime", label: `+ ${state.cfg.extraTimeSec} s`, enabled: isActive(state) },
        { id: "shuffle", label: "Sorteggia ancora", enabled: state.phase === "setup" },
        { id: "next", label: state.phase === "setup" ? "Salta il turno" : state.turnIndex + 1 >= state.cfg.turns ? "Concludi" : "Prossimo turno", enabled: state.phase === "turn-over" || state.phase === "setup" },
        { id: "endTurn", label: "Chiudi il turno", enabled: isActive(state), danger: true },
      ],
    };
  },
};
