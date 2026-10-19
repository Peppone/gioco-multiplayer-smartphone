import { z } from "zod";
import { type MinigameType, type ParticipantInfo, type ScoreDelta, fairTime } from "@gioco/shared";
import { deriveSeed, makeRng } from "../knight-duel/rng.js";
import { GRACE_MS, rankByPoints, totalsToScores } from "../util.js";
import { type BombRules, MODULES, buildManual, generateBomb, judgeModule } from "./bomb.js";
import { MODULE_KINDS, type ModuleAction, type ModuleInstance, type ModuleKind } from "./modules/types.js";
import { MIN_WORDS, usableWords } from "./modules/word.js";
import { lookupWordList } from "../word-list.js";
import { type TeamEntry, type Turn, assignPages, buildQueue, formTeams, nextDefuser, tooSmallTeams } from "./turns.js";
import type { Edgework } from "./edgework.js";
import type { ButtonData } from "./modules/button.js";

/**
 * Artificieri: disinnesco a squadre con informazioni divise, in stile Keep Talking and Nobody Explodes.
 * Gioca una squadra alla volta: l'artificiere vede la bomba sulla TV e agisce dal telefono; gli esperti, di spalle
 * alla TV, hanno sul telefono il manuale diviso a pagine; le altre squadre scommettono sull'esito.
 * Regole e decisioni in docs/PIANO-ARTIFICIERI.md.
 */

export type Phase = "bet" | "briefing" | "defuse" | "outcome" | "final" | "done";
export type Bet = "defused" | "exploded";
export type CloseReason = "all-solved" | "strikes" | "time" | "host";

/** Ogni errore accelera il timer di questa frazione (se `speedUpOnStrike`). */
export const STRIKE_SPEEDUP = 0.25;

const sec = (title: string, description?: string) => ({ title, ...(description && { description }) });
const MODULE_TITLES: Record<ModuleKind, string> = { wires: "Fili", button: "Pulsante", symbols: "Simboli", colors: "Colori", maze: "Labirinto", word: "Parola" };
/** Il modulo «Parola» ha bisogno di una lista di parole: è spento finché la regia non ne sceglie una. */
const DEFAULT_MODULES = { wires: true, button: true, symbols: true, colors: true, maze: true, word: false } satisfies Record<ModuleKind, boolean>;

const enabledModulesSchema = z
  .object(
    Object.fromEntries(MODULE_KINDS.map((k) => [k, z.boolean().default(DEFAULT_MODULES[k]).meta(sec(MODULE_TITLES[k], k === "word" ? "Richiede una lista di parole (almeno 12 di 5 lettere)" : undefined))])) as Record<ModuleKind, z.ZodDefault<z.ZodBoolean>>,
  )
  .refine((m) => MODULE_KINDS.some((k) => m[k]), { message: "Attiva almeno un tipo di modulo" });

const settingsShape = {
  difficulty: z
    .enum(["facile", "media", "difficile"])
    .default("media")
    .meta({ ...sec("Difficoltà", "Numero e complessità delle regole del manuale. Con le squadre nuove conviene «facile»"), enumLabels: { facile: "Facile", media: "Media", difficile: "Difficile" } }),
  modules: z.number().int().min(3).max(6).default(4).meta(sec("Moduli per bomba")),
  enabledModules: enabledModulesSchema.default(DEFAULT_MODULES).meta(sec("Tipi di modulo ammessi", "Almeno uno")),
  seconds: z.number().int().min(60).max(900).default(300).meta(sec("Durata del timer (s)")),
  maxStrikes: z.number().int().min(1).max(5).default(3).meta(sec("Errori prima dell'esplosione")),
  speedUpOnStrike: z.boolean().default(true).meta(sec("Il timer accelera a ogni errore", "Del 25% per ogni errore")),
  bombsPerTeam: z.number().int().min(1).max(3).default(1).meta(sec("Bombe per squadra", "Con 6 squadre ogni bomba aggiunge circa 40 minuti")),
  sameManual: z.boolean().default(false).meta(sec("Stesso manuale per tutte le bombe", "Più facile, ma avvantaggia chi gioca dopo: con «no» ogni bomba ha regole nuove")),
  betSeconds: z.number().int().min(0).max(60).default(15).meta(sec("Tempo per le scommesse (s)", "0 = senza scommesse")),
  modulePoints: z.number().int().min(0).max(1000).default(50).meta(sec("Punti per modulo disinnescato", "A ogni membro della squadra, anche se la bomba poi esplode")),
  defusePoints: z.number().int().min(0).max(1000).default(200).meta(sec("Punti per bomba disinnescata")),
  timeBonus: z.number().int().min(0).max(10).default(1).meta(sec("Punti per secondo rimasto", "Sul timer della bomba, quando è disinnescata")),
  betPoints: z.number().int().min(0).max(500).default(50).meta(sec("Punti per una scommessa giusta", "A ogni giocatore delle altre squadre")),
};

const NEED_WORDS = `Il modulo «Parola» ha bisogno di almeno ${MIN_WORDS} parole di 5 lettere: scegli una lista di parole o disattiva il modulo`;

/** Configurazione completa con cui parte il plugin: le parole sono già risolte (lista della libreria più quelle proprie). */
export const artificieriConfigSchema = z
  .object({ ...settingsShape, words: z.array(z.string().trim().min(1).max(60)).max(800).default([]).meta({ title: "Parole", itemLabel: "Parola" }) })
  .refine((c) => !c.enabledModules.word || usableWords(c.words).length >= MIN_WORDS, { message: NEED_WORDS, path: ["words"] });

export type ArtificieriConfig = z.infer<typeof artificieriConfigSchema>;

/**
 * Istanza in libreria, come la compila la regia: le parole del modulo «Parola» stanno in una «Lista di parole» della
 * libreria (riusabile, comune con Agenti Segreti) e/o nell'istanza stessa. All'avvio della partita `buildConfig` le risolve.
 */
export const artificieriLibrarySchema = z
  .object({
    wordList: z.string().min(1).optional().meta({ title: "Lista di parole", widget: "instance", instanceKind: "word-list", description: "Per il modulo «Parola»: si usano le parole di 5 lettere" }),
    words: z.array(z.string().trim().min(1).max(60)).max(300).default([]).meta({ title: "Parole proprie di questa istanza", description: "In più rispetto alla lista (facoltative)", itemLabel: "Parola", widget: "lines" }),
    ...settingsShape,
  })
  .refine((c) => !c.enabledModules.word || !!c.wordList || usableWords(c.words).length >= MIN_WORDS, { message: NEED_WORDS, path: ["wordList"] });

const moduleIndex = z.number().int().min(0).max(5);
const inputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("select"), module: moduleIndex }),
  z.object({ type: z.literal("cut"), module: moduleIndex, wire: z.number().int().min(0).max(5) }),
  z.object({ type: z.literal("tap"), module: moduleIndex }),
  z.object({ type: z.literal("hold"), module: moduleIndex }),
  z.object({ type: z.literal("release"), module: moduleIndex }),
  z.object({ type: z.literal("press"), module: moduleIndex, key: z.number().int().min(0).max(5) }),
  z.object({ type: z.literal("move"), module: moduleIndex, dir: z.enum(["up", "down", "left", "right"]) }),
  z.object({ type: z.literal("spin"), module: moduleIndex, wheel: z.number().int().min(0).max(4), delta: z.union([z.literal(1), z.literal(-1)]) }),
  z.object({ type: z.literal("submit"), module: moduleIndex }),
  z.object({ type: z.literal("bet"), outcome: z.enum(["defused", "exploded"]) }),
]);
const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("swap-defuser") }),
  z.object({ type: z.literal("strike-undo") }),
  z.object({ type: z.literal("explode") }),
  z.object({ type: z.literal("defuse") }),
  z.object({ type: z.literal("skip-team") }),
  z.object({ type: z.literal("next") }),
  z.object({ type: z.literal("end") }),
]);
type Input = z.infer<typeof inputSchema>;
type Command = z.infer<typeof commandSchema>;

/** Orologio della bomba: a `at` (ora server) restavano `remainingMs` di tempo «finto»; scorre a `speed` volte il reale. */
export interface BombClock {
  at: number;
  remainingMs: number;
}

export interface BombOutcome {
  result: Bet;
  reason: CloseReason;
  /** Tempo finto rimasto alla chiusura (serve ad annullare l'ultimo errore). */
  remainingMs: number;
  secondsLeft: number;
}

export interface Bomb {
  teamId: string;
  defuserId: string;
  /** Bordo, moduli (con le soluzioni implicite nelle regole) e regole: SEGRETI per tutti tranne la regia. */
  edgework: Edgework;
  rules: BombRules;
  modules: ModuleInstance[];
  /** Esperto → pagine del manuale. */
  pages: Record<string, number[]>;
  strikes: number;
  startedAt: number | null;
  clock: BombClock;
  speed: number;
  /** Modulo che l'artificiere ha scelto (la TV lo ingrandisce). */
  selected: number | null;
  /** Stato prima dell'ultimo errore, per «Annulla l'ultimo errore». */
  lastStrike: { module: ModuleInstance; speed: number } | null;
  outcome: BombOutcome | null;
}

export interface TurnResult {
  turn: number;
  teamId: string;
  defuserId: string;
  outcome: Bet | "skipped";
  reason: CloseReason | "skipped";
  solved: number;
  moduleCount: number;
  strikes: number;
  secondsLeft: number;
  bets: Record<string, Bet>;
  betWinners: string[];
}

export interface ArtificieriState {
  cfg: ArtificieriConfig;
  seed: number;
  participants: ParticipantInfo[];
  players: string[];
  teams: TeamEntry[];
  queue: Turn[];
  /** Indice in `queue` del turno in corso. */
  turn: number;
  bomb: Bomb | null;
  bets: Record<string, Bet>;
  history: TurnResult[];
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
}

type S = ArtificieriState;

const nick = (s: S, id: string) => s.participants.find((p) => p.id === id)?.nickname ?? "?";
const person = (s: S, id: string) => ({ id, nickname: nick(s, id) });
const team = (s: S, id: string) => s.teams.find((t) => t.id === id);
const teamOf = (s: S, playerId: string) => s.teams.find((t) => t.members.includes(playerId)) ?? null;

// ---- Orologio ----

export const fakeRemaining = (b: Bomb, at: number): number => Math.max(0, b.clock.remainingMs - Math.max(0, at - b.clock.at) * b.speed);
/** Ora server in cui il timer arriva a zero (se non succede altro). */
export const realDeadline = (b: Bomb): number => b.clock.at + b.clock.remainingMs / b.speed;
const remainingNow = (s: S, at: number) => (s.pausedRemainingMs !== null ? s.pausedRemainingMs : fakeRemaining(s.bomb!, at));

// ---- Turni ----

/** Giocatori che scommettono sul turno: tutti tranne la squadra di turno. */
const bettorsOf = (s: S): string[] => {
  const t = s.bomb ? team(s, s.bomb.teamId) : undefined;
  return s.players.filter((id) => !t?.members.includes(id));
};

const experts = (s: S): string[] => {
  const b = s.bomb!;
  return team(s, b.teamId)!.members.filter((id) => id !== b.defuserId);
};

function enter(s: S, phase: Phase, now: number, seconds: number | null = null): S {
  return { ...s, phase, phaseStartedAt: now, phaseEndsAt: seconds ? now + seconds * 1000 : null, pausedRemainingMs: null };
}

function makeBomb(s: S, turnIndex: number, now: number): Bomb {
  const turn = s.queue[turnIndex]!;
  const bombSeed = deriveSeed(s.seed, 1000 + turnIndex);
  const setup = generateBomb(bombSeed, {
    difficulty: s.cfg.difficulty,
    modules: s.cfg.modules,
    enabled: MODULE_KINDS.filter((k) => s.cfg.enabledModules[k]),
    content: { words: s.cfg.words },
    ...(s.cfg.sameManual && { rulesSeed: s.seed }),
  });
  const members = team(s, turn.teamId)!.members.filter((id) => id !== turn.defuserId);
  return {
    teamId: turn.teamId,
    defuserId: turn.defuserId,
    ...setup,
    pages: assignPages(buildManual(setup.rules).length, members, makeRng(deriveSeed(bombSeed, 7))),
    strikes: 0,
    startedAt: null,
    clock: { at: now, remainingMs: s.cfg.seconds * 1000 },
    speed: 1,
    selected: null,
    lastStrike: null,
    outcome: null,
  };
}

/** Comincia il turno `index`: scommesse (se ci sono scommettitori e tempo) oppure subito il briefing. */
function startTurn(s: S, index: number, now: number): S {
  const next: S = { ...s, turn: index, bets: {}, bomb: makeBomb(s, index, now) };
  const betting = s.cfg.betSeconds > 0 && bettorsOf(next).length > 0;
  return betting ? enter(next, "bet", now, s.cfg.betSeconds) : enter(next, "briefing", now);
}

function advance(s: S, now: number): S {
  const index = s.turn + 1;
  return index < s.queue.length ? startTurn(s, index, now) : enter(s, "final", now);
}

function beginDefuse(s: S, now: number): S {
  const b = s.bomb!;
  const bomb: Bomb = { ...b, startedAt: now, clock: { at: now, remainingMs: s.cfg.seconds * 1000 }, speed: 1 };
  return enter({ ...s, bomb }, "defuse", now);
}

const solvedCount = (b: Bomb) => b.modules.filter((m) => m.solved).length;

/** Chiude il turno in corso con un esito e passa alla fase `outcome`. `at` è l'istante dell'esito (ora server). */
function closeTurn(s: S, result: Bet, reason: CloseReason, at: number, now: number): S {
  const b = s.bomb!;
  const remainingMs = remainingNow(s, at);
  const secondsLeft = result === "defused" ? Math.floor(remainingMs / 1000) : 0;
  const bets = bettorsOf(s).reduce<Record<string, Bet>>((acc, id) => (s.bets[id] ? { ...acc, [id]: s.bets[id]! } : acc), {});
  const entry: TurnResult = {
    turn: s.turn,
    teamId: b.teamId,
    defuserId: b.defuserId,
    outcome: result,
    reason,
    solved: solvedCount(b),
    moduleCount: b.modules.length,
    strikes: b.strikes,
    secondsLeft,
    bets,
    betWinners: Object.keys(bets).filter((id) => bets[id] === result),
  };
  const bomb: Bomb = { ...b, outcome: { result, reason, remainingMs, secondsLeft } };
  return enter({ ...s, bomb, history: [...s.history, entry] }, "outcome", now);
}

function skipTurn(s: S, now: number): S {
  const b = s.bomb!;
  const entry: TurnResult = { turn: s.turn, teamId: b.teamId, defuserId: b.defuserId, outcome: "skipped", reason: "skipped", solved: 0, moduleCount: b.modules.length, strikes: 0, secondsLeft: 0, bets: {}, betWinners: [] };
  return advance({ ...s, history: [...s.history, entry] }, now);
}

// ---- Azioni dell'artificiere ----

function toAction(input: Exclude<Input, { type: "start" | "select" | "bet" }>): ModuleAction {
  switch (input.type) {
    case "cut":
      return { type: "cut", wire: input.wire };
    case "press":
      return { type: "press", key: input.key };
    case "move":
      return { type: "move", dir: input.dir };
    case "spin":
      return { type: "spin", wheel: input.wheel, delta: input.delta };
    default:
      return { type: input.type };
  }
}

function updateModule(b: Bomb, mod: ModuleInstance): Bomb {
  return { ...b, modules: b.modules.map((m) => (m.id === mod.id ? mod : m)) };
}

function defuserInput(s: S, input: Exclude<Input, { type: "start" | "bet" }>, meta: { receivedAt: number; claimedTime: number; rtt: number | null }): S {
  const b = s.bomb;
  if (!b || s.phase !== "defuse" || s.pausedRemainingMs !== null || b.startedAt === null) return s;
  const mod = b.modules[input.module];
  if (!mod) return s;
  if (input.type === "select") return b.selected === mod.id ? s : { ...s, bomb: { ...b, selected: mod.id } };

  // Il tempo dell'azione è l'ora equa: l'ordine di arrivo e la latenza non contano, e una pressione in tempo che
  // arriva poco dopo la scadenza vale ancora (come negli altri giochi a tempo).
  const deadline = realDeadline(b);
  const fair = Math.max(fairTime({ claimed: meta.claimedTime, receivedAt: meta.receivedAt, rtt: meta.rtt, openedAt: b.startedAt }), b.clock.at);
  if (fair > deadline || meta.receivedAt > deadline + GRACE_MS) return s;

  const out = judgeModule(b, mod, toAction(input), fakeRemaining(b, fair), b.strikes);
  if (out.verdict === "ignored") return s;
  let bomb = updateModule(b, out.module);
  if (out.verdict === "ok") return { ...s, bomb };
  if (out.verdict === "solved") {
    const next = { ...s, bomb };
    return bomb.modules.every((m) => m.solved) ? closeTurn(next, "defused", "all-solved", fair, meta.receivedAt) : next;
  }
  // errore: il timer può accelerare, e a `maxStrikes` la bomba esplode
  const strikes = b.strikes + 1;
  const speed = s.cfg.speedUpOnStrike ? 1 + STRIKE_SPEEDUP * strikes : b.speed;
  bomb = { ...bomb, strikes, speed, clock: { at: fair, remainingMs: fakeRemaining(b, fair) }, lastStrike: { module: mod, speed: b.speed } };
  const next = { ...s, bomb };
  return strikes >= s.cfg.maxStrikes ? closeTurn(next, "exploded", "strikes", fair, meta.receivedAt) : next;
}

/** «Annulla l'ultimo errore»: un tocco sbagliato evidente non deve costare la bomba. Il tempo trascorso non si restituisce. */
function undoStrike(s: S, now: number): S {
  const b = s.bomb;
  const last = b?.lastStrike;
  if (!b || !last) return s;
  const exploded = s.phase === "outcome" && b.outcome?.reason === "strikes";
  if (s.phase !== "defuse" && !exploded) return s;
  const remainingMs = exploded ? b.outcome!.remainingMs : remainingNow(s, now);
  const bomb: Bomb = {
    ...updateModule(b, last.module),
    strikes: b.strikes - 1,
    speed: last.speed,
    clock: { at: now, remainingMs },
    lastStrike: null,
    outcome: null,
  };
  return exploded ? enter({ ...s, bomb, history: s.history.slice(0, -1) }, "defuse", now) : { ...s, bomb };
}

// ---- Punti ----

export function teamPoints(cfg: ArtificieriConfig, e: TurnResult): number {
  if (e.outcome === "skipped") return 0;
  return cfg.modulePoints * e.solved + (e.outcome === "defused" ? cfg.defusePoints + cfg.timeBonus * e.secondsLeft : 0);
}

function playerTotals(s: S): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const e of s.history) {
    if (e.outcome === "skipped") continue;
    const points = teamPoints(s.cfg, e);
    for (const id of team(s, e.teamId)?.members ?? []) totals[id] = (totals[id] ?? 0) + points;
    for (const id of e.betWinners) totals[id] = (totals[id] ?? 0) + s.cfg.betPoints;
  }
  return totals;
}

// ---- Viste ----

/** I numeri di questa partita per la pagina «Regole» del telefono. Sono pubblici (la chiave è `settings`: `rules` è il manuale, segreto). */
export interface RulesInfo {
  difficulty: ArtificieriConfig["difficulty"];
  modules: number;
  seconds: number;
  maxStrikes: number;
  speedUpOnStrike: boolean;
  bombsPerTeam: number;
  betSeconds: number;
  modulePoints: number;
  defusePoints: number;
  timeBonus: number;
  betPoints: number;
}

function rulesOf(s: S): RulesInfo {
  const c = s.cfg;
  return { difficulty: c.difficulty, modules: c.modules, seconds: c.seconds, maxStrikes: c.maxStrikes, speedUpOnStrike: c.speedUpOnStrike, bombsPerTeam: c.bombsPerTeam, betSeconds: c.betSeconds, modulePoints: c.modulePoints, defusePoints: c.defusePoints, timeBonus: c.timeBonus, betPoints: c.betPoints };
}

const BOMB_PHASES: Phase[] = ["defuse", "outcome"];

/** Stato della bomba che vedono tutti (esperti e altre squadre compresi): nessuna informazione sui moduli. */
function statusOf(s: S) {
  const b = s.bomb;
  if (!b || !BOMB_PHASES.includes(s.phase)) return null;
  return {
    strikes: b.strikes,
    maxStrikes: s.cfg.maxStrikes,
    moduleCount: b.modules.length,
    solved: solvedCount(b),
    speed: b.speed,
    clock: b.clock,
    pausedRemainingMs: s.pausedRemainingMs,
    outcome: s.phase === "outcome" ? b.outcome : null,
  };
}

function turnOf(s: S) {
  const b = s.bomb;
  if (!b || s.phase === "final" || s.phase === "done") return null;
  const t = team(s, b.teamId)!;
  return {
    position: s.turn,
    total: s.queue.length,
    teamId: t.id,
    teamName: t.name,
    teamColor: t.color,
    defuser: person(s, b.defuserId),
    experts: experts(s).map((id) => person(s, id)),
    bettors: s.phase === "bet" ? bettorsOf(s).length : 0,
    betsPlaced: s.phase === "bet" ? Object.keys(s.bets).length : 0,
  };
}

function historyView(s: S) {
  return s.history.map((e) => ({
    turn: e.turn,
    teamId: e.teamId,
    outcome: e.outcome,
    reason: e.reason,
    solved: e.solved,
    moduleCount: e.moduleCount,
    strikes: e.strikes,
    secondsLeft: e.secondsLeft,
    points: teamPoints(s.cfg, e),
    betWinners: e.betWinners.map((id) => person(s, id)),
    betsDefused: Object.values(e.bets).filter((v) => v === "defused").length,
    betsExploded: Object.values(e.bets).filter((v) => v === "exploded").length,
  }));
}

function publicBase(s: S) {
  return {
    phase: s.phase,
    phaseStartedAt: s.phaseStartedAt,
    phaseEndsAt: s.phaseEndsAt,
    pausedRemainingMs: s.pausedRemainingMs,
    settings: rulesOf(s),
    teams: s.teams.map((t) => ({ id: t.id, name: t.name, color: t.color, members: t.members.map((id) => person(s, id)) })),
    turn: turnOf(s),
    status: statusOf(s),
    history: historyView(s),
  };
}

/** Dati di un modulo per la TV: la striscia del pulsante compare solo mentre è tenuto premuto (e a fine turno). */
function tvModule(s: S, m: ModuleInstance) {
  const data = m.kind === "button" && !(m.progress as { holding: boolean }).holding && s.phase !== "outcome" ? (({ strip: _strip, ...rest }) => rest)(m.data as ButtonData) : m.data;
  return { id: m.id, kind: m.kind, solved: m.solved, data, progress: m.progress };
}

/** I soli comandi che servono all'artificiere: niente colori, scritte, bordo o regole. */
function controlsOf(m: ModuleInstance) {
  const base = { id: m.id, kind: m.kind, solved: m.solved };
  switch (m.kind) {
    case "wires":
      return { ...base, wires: (m.data as { wires: unknown[] }).wires.length, cut: (m.progress as { cut: number[] }).cut };
    case "button":
      return { ...base, holding: (m.progress as { holding: boolean }).holding };
    case "symbols":
      return { ...base, symbols: (m.data as { symbols: string[] }).symbols, pressed: (m.progress as { pressed: number[] }).pressed };
    // colori, labirinto e parola: sul telefono ci sono solo i tasti, quello che serve sapere sta sulla TV
    case "colors":
    case "maze":
    case "word":
      return base;
  }
}

/** Soluzione di un modulo per la regia: il testo per le persone e il piano strutturato (azioni) per bot e controlli. */
function hostSolution(m: ModuleInstance, b: Bomb) {
  if (m.solved) return { solution: null, plan: null };
  const s = MODULES[m.kind].solution({ data: m.data, rules: b.rules[m.kind], edge: b.edgework, progress: m.progress, strikes: b.strikes });
  return { solution: s.text, plan: { actions: s.actions, releaseDigit: s.releaseDigit ?? null } };
}

export const artificieri: MinigameType<ArtificieriConfig, ArtificieriState, Input, Command> = {
  id: "artificieri",
  title: "Artificieri",
  defaultTheme: "boom",
  configSchema: artificieriConfigSchema as unknown as z.ZodType<ArtificieriConfig>,
  inputSchema,
  commandSchema,
  minPlayers: 2,

  sampleConfig: artificieriConfigSchema.parse({}) as ArtificieriConfig,

  libraryConfigSchema: artificieriLibrarySchema as unknown as z.ZodType<unknown>,
  draftLibraryConfig: {},
  // Le parole del modulo «Parola» si risolvono qui; ogni team della serata con giocatori deve avere almeno 2 membri
  // (con uno solo non c'è nessuno a cui dare il manuale).
  buildConfig(raw, lookup, roster) {
    const parsed = artificieriLibrarySchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`).join("; ") };
    const { wordList, words: own, ...rest } = parsed.data;
    const listWords = wordList ? lookupWordList(lookup, wordList) : [];
    if (!listWords) return { ok: false, error: "Lista di parole non valida o non trovata" };
    const config = artificieriConfigSchema.safeParse({ ...rest, words: [...listWords, ...own] });
    if (!config.success) return { ok: false, error: NEED_WORDS };
    const small = tooSmallTeams(roster.players, roster.teams);
    if (small.length > 0) return { ok: false, error: `La squadra «${small[0].name}» ha un solo giocatore: servono almeno 2 (l'artificiere e un esperto)` };
    return { ok: true, config: config.data };
  },

  init(config, ctx, now) {
    const rng = makeRng(ctx.seed);
    const teams = formTeams(ctx.players, ctx.teams, rng);
    const base: S = {
      cfg: config,
      seed: ctx.seed,
      participants: ctx.players,
      players: ctx.players.map((p) => p.id),
      teams,
      queue: buildQueue(teams, config.bombsPerTeam),
      turn: 0,
      bomb: null,
      bets: {},
      history: [],
      phase: "done",
      phaseStartedAt: now,
      phaseEndsAt: null,
      pausedRemainingMs: null,
    };
    return base.queue.length === 0 ? base : startTurn(base, 0, now);
  },

  onInput(state, playerId, input, meta) {
    if (!state.players.includes(playerId)) return state;
    switch (input.type) {
      case "bet": {
        if (state.phase !== "bet" || state.pausedRemainingMs !== null || !bettorsOf(state).includes(playerId)) return state;
        if (state.phaseEndsAt !== null && meta.receivedAt > state.phaseEndsAt + GRACE_MS) return state;
        if (state.bets[playerId] === input.outcome) return state;
        const next = { ...state, bets: { ...state.bets, [playerId]: input.outcome } };
        // Quando hanno scommesso tutti si va avanti senza aspettare.
        return bettorsOf(next).every((id) => next.bets[id]) ? enter(next, "briefing", meta.receivedAt) : next;
      }
      case "start":
        return state.phase === "briefing" && state.bomb?.defuserId === playerId ? beginDefuse(state, meta.receivedAt) : state;
      default:
        return state.bomb?.defuserId === playerId ? defuserInput(state, input, meta) : state;
    }
  },

  onTick(state, now) {
    if (state.pausedRemainingMs !== null) return state;
    if (state.phase === "bet" && state.phaseEndsAt !== null && now >= state.phaseEndsAt) return enter(state, "briefing", now);
    const b = state.bomb;
    if (state.phase === "defuse" && b && now >= realDeadline(b) + GRACE_MS) return closeTurn(state, "exploded", "time", realDeadline(b), now);
    return state;
  },

  onHostCommand(state, command, now) {
    const b = state.bomb;
    const playing = state.phase === "bet" || state.phase === "briefing" || state.phase === "defuse";
    switch (command.type) {
      case "start":
        return state.phase === "briefing" ? beginDefuse(state, now) : state;
      case "pause":
        if (state.pausedRemainingMs !== null) return state;
        if (state.phase === "bet" && state.phaseEndsAt !== null) return { ...state, pausedRemainingMs: Math.max(0, state.phaseEndsAt - now), phaseEndsAt: null };
        if (state.phase === "defuse" && b) return { ...state, pausedRemainingMs: fakeRemaining(b, now) };
        return state;
      case "resume": {
        const left = state.pausedRemainingMs;
        if (left === null) return state;
        if (state.phase === "bet") return { ...state, phaseEndsAt: now + left, pausedRemainingMs: null };
        return { ...state, pausedRemainingMs: null, bomb: b ? { ...b, clock: { at: now, remainingMs: left } } : b };
      }
      case "swap-defuser": {
        if (!b || (state.phase !== "bet" && state.phase !== "briefing")) return state;
        const t = team(state, b.teamId)!;
        const defuserId = nextDefuser(t, b.defuserId);
        if (defuserId === b.defuserId) return state;
        const queue = state.queue.map((q, i) => (i === state.turn ? { ...q, defuserId } : q));
        const members = t.members.filter((id) => id !== defuserId);
        const bomb = { ...b, defuserId, pages: assignPages(buildManual(b.rules).length, members, makeRng(deriveSeed(deriveSeed(state.seed, 1000 + state.turn), 7))) };
        return { ...state, queue, bomb };
      }
      case "strike-undo":
        return undoStrike(state, now);
      case "explode":
        return state.phase === "defuse" ? closeTurn(state, "exploded", "host", now, now) : state;
      case "defuse":
        return state.phase === "defuse" ? closeTurn(state, "defused", "host", now, now) : state;
      case "skip-team":
        return playing && b ? skipTurn(state, now) : state;
      case "next":
        if (state.phase === "outcome") return advance(state, now);
        return state.phase === "final" ? enter(state, "done", now) : state;
      case "end":
        return playing || state.phase === "outcome" ? enter(state, "final", now) : state;
    }
  },

  isFinished: (state) => state.phase === "done",
  scores: (state): ScoreDelta[] => totalsToScores(playerTotals(state), "Artificieri"),
  result: (state) => rankByPoints(playerTotals(state), state.players),

  screenView(state) {
    const b = state.bomb;
    // La bomba compare sulla TV solo dopo «Inizia»; regole e soluzioni non ci sono mai.
    const bomb =
      b && BOMB_PHASES.includes(state.phase)
        ? { edgework: b.edgework, modules: b.modules.map((m) => tvModule(state, m)), selected: b.selected }
        : null;
    return { ...publicBase(state), bomb };
  },

  viewFor(state, playerId) {
    const base = publicBase(state);
    const b = state.bomb;
    if (!state.players.includes(playerId) || !b || state.phase === "final" || state.phase === "done") return { ...base, me: null };
    const inTeam = team(state, b.teamId)!.members.includes(playerId);
    if (!inTeam) {
      return { ...base, me: { id: playerId, role: "bettor" as const, canBet: state.phase === "bet", myBet: state.bets[playerId] ?? null } };
    }
    if (playerId === b.defuserId) {
      return {
        ...base,
        me: {
          id: playerId,
          role: "defuser" as const,
          canStart: state.phase === "briefing",
          ...(state.phase === "defuse" && { controls: b.modules.map(controlsOf), selected: b.selected }),
        },
      };
    }
    // Esperto: solo le proprie pagine del manuale (il titolo di tutte, con chi le ha, per sapere a chi chiedere).
    const manual = state.phase === "briefing" || state.phase === "defuse" ? buildManual(b.rules) : [];
    const mine = b.pages[playerId] ?? [];
    return {
      ...base,
      me: {
        id: playerId,
        role: "expert" as const,
        index: manual.map((p) => ({ id: p.id, title: p.title, owners: Object.keys(b.pages).filter((e) => b.pages[e]!.includes(p.id)).map((e) => nick(state, e)), mine: mine.includes(p.id) })),
        manual: manual.filter((p) => mine.includes(p.id)),
      },
    };
  },

  hostView(state) {
    const b = state.bomb;
    const playing = state.phase === "bet" || state.phase === "briefing" || state.phase === "defuse";
    const paused = state.pausedRemainingMs !== null;
    const canUndo = !!b?.lastStrike && (state.phase === "defuse" || (state.phase === "outcome" && b.outcome?.reason === "strikes"));
    return {
      info: {
        ...publicBase(state),
        // La regia vede tutto, soluzioni comprese, per aiutare le squadre in difficoltà.
        bets: Object.entries(state.bets).map(([id, bet]) => ({ ...person(state, id), bet })),
        bomb: b && {
          edgework: b.edgework,
          selected: b.selected,
          strikes: b.strikes,
          modules: b.modules.map((m) => ({
            id: m.id,
            kind: m.kind,
            solved: m.solved,
            data: m.data,
            progress: m.progress,
            ...hostSolution(m, b),
          })),
          pages: Object.entries(b.pages).map(([id, pages]) => ({ ...person(state, id), pages })),
          manual: buildManual(b.rules),
        },
        canUndoStrike: canUndo,
      },
      actions: [
        { id: "start", label: "Inizia", enabled: state.phase === "briefing" },
        { id: "next", label: "Avanti", enabled: state.phase === "outcome" || state.phase === "final" },
        paused ? { id: "resume", label: "Riprendi", enabled: true } : { id: "pause", label: "Pausa", enabled: (state.phase === "bet" && state.phaseEndsAt !== null) || state.phase === "defuse" },
        { id: "swap-defuser", label: "Cambia artificiere", enabled: state.phase === "bet" || state.phase === "briefing" },
        { id: "strike-undo", label: "Annulla l'ultimo errore", enabled: canUndo, danger: true },
        { id: "explode", label: "Esplodi", enabled: state.phase === "defuse", danger: true },
        { id: "defuse", label: "Disinnesca", enabled: state.phase === "defuse", danger: true },
        { id: "skip-team", label: "Salta la squadra", enabled: playing, danger: true },
        { id: "end", label: "Termina il round", enabled: playing || state.phase === "outcome", danger: true },
      ],
    };
  },
};
