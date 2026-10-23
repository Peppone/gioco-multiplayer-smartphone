import { z } from "zod";
import type { MinigameType, ParticipantInfo, ScoreDelta } from "@gioco/shared";
import { makeRng, shuffle } from "../knight-duel/rng.js";
import { rankByPoints } from "../util.js";
import { lookupWordList } from "../word-list.js";

/**
 * Parole Mannare: deduzione sociale in stile Werewords, senza scatola.
 * Il Sindaco sceglie in segreto una parola e risponde ad alta voce alle domande dei compagni assegnando gettoni dal
 * telefono. Tra i giocatori si nascondono i Lupi, che conoscono la parola e cercano di sviare, e il Veggente, che
 * la conosce e cerca di aiutare senza farsi scoprire. Indovinata la parola, i Lupi tentano di trovare il Veggente;
 * altrimenti tutti votano chi è il Lupo. In caso di pareggio c'è un ballottaggio. Regole in docs/PIANO-PAROLE-MANNARE.md.
 */

export type Role = "werewolf" | "seer" | "villager";
export type Token = "yes" | "no" | "maybe" | "close" | "far" | "correct";
export type Phase = "deal" | "word" | "night" | "questions" | "correct-grace" | "seer-hunt" | "werewolf-vote" | "reveal" | "done";
export type Winner = "village" | "werewolves";

const DIFFICULTIES = ["facile", "media", "difficile"] as const;
const MAX_WORD_LENGTH = 30;
const sec = (title: string, description?: string) => ({ title, ...(description && { description }) });

const wordSchema = z.object({
  text: z.string().trim().min(1).max(MAX_WORD_LENGTH).meta({ title: "Parola" }),
  difficulty: z.enum(DIFFICULTIES).default("media").meta({ title: "Difficoltà" }),
});

export const DEFAULT_WORDS: { text: string; difficulty: (typeof DIFFICULTIES)[number] }[] = [
  ...["Pizza", "Cane", "Mare", "Scarpa", "Sole", "Libro", "Gelato", "Bicicletta"].map((text) => ({ text, difficulty: "facile" as const })),
  ...["Faro", "Ombrello", "Biblioteca", "Violino", "Vulcano", "Orologio", "Mercato", "Tramonto"].map((text) => ({ text, difficulty: "media" as const })),
  ...["Nostalgia", "Labirinto", "Burocrazia", "Eclissi", "Equilibrio", "Ingranaggio", "Miraggio", "Prospettiva"].map((text) => ({ text, difficulty: "difficile" as const })),
];

const settingsShape = {
    difficulty: z.enum(["facile", "media", "difficile", "mista"]).default("media").meta({ ...sec("Difficoltà", "Da quale gruppo si estraggono le proposte"), enumLabels: { facile: "Facile", media: "Media", difficile: "Difficile", mista: "Mista" } }),
    wordChoices: z.number().int().min(1).max(4).default(3).meta(sec("Parole proposte al Sindaco")),
    wordPickSeconds: z.number().int().min(5).max(120).default(20).meta(sec("Tempo per scegliere la parola (s)", "Allo scadere sceglie il server")),
    nightSeconds: z.number().int().min(5).max(120).default(15).meta(sec("Tempo per guardare il proprio ruolo (s)")),
    questionSeconds: z.number().int().min(30).max(900).default(240).meta(sec("Durata delle domande (s)")),
    yesNoPool: z.number().int().min(1).max(200).default(36).meta(sec("Riserva comune di Sì e No", "Quando finisce, le domande terminano")),
    maybePool: z.number().int().min(0).max(100).default(12).meta(sec("Riserva di «Forse»", "0 = niente Forse")),
    maybeUnlimited: z.boolean().default(false).meta(sec("«Forse» illimitati")),
    closeTokens: z.number().int().min(0).max(3).default(1).meta(sec("Gettoni «Ci sei quasi»", "0 = disattivato")),
    farTokens: z.number().int().min(0).max(3).default(1).meta(sec("Gettoni «Lontanissimo»", "0 = disattivato")),
    werewolves: z.enum(["auto", "1", "2", "3"]).default("auto").meta({ ...sec("Lupi", "Automatico: 1 da 4 a 6 giocatori, 2 da 7 a 11, 3 con 12. Un numero fisso viene ridotto se lascerebbe meno di 3 non-Lupi"), enumLabels: { auto: "Automatico", "1": "1", "2": "2", "3": "3" } }),
    correctGraceSeconds: z.number().int().min(0).max(30).default(5).meta(sec("Finestra per annullare un «Esatto» (s)")),
    seerHuntSeconds: z.number().int().min(5).max(180).default(30).meta(sec("Tempo dei Lupi per trovare il Veggente (s)")),
    voteSeconds: z.number().int().min(10).max(300).default(60).meta(sec("Discussione e voto sul Lupo (s)")),
    runoffSeconds: z.number().int().min(5).max(120).default(30).meta(sec("Durata di un ballottaggio (s)")),
    winPoints: z.number().int().min(0).max(10_000).default(100).meta(sec("Punti a ogni membro della fazione vincitrice")),
    mayorBonus: z.number().int().min(0).max(10_000).default(0).meta(sec("Bonus al Sindaco della fazione vincitrice")),
};

const enoughWords = (c: { words: { difficulty: string }[]; difficulty: string; wordChoices: number }) =>
  (c.difficulty === "mista" ? c.words.length : c.words.filter((w) => w.difficulty === c.difficulty).length) >= c.wordChoices;
const ENOUGH = "Servono almeno tante parole della difficoltà scelta quante ne vede il Sindaco";

/** Configurazione completa con cui parte il plugin: le parole sono già risolte (lista della libreria più quelle proprie). */
export const paroleMannareConfigSchema = z
  .object({
    words: z.array(wordSchema).min(3).max(500).default(DEFAULT_WORDS).meta({ title: "Parole", itemLabel: "Parola", description: "Le parole che il Sindaco può scegliere. Almeno tre per la difficoltà usata" }),
    ...settingsShape,
  })
  .refine(enoughWords, { message: ENOUGH, path: ["words"] });

export type ParoleMannareConfig = z.infer<typeof paroleMannareConfigSchema>;

/**
 * Istanza in libreria, come la compila la regia: le parole possono stare in una «Lista di parole» della libreria
 * (importata o incollata una volta, riusabile in più round e in altri giochi) e/o nell'istanza stessa. Le parole della
 * lista non hanno difficoltà: prendono quella scelta qui. All'avvio della partita `buildConfig` le risolve.
 */
export const paroleMannareLibrarySchema = z
  .object({
    wordList: z
      .string()
      .min(1)
      .optional()
      .meta({ title: "Lista di parole", widget: "instance", instanceKind: "word-list", description: `Contenuto della libreria, riusabile in più round. Le parole più lunghe di ${MAX_WORD_LENGTH} lettere si saltano` }),
    wordListDifficulty: z
      .enum(DIFFICULTIES)
      .default("media")
      .meta({ ...sec("Difficoltà delle parole della lista", "Le liste non distinguono la difficoltà: tutte le sue parole prendono questa"), enumLabels: { facile: "Facile", media: "Media", difficile: "Difficile" } }),
    words: z.array(wordSchema).max(300).default([]).meta({ title: "Parole proprie di questa istanza", description: "In più rispetto alla lista, ognuna con la sua difficoltà", itemLabel: "Parola" }),
    ...settingsShape,
  })
  .refine((c) => !!c.wordList || (c.words.length >= 3 && enoughWords(c)), { message: `Scegli una lista di parole, oppure scrivine qui: ${ENOUGH.toLowerCase()} (almeno 3 in tutto)`, path: ["wordList"] });

/** Parole proprie (con la loro difficoltà) e della lista (con quella scelta), senza doppioni né parole troppo lunghe. Le proprie vincono. */
export function mergeWords(own: z.infer<typeof wordSchema>[], listWords: string[], listDifficulty: (typeof DIFFICULTIES)[number]): z.infer<typeof wordSchema>[] {
  const seen = new Set<string>();
  return [...own, ...listWords.map((text) => ({ text, difficulty: listDifficulty }))]
    .map((w) => ({ ...w, text: w.text.trim() }))
    .filter((w) => w.text.length > 0 && w.text.length <= MAX_WORD_LENGTH)
    .filter((w) => !seen.has(w.text.toLowerCase()) && !!seen.add(w.text.toLowerCase()));
}

const tokenSchema = z.enum(["yes", "no", "maybe", "close", "far", "correct"]);
const inputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pick-word"), index: z.number().int().min(0).max(9) }),
  z.object({ type: z.literal("seen") }),
  z.object({ type: z.literal("give"), playerId: z.string().min(1).max(64), token: tokenSchema }),
  z.object({ type: z.literal("undo") }),
  z.object({ type: z.literal("vote"), targetId: z.string().min(1).max(64) }),
]);
const commandSchema = z.discriminatedUnion("type", [
  /** Senza `playerId` passa al giocatore successivo (è il pulsante «Cambia Sindaco»). */
  z.object({ type: z.literal("set-mayor"), playerId: z.string().min(1).max(64).optional() }),
  z.object({ type: z.literal("deal") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("undo") }),
  z.object({ type: z.literal("end-questions") }),
  z.object({ type: z.literal("close-vote") }),
  z.object({ type: z.literal("next") }),
]);
type Input = z.infer<typeof inputSchema>;
type Command = z.infer<typeof commandSchema>;

export interface TokenEntry {
  /** Crescente, mai riusato (anche dopo un annulla). */
  seq: number;
  playerId: string;
  token: Token;
  at: number;
  /** Annullato: resta nel registro per gli avvisi, ma non conta. */
  undone: boolean;
}

export interface ParoleMannareState {
  cfg: ParoleMannareConfig;
  seed: number;
  participants: ParticipantInfo[];
  /** Ordine fisso dei giocatori, usato da TV e telefono del Sindaco. */
  players: string[];
  mayorId: string;
  roles: Record<string, Role>;
  wordOptions: string[];
  word: string | null;
  log: TokenEntry[];
  nextSeq: number;
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
  /** Tempo che restava alle domande quando è arrivato l'«Esatto». */
  resumeMs: number;
  correctBy: string | null;
  seenBy: string[];
  /** Voto sul Lupo o scelta dei Lupi sul Veggente: votante → candidato. */
  votes: Record<string, string>;
  /** Candidati del ballottaggio in corso (null = primo voto). */
  runoff: string[] | null;
  outcome: { winner: Winner; reason: string } | null;
}

const nick = (s: ParoleMannareState, id: string) => s.participants.find((p) => p.id === id)?.nickname ?? "?";
const idsWith = (s: ParoleMannareState, role: Role) => s.players.filter((id) => s.roles[id] === role);

/** Lupi automatici: 1 da 4 a 6 giocatori, 2 da 7 a 11, 3 con 12 (sempre tra il 17% e il 29%). */
export function autoWerewolves(players: number): number {
  return players >= 12 ? 3 : players >= 7 ? 2 : 1;
}

/** Numero di Lupi della partita: quello scelto, ridotto se lascerebbe meno di 3 non-Lupi. Con 2–3 giocatori resta 1. */
export function werewolfCount(setting: ParoleMannareConfig["werewolves"], players: number): number {
  const wanted = setting === "auto" ? autoWerewolves(players) : Number(setting);
  return Math.max(Math.min(1, players - 1), Math.min(wanted, players - 3));
}

// ---- Registro dei gettoni: conteggi e riserve sono funzioni pure del registro ----

const live = (s: ParoleMannareState) => s.log.filter((e) => !e.undone);
const used = (s: ParoleMannareState, ...tokens: Token[]) => live(s).filter((e) => tokens.includes(e.token)).length;

export type TokenCounts = Record<"yes" | "no" | "maybe", number>;

/** Gettoni ricevuti da ogni giocatore (Sì, No, Forse); «Ci sei quasi» e «Lontanissimo» sono in `special`. */
export function playerSummary(s: ParoleMannareState, id: string): TokenCounts & { close: number; far: number } {
  const mine = live(s).filter((e) => e.playerId === id);
  const n = (t: Token) => mine.filter((e) => e.token === t).length;
  return { yes: n("yes"), no: n("no"), maybe: n("maybe"), close: n("close"), far: n("far") };
}

export interface Reserves {
  /** Sì/No rimasti nella riserva comune. */
  yesNo: number;
  /** Forse rimasti (`null` = illimitati). */
  maybe: number | null;
  close: number;
  far: number;
}

export function reserves(s: ParoleMannareState): Reserves {
  const { cfg } = s;
  return {
    yesNo: Math.max(0, cfg.yesNoPool - used(s, "yes", "no")),
    maybe: cfg.maybeUnlimited ? null : Math.max(0, cfg.maybePool - used(s, "maybe")),
    close: Math.max(0, cfg.closeTokens - used(s, "close")),
    far: Math.max(0, cfg.farTokens - used(s, "far")),
  };
}

function available(s: ParoleMannareState, token: Token): boolean {
  const r = reserves(s);
  switch (token) {
    case "yes":
    case "no":
      return r.yesNo > 0;
    case "maybe":
      return r.maybe === null || r.maybe > 0;
    case "close":
      return r.close > 0;
    case "far":
      return r.far > 0;
    case "correct":
      return true;
  }
}

const lastLive = (s: ParoleMannareState) => live(s).at(-1) ?? null;

// ---- Fasi e tempo ----

function enter(s: ParoleMannareState, phase: Phase, now: number, seconds: number | null): ParoleMannareState {
  return { ...s, phase, phaseStartedAt: now, phaseEndsAt: seconds === null ? null : now + seconds * 1000, pausedRemainingMs: null };
}

const TIMED: Phase[] = ["word", "night", "questions", "correct-grace", "seer-hunt", "werewolf-vote"];

function startVoting(s: ParoleMannareState, now: number): ParoleMannareState {
  return { ...enter(s, "werewolf-vote", now, s.cfg.voteSeconds), votes: {}, runoff: null };
}

function startQuestions(s: ParoleMannareState, now: number): ParoleMannareState {
  return enter(s, "questions", now, s.cfg.questionSeconds);
}

function pickWord(s: ParoleMannareState, index: number, now: number): ParoleMannareState {
  const word = s.wordOptions[index];
  if (word === undefined) return s;
  return startNight({ ...s, word }, now);
}

function startNight(s: ParoleMannareState, now: number): ParoleMannareState {
  return { ...enter(s, "night", now, s.cfg.nightSeconds), seenBy: [] };
}

/** Fine delle domande (tempo scaduto, Sì/No finiti o regia): si vota chi è il Lupo. */
function endQuestions(s: ParoleMannareState, now: number): ParoleMannareState {
  return startVoting(s, now);
}

function finish(s: ParoleMannareState, winner: Winner, reason: string, now: number): ParoleMannareState {
  return { ...enter(s, "reveal", now, null), outcome: { winner, reason } };
}

/** Candidato più votato: un solo nome, oppure i pari (vuoto se nessun voto valido). */
function topVoted(votes: Record<string, string>, voters: string[]): string[] {
  const tally: Record<string, number> = {};
  for (const v of voters) {
    const t = votes[v];
    if (t) tally[t] = (tally[t] ?? 0) + 1;
  }
  const max = Math.max(0, ...Object.values(tally));
  if (max === 0) return [];
  return Object.keys(tally).filter((id) => tally[id] === max);
}

const voters = (s: ParoleMannareState): string[] => (s.phase === "seer-hunt" ? idsWith(s, "werewolf") : s.players);

/** Chi si può votare in questa fase (e nel ballottaggio solo i candidati pari). */
export function voteTargets(s: ParoleMannareState, voterId: string): string[] {
  const base = s.phase === "seer-hunt" ? s.players.filter((id) => s.roles[id] !== "werewolf") : s.players;
  const pool = s.runoff ? base.filter((id) => s.runoff!.includes(id)) : base;
  return pool.filter((id) => id !== voterId);
}

/** Chiude un voto: assegna l'esito, oppure apre un ballottaggio se ci sono pari al primo voto. */
function closeVote(s: ParoleMannareState, now: number): ParoleMannareState {
  if (s.phase !== "seer-hunt" && s.phase !== "werewolf-vote") return s;
  const top = topVoted(s.votes, voters(s));
  if (top.length > 1 && !s.runoff) {
    const seconds = s.cfg.runoffSeconds;
    return { ...enter(s, s.phase, now, seconds), votes: {}, runoff: top };
  }
  if (s.phase === "seer-hunt") {
    if (top.length === 1 && s.roles[top[0]!] === "seer") return finish(s, "werewolves", "I Lupi hanno trovato il Veggente", now);
    return finish(s, "village", top.length === 1 ? "Parola indovinata, Veggente salvo" : "Parola indovinata: i Lupi non hanno trovato il Veggente", now);
  }
  if (top.length === 1) {
    return s.roles[top[0]!] === "werewolf"
      ? finish(s, "village", "Il Lupo è stato scoperto", now)
      : finish(s, "werewolves", "Il villaggio ha accusato un innocente", now);
  }
  return finish(s, "werewolves", top.length === 0 ? "Nessuno ha votato" : "Il villaggio non ha deciso", now);
}

function allVoted(s: ParoleMannareState): boolean {
  return voters(s).every((id) => s.votes[id] !== undefined);
}

// ---- Gettoni ----

function give(s: ParoleMannareState, playerId: string, token: Token, at: number): ParoleMannareState {
  if (s.phase !== "questions" || s.pausedRemainingMs !== null) return s;
  if (s.phaseEndsAt !== null && at >= s.phaseEndsAt) return s;
  if (playerId === s.mayorId || !s.roles[playerId]) return s;
  if (!available(s, token)) return s;
  const entry: TokenEntry = { seq: s.nextSeq, playerId, token, at, undone: false };
  let next: ParoleMannareState = { ...s, log: [...s.log, entry], nextSeq: s.nextSeq + 1 };
  if (token === "correct") {
    const resumeMs = Math.max(0, (s.phaseEndsAt ?? at) - at);
    return { ...enter(next, "correct-grace", at, next.cfg.correctGraceSeconds), correctBy: playerId, resumeMs };
  }
  if ((token === "yes" || token === "no") && reserves(next).yesNo === 0) next = endQuestions(next, at);
  return next;
}

/** Annulla l'ultima voce viva del registro. Un «Esatto» annullato riporta alle domande col tempo che restava. */
function undo(s: ParoleMannareState, now: number, byHost: boolean): ParoleMannareState {
  const inGrace = s.phase === "correct-grace";
  if (!(s.phase === "questions" || inGrace || (byHost && s.phase === "seer-hunt"))) return s;
  const last = lastLive(s);
  if (!last) return s;
  if (last.token === "correct" && !inGrace && !byHost) return s;
  const log = s.log.map((e) => (e.seq === last.seq ? { ...e, undone: true } : e));
  if (last.token === "correct") {
    return { ...enter({ ...s, log, correctBy: null, votes: {}, runoff: null }, "questions", now, null), phaseEndsAt: now + s.resumeMs };
  }
  return { ...s, log };
}

function vote(s: ParoleMannareState, playerId: string, targetId: string, now: number): ParoleMannareState {
  if (s.phase !== "seer-hunt" && s.phase !== "werewolf-vote") return s;
  if (s.pausedRemainingMs !== null) return s;
  if (!voters(s).includes(playerId) || !voteTargets(s, playerId).includes(targetId)) return s;
  if (s.votes[playerId] === targetId) return s;
  const next = { ...s, votes: { ...s.votes, [playerId]: targetId } };
  return allVoted(next) ? closeVote(next, now) : next;
}

/** Il tempo della fase è scaduto: passa alla fase successiva. */
function expire(s: ParoleMannareState, now: number): ParoleMannareState {
  switch (s.phase) {
    case "word":
      return pickWord(s, 0, now);
    case "night":
      return startQuestions(s, now);
    case "questions":
      return endQuestions(s, now);
    case "correct-grace":
      return { ...enter(s, "seer-hunt", now, s.cfg.seerHuntSeconds), votes: {}, runoff: null };
    case "seer-hunt":
    case "werewolf-vote":
      return closeVote(s, now);
    default:
      return s;
  }
}

function pickWordOptions(cfg: ParoleMannareConfig, seen: string[], rng: () => number): string[] {
  const inGroup = cfg.words.filter((w) => cfg.difficulty === "mista" || w.difficulty === cfg.difficulty).map((w) => w.text);
  const fresh = inGroup.filter((t) => !seen.includes(t));
  // Se le parole nuove non bastano, si riusano le vecchie piuttosto che proporne meno.
  const pool = fresh.length >= cfg.wordChoices ? fresh : [...fresh, ...inGroup.filter((t) => !fresh.includes(t))];
  return shuffle([...new Set(pool)], rng).slice(0, cfg.wordChoices);
}

// ---- Viste ----

const RECENT = 6;
const recentLog = (s: ParoleMannareState) => s.log.slice(-RECENT).map((e) => ({ seq: e.seq, playerId: e.playerId, nickname: nick(s, e.playerId), token: e.token, undone: e.undone }));
const wordPublic = (s: ParoleMannareState) => s.phase === "werewolf-vote" || s.phase === "reveal" || s.phase === "done";
const wolvesPublic = (s: ParoleMannareState) => s.phase === "seer-hunt" || s.phase === "reveal" || s.phase === "done";

/** I valori delle regole di questa partita, per la pagina «Regole» del telefono. Sono pubblici: nessun segreto. */
export interface RulesInfo {
  players: number;
  werewolves: number;
  questionSeconds: number;
  yesNoPool: number;
  maybePool: number | null;
  closeTokens: number;
  farTokens: number;
  seerHuntSeconds: number;
  voteSeconds: number;
  runoffSeconds: number;
}

const rulesOf = (s: ParoleMannareState): RulesInfo => ({
  players: s.players.length,
  werewolves: idsWith(s, "werewolf").length,
  questionSeconds: s.cfg.questionSeconds,
  yesNoPool: s.cfg.yesNoPool,
  maybePool: s.cfg.maybeUnlimited ? null : s.cfg.maybePool,
  closeTokens: s.cfg.closeTokens,
  farTokens: s.cfg.farTokens,
  seerHuntSeconds: s.cfg.seerHuntSeconds,
  voteSeconds: s.cfg.voteSeconds,
  runoffSeconds: s.cfg.runoffSeconds,
});

/** Parte pubblica, uguale per TV e telefoni: nessun ruolo, nessun voto, la parola solo quando è di tutti. */
function publicView(s: ParoleMannareState) {
  return {
    phase: s.phase,
    phaseStartedAt: s.phaseStartedAt,
    phaseEndsAt: s.phaseEndsAt,
    pausedRemainingMs: s.pausedRemainingMs,
    mayor: { id: s.mayorId, nickname: nick(s, s.mayorId) },
    players: s.players.map((id) => ({ id, nickname: nick(s, id), summary: playerSummary(s, id) })),
    reserves: reserves(s),
    rules: rulesOf(s),
    log: recentLog(s),
    correctBy: s.correctBy ? nick(s, s.correctBy) : null,
    runoff: s.runoff ? s.runoff.map((id) => ({ id, nickname: nick(s, id) })) : null,
    voted: s.phase === "seer-hunt" || s.phase === "werewolf-vote" ? voters(s).filter((id) => s.votes[id] !== undefined).length : 0,
    voters: s.phase === "seer-hunt" || s.phase === "werewolf-vote" ? voters(s).length : 0,
    word: wordPublic(s) ? s.word : null,
    wolves: wolvesPublic(s) ? idsWith(s, "werewolf").map((id) => nick(s, id)) : null,
  };
}

const roleList = (s: ParoleMannareState) => s.players.map((id) => ({ id, nickname: nick(s, id), role: s.roles[id]! }));

export const paroleMannare: MinigameType<ParoleMannareConfig, ParoleMannareState, Input, Command> = {
  id: "parole-mannare",
  title: "Parole Mannare",
  defaultTheme: "manga",
  configSchema: paroleMannareConfigSchema as unknown as z.ZodType<ParoleMannareConfig>,
  inputSchema,
  commandSchema,
  minPlayers: 4,
  maxPlayers: 12,

  // Le parole possono stare in una «Lista di parole» della libreria: l'istanza la riferisce per id.
  libraryConfigSchema: paroleMannareLibrarySchema as unknown as z.ZodType<unknown>,
  draftLibraryConfig: { words: DEFAULT_WORDS, difficulty: "media" },
  buildConfig(raw, lookup) {
    const parsed = paroleMannareLibrarySchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`).join("; ") };
    const { wordList, wordListDifficulty, words: own, ...rest } = parsed.data;
    const listWords = wordList ? lookupWordList(lookup, wordList) : [];
    if (!listWords) return { ok: false, error: "Lista di parole non valida o non trovata" };
    const config = paroleMannareConfigSchema.safeParse({ ...rest, words: mergeWords(own, listWords, wordListDifficulty) });
    return config.success ? { ok: true, config: config.data } : { ok: false, error: ENOUGH };
  },

  sampleConfig: {
    words: DEFAULT_WORDS,
    difficulty: "media",
    wordChoices: 3,
    wordPickSeconds: 20,
    nightSeconds: 15,
    questionSeconds: 240,
    yesNoPool: 36,
    maybePool: 12,
    maybeUnlimited: false,
    closeTokens: 1,
    farTokens: 1,
    werewolves: "auto",
    correctGraceSeconds: 5,
    seerHuntSeconds: 30,
    voteSeconds: 60,
    runoffSeconds: 30,
    winPoints: 100,
    mayorBonus: 0,
  },

  init(config, ctx, now) {
    const rng = makeRng(ctx.seed);
    const players = ctx.players.map((p) => p.id);
    const order = shuffle(players, rng);
    const wolves = werewolfCount(config.werewolves, players.length);
    const roles: Record<string, Role> = {};
    order.forEach((id, i) => {
      roles[id] = i < wolves ? "werewolf" : i === wolves && players.length > wolves ? "seer" : "villager";
    });
    return {
      cfg: config,
      seed: ctx.seed,
      participants: ctx.players,
      players,
      mayorId: players[Math.floor(rng() * players.length)] ?? "",
      roles,
      wordOptions: pickWordOptions(config, ctx.seen ?? [], rng),
      word: null,
      log: [],
      nextSeq: 1,
      phase: "deal",
      phaseStartedAt: now,
      phaseEndsAt: null,
      pausedRemainingMs: null,
      resumeMs: 0,
      correctBy: null,
      seenBy: [],
      votes: {},
      runoff: null,
      outcome: null,
    };
  },

  onInput(state, playerId, input, meta) {
    if (!state.roles[playerId]) return state;
    const at = meta.receivedAt;
    switch (input.type) {
      case "pick-word":
        return state.phase === "word" && playerId === state.mayorId && state.pausedRemainingMs === null ? pickWord(state, input.index, at) : state;
      case "seen": {
        if (state.phase !== "night" || state.seenBy.includes(playerId)) return state;
        const next = { ...state, seenBy: [...state.seenBy, playerId] };
        return next.seenBy.length >= next.players.length ? startQuestions(next, at) : next;
      }
      case "give":
        return playerId === state.mayorId ? give(state, input.playerId, input.token, at) : state;
      case "undo":
        return playerId === state.mayorId ? undo(state, at, false) : state;
      case "vote":
        return vote(state, playerId, input.targetId, at);
    }
  },

  onTick(state, now) {
    if (state.pausedRemainingMs !== null || state.phaseEndsAt === null || now < state.phaseEndsAt) return state;
    return expire(state, now);
  },

  onHostCommand(state, command, now) {
    switch (command.type) {
      case "set-mayor": {
        if (state.phase !== "deal") return state;
        const next = command.playerId ?? state.players[(state.players.indexOf(state.mayorId) + 1) % state.players.length];
        return next && state.roles[next] && next !== state.mayorId ? { ...state, mayorId: next } : state;
      }
      case "deal":
        return state.phase === "deal" ? enter(state, "word", now, state.cfg.wordPickSeconds) : state;
      case "pause":
        if (!TIMED.includes(state.phase) || state.pausedRemainingMs !== null || state.phaseEndsAt === null) return state;
        return { ...state, pausedRemainingMs: Math.max(0, state.phaseEndsAt - now), phaseEndsAt: null };
      case "resume":
        return state.pausedRemainingMs === null ? state : { ...state, phaseEndsAt: now + state.pausedRemainingMs, pausedRemainingMs: null };
      case "undo":
        return undo(state, now, true);
      case "end-questions":
        return state.phase === "questions" ? endQuestions(state, now) : state;
      case "close-vote":
        return closeVote(state, now);
      case "next":
        return state.phase === "reveal" ? enter(state, "done", now, null) : state;
    }
  },

  isFinished: (state) => state.phase === "done",
  scores: (state) => scoresOf(state),
  result(state) {
    const totals: Record<string, number> = {};
    for (const d of scoresOf(state)) if (d.playerId) totals[d.playerId] = d.points;
    return rankByPoints(totals, state.players);
  },

  shownItems: (state) => [...new Set([...(state.word ? [state.word] : []), ...state.wordOptions])],

  screenView(state) {
    const over = state.phase === "reveal" || state.phase === "done";
    return {
      ...publicView(state),
      ...(over && { roles: roleList(state), outcome: state.outcome }),
    };
  },

  viewFor(state, playerId) {
    const role = state.roles[playerId];
    if (!role) return { ...publicView(state), me: null };
    const dealt = state.phase !== "deal" && state.phase !== "word";
    const isMayor = playerId === state.mayorId;
    const knowsWord = state.word !== null && (isMayor || (dealt && role !== "villager"));
    const over = state.phase === "reveal" || state.phase === "done";
    const inVote = state.phase === "seer-hunt" || state.phase === "werewolf-vote";
    const wolf = role === "werewolf";
    return {
      ...publicView(state),
      me: {
        id: playerId,
        isMayor,
        role: dealt ? role : null,
        word: knowsWord ? state.word : null,
        wordOptions: isMayor && state.phase === "word" ? state.wordOptions : null,
        mates: dealt && wolf ? idsWith(state, "werewolf").filter((id) => id !== playerId).map((id) => nick(state, id)) : [],
        seen: state.seenBy.includes(playerId),
        canVote: inVote && voters(state).includes(playerId),
        targets: inVote ? voteTargets(state, playerId).map((id) => ({ id, nickname: nick(state, id) })) : [],
        myVote: state.votes[playerId] ?? null,
        // I Lupi vedono le scelte degli altri Lupi mentre cercano il Veggente; nessun altro vede i voti.
        teamVotes: state.phase === "seer-hunt" && wolf ? { ...state.votes } : null,
        canUndo: isMayor && lastLive(state) !== null && (state.phase === "questions" || state.phase === "correct-grace"),
        lastToken: isMayor ? (() => { const l = lastLive(state); return l ? { token: l.token, nickname: nick(state, l.playerId) } : null; })() : null,
      },
      ...(over && { roles: roleList(state), outcome: state.outcome }),
    };
  },

  hostView(state) {
    const timed = TIMED.includes(state.phase);
    return {
      info: {
        phase: state.phase,
        Sindaco: nick(state, state.mayorId),
        "Parola (segreto)": state.word ?? state.wordOptions.join(" / "),
        "Ruoli (segreto)": state.players.map((id) => `${nick(state, id)}: ${state.roles[id] === "werewolf" ? "Lupo" : state.roles[id] === "seer" ? "Veggente" : "Paesano"}`).join(", "),
        Gettoni: `Sì/No ${reserves(state).yesNo} · Forse ${reserves(state).maybe ?? "∞"} · Quasi ${reserves(state).close} · Lontano ${reserves(state).far}`,
        ...(state.outcome && { Esito: `${state.outcome.winner === "village" ? "Villaggio" : "Lupi"}: ${state.outcome.reason}` }),
      },
      actions: [
        { id: "deal", label: "Distribuisci i ruoli", enabled: state.phase === "deal" },
        { id: "set-mayor", label: "Cambia Sindaco", enabled: state.phase === "deal" },
        { id: "next", label: "Avanti", enabled: state.phase === "reveal" },
        { id: "undo", label: "Annulla ultimo gettone", enabled: lastLive(state) !== null && ["questions", "correct-grace", "seer-hunt"].includes(state.phase) },
        { id: "end-questions", label: "Chiudi le domande", enabled: state.phase === "questions", danger: true },
        { id: "close-vote", label: "Chiudi il voto", enabled: state.phase === "seer-hunt" || state.phase === "werewolf-vote", danger: true },
        state.pausedRemainingMs !== null
          ? { id: "resume", label: "Riprendi", enabled: true }
          : { id: "pause", label: "Pausa", enabled: timed && state.phaseEndsAt !== null },
      ],
    };
  },
};

function scoresOf(s: ParoleMannareState): ScoreDelta[] {
  if (!s.outcome) return [];
  const out: ScoreDelta[] = [];
  for (const id of s.players) {
    const team: Winner = s.roles[id] === "werewolf" ? "werewolves" : "village";
    if (team !== s.outcome.winner) continue;
    const points = s.cfg.winPoints + (id === s.mayorId ? s.cfg.mayorBonus : 0);
    if (points !== 0) out.push({ playerId: id, teamId: null, points, reason: "Parole Mannare" });
  }
  return out;
}
