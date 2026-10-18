import { z } from "zod";
import { type MinigameType, type ParticipantInfo, type ScoreDelta, type TeamInfo, fairTime } from "@gioco/shared";
import { deriveSeed, makeRng, shuffle } from "../knight-duel/rng.js";
import { GRACE_MS, rankByPoints, totalsToScores } from "../util.js";
import { type CounterScore, type Direction, type GuessScore, clampPos, majority, median, scoreFreeForAll, scoreTeams } from "./scoring.js";
import { DEFAULT_SPECTRA } from "./spectra.js";

/**
 * Lunghezza d'Onda: indizi su uno spettro, in stile Wavelength.
 * A turno un Sensitivo vede dove cade un bersaglio nascosto su uno spettro («Freddo ↔ Caldo») e dà un indizio;
 * gli altri spostano un quadrante per indovinare il punto. Due modalità: «tutti contro tutti» (ognuno per sé, il
 * Sensitivo prende la media) e «a squadre» (mediana della squadra, le altre scommettono sinistra o destra).
 * Regole e decisioni in docs/PIANO-LUNGHEZZA-ONDA.md.
 */

export type Mode = "tutti" | "squadre";
export type Phase = "pick" | "clue" | "guess" | "counter" | "reveal" | "final" | "done";
export type Role = "psychic" | "guesser" | "counter" | "spectator";

const sec = (title: string, description?: string) => ({ title, ...(description && { description }) });

const spectrumSchema = z.object({
  left: z.string().trim().min(1).max(40).meta({ title: "Estremo sinistro" }),
  right: z.string().trim().min(1).max(40).meta({ title: "Estremo destro" }),
});

export const lunghezzaOndaConfigSchema = z.object({
  mode: z
    .enum(["tutti", "squadre"])
    .default("tutti")
    .meta({ ...sec("Modalità", "Tutti contro tutti: ognuno indovina per sé. A squadre: indovina la squadra del Sensitivo, le altre scommettono"), enumLabels: { tutti: "Tutti contro tutti", squadre: "A squadre" } }),
  spectra: z.array(spectrumSchema).min(2).max(300).default(DEFAULT_SPECTRA).meta({ title: "Spettri", itemLabel: "Spettro", description: "Coppie di estremi. Il Sensitivo ne vede due a turno e ne sceglie uno" }),
  turns: z.number().int().min(0).max(30).default(0).meta(sec("Turni", "0 = automatico: tutti contro tutti un turno per giocatore (al massimo 8); a squadre fino al punteggio da raggiungere (al massimo 20 turni)")),
  targetScore: z.number().int().min(1).max(50).default(10).meta(sec("Punteggio da raggiungere (a squadre)")),
  zoneWidth: z.number().int().min(2).max(10).default(5).meta(sec("Larghezza di una fascia (su 100)", "Il bersaglio ha 5 fasce: 2, 3, 4, 3, 2 punti")),
  edgeMargin: z.number().int().min(0).max(20).default(5).meta(sec("Distanza minima del bersaglio dai bordi (su 100)")),
  pickSeconds: z.number().int().min(5).max(120).default(20).meta(sec("Tempo per scegliere lo spettro (s)", "Allo scadere sceglie il server")),
  clueSeconds: z.number().int().min(0).max(300).default(60).meta(sec("Tempo per l'indizio (s)", "0 = senza limite. Allo scadere il turno salta")),
  guessSeconds: z.number().int().min(10).max(300).default(60).meta(sec("Tempo per indovinare (s)", "Finisce prima se tutti confermano")),
  counterSeconds: z.number().int().min(5).max(120).default(20).meta(sec("Tempo per la scommessa sinistra/destra (s, a squadre)")),
  catchUp: z.boolean().default(true).meta(sec("Recupero (a squadre)", "Chi fa 4 punti ed è ancora dietro gioca subito un altro turno (una volta di fila)")),
  unitPoints: z.number().int().min(0).max(1000).default(25).meta(sec("Punti in classifica per punto del quadrante", "Con 25 il centro del bersaglio vale 100")),
  counterPoints: z.number().int().min(0).max(4).default(1).meta(sec("Punti della scommessa giusta (a squadre)")),
});

export type LunghezzaOndaConfig = z.infer<typeof lunghezzaOndaConfigSchema>;

const posSchema = z.number().finite().min(0).max(100);
const inputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pick"), index: z.number().int().min(0).max(1) }),
  z.object({ type: z.literal("clue"), text: z.string().trim().min(1).max(60) }),
  /** Spostamento del quadrante (a squadre durante il trascinamento): toglie la conferma. */
  z.object({ type: z.literal("dial"), pos: posSchema }),
  /** Posizione definitiva: imposta e conferma insieme. */
  z.object({ type: z.literal("confirm"), pos: posSchema }),
  z.object({ type: z.literal("counter"), dir: z.enum(["left", "right"]) }),
]);
const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("reject-clue") }),
  z.object({ type: z.literal("skip-turn") }),
  z.object({ type: z.literal("close") }),
  z.object({ type: z.literal("next") }),
  z.object({ type: z.literal("end") }),
]);
type Input = z.infer<typeof inputSchema>;
type Command = z.infer<typeof commandSchema>;

export interface Spectrum {
  left: string;
  right: string;
}

export interface Team {
  id: string;
  name: string;
  color: string;
  /** In ordine di turno come Sensitivo. */
  members: string[];
}

export interface Dial {
  pos: number;
  /** Ora equa dell'invio: un messaggio vecchio arrivato in ritardo non sovrascrive uno più recente. */
  time: number;
  confirmed: boolean;
}

export interface TurnResult {
  number: number;
  psychicId: string;
  teamId: string | null;
  spectrum: Spectrum;
  clue: string;
  target: number;
  /** Tutti contro tutti: posizioni e punti di ognuno. A squadre: posizioni dei membri (punti 0). */
  guesses: GuessScore[];
  psychicPoints: number;
  /** A squadre: mediana della squadra, fascia colpita e scommesse delle altre squadre. */
  teamPos: number | null;
  zone: 0 | 2 | 3 | 4;
  counters: CounterScore[];
}

export interface Turn {
  /** Da 1, contando anche i turni saltati. */
  number: number;
  psychicId: string;
  teamId: string | null;
  /** Turno di recupero (a squadre). */
  catchUp: boolean;
  /** Le due proposte: solo il Sensitivo le vede. */
  options: Spectrum[];
  spectrum: Spectrum | null;
  /** SEGRETO fino alla rivelazione (lo vedono solo il Sensitivo, da `clue`, e la regia). */
  target: number;
  clue: string | null;
  dials: Record<string, Dial>;
  counter: Record<string, Direction>;
  result: TurnResult | null;
}

export interface LunghezzaOndaState {
  cfg: LunghezzaOndaConfig;
  seed: number;
  participants: ParticipantInfo[];
  players: string[];
  /** Vuoto in «tutti contro tutti». */
  teams: Team[];
  /** Tutti contro tutti: ordine dei Sensitivi. A squadre: ordine delle squadre. */
  order: string[];
  /** A squadre: quanti turni ha avuto ogni squadra (per far ruotare il Sensitivo tra i membri). */
  teamTurns: Record<string, number>;
  turn: Turn;
  /** Turni conclusi, saltati compresi. */
  played: number;
  maxTurns: number;
  /** Spettri giocati in questo round (chiave «sinistra|destra»). */
  used: string[];
  /** Spettri dei round precedenti della partita (`ctx.seen`). */
  seen: string[];
  history: TurnResult[];
  /** Tutti contro tutti: punti in classifica per giocatore. A squadre: punti del quadrante per squadra (2–4 e scommesse). */
  board: Record<string, number>;
  endAfterTurn: boolean;
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
}

type S = LunghezzaOndaState;

const nick = (s: S, id: string) => s.participants.find((p) => p.id === id)?.nickname ?? "?";
const keyOf = (sp: Spectrum) => `${sp.left}|${sp.right}`;
const teamById = (s: S, id: string | null) => s.teams.find((t) => t.id === id);
const teamOfPlayer = (s: S, playerId: string) => s.teams.find((t) => t.members.includes(playerId));

// ---- Squadre ----

const RANDOM_TEAMS = [
  { id: "rossi", name: "Rossi", color: "#e5484d" },
  { id: "blu", name: "Blu", color: "#3e63dd" },
];
const FALLBACK_COLORS = ["#e5484d", "#3e63dd", "#30a46c", "#f5a524", "#8e4ec6", "#12a594"];

/**
 * Squadre del round: i team della serata se almeno due hanno giocatori (chi non ha un team va nella squadra più
 * piccola), altrimenti due squadre estratte a caso. I membri sono mescolati: è l'ordine dei Sensitivi.
 */
export function formTeams(players: ParticipantInfo[], teams: TeamInfo[], rng: () => number): Team[] {
  const withPlayers = teams.filter((t) => players.some((p) => p.teamId === t.id));
  if (withPlayers.length >= 2) {
    const out = withPlayers.map((t, i) => ({
      id: t.id,
      name: t.name,
      color: t.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]!,
      members: players.filter((p) => p.teamId === t.id).map((p) => p.id),
    }));
    for (const p of players) {
      if (out.some((t) => t.members.includes(p.id))) continue;
      const smallest = out.reduce((a, b) => (b.members.length < a.members.length ? b : a));
      smallest.members.push(p.id);
    }
    return out.map((t) => ({ ...t, members: shuffle(t.members, rng) }));
  }
  const mixed = shuffle(players.map((p) => p.id), rng);
  return RANDOM_TEAMS.map((t, i) => ({ ...t, members: mixed.filter((_, j) => j % 2 === i) }));
}

/** A squadre servono almeno 2 squadre con almeno 2 giocatori: il motivo se non ci sono, altrimenti `null`. */
export function teamsProblem(players: ParticipantInfo[], teams: TeamInfo[]): string | null {
  const small = formTeams(players, teams, () => 0).find((t) => t.members.length < 2);
  return small ? `a squadre servono almeno 2 giocatori per squadra («${small.name}» ne ha ${small.members.length})` : null;
}

/** Chi indovina: tutti tranne il Sensitivo, oppure (a squadre) i compagni del Sensitivo. */
export function guessers(s: S): string[] {
  const pool = s.cfg.mode === "squadre" ? (teamById(s, s.turn.teamId)?.members ?? []) : s.players;
  return pool.filter((id) => id !== s.turn.psychicId);
}

/** Chi scommette sinistra/destra (solo a squadre): i membri delle altre squadre. */
export function counterVoters(s: S): string[] {
  if (s.cfg.mode !== "squadre") return [];
  return s.teams.filter((t) => t.id !== s.turn.teamId).flatMap((t) => t.members);
}

export function roleOf(s: S, playerId: string): Role {
  if (playerId === s.turn.psychicId) return "psychic";
  if (guessers(s).includes(playerId)) return "guesser";
  if (counterVoters(s).includes(playerId)) return "counter";
  return "spectator";
}

/** Posizione della squadra: mediana di chi ha mosso o confermato il quadrante. */
export function teamPosition(s: S): number | null {
  return median(guessers(s).flatMap((id) => (s.turn.dials[id] ? [s.turn.dials[id].pos] : [])));
}

// ---- Turni ----

/** Due spettri non ancora usati (né in questo round né nei precedenti); se non bastano, si riusano i vecchi. */
function pickOptions(s: Pick<S, "cfg" | "used" | "seen">, rng: () => number): Spectrum[] {
  const all = [...new Map(s.cfg.spectra.map((sp) => [keyOf(sp), sp])).values()];
  const fresh = all.filter((sp) => !s.used.includes(keyOf(sp)) && !s.seen.includes(keyOf(sp)));
  const notUsed = all.filter((sp) => !s.used.includes(keyOf(sp)));
  const pool = fresh.length >= 2 ? fresh : notUsed.length >= 2 ? notUsed : all;
  return shuffle(pool, rng).slice(0, 2);
}

function makeTurn(s: Pick<S, "cfg" | "used" | "seen" | "seed">, number: number, psychicId: string, teamId: string | null, catchUp: boolean): Turn {
  const rng = makeRng(deriveSeed(s.seed, number));
  const options = pickOptions(s, rng);
  const edge = s.cfg.edgeMargin;
  const target = clampPos(edge + rng() * (100 - 2 * edge));
  return { number, psychicId, teamId, catchUp, options, spectrum: null, target, clue: null, dials: {}, counter: {}, result: null };
}

function enter(s: S, phase: Phase, now: number, seconds: number | null): S {
  return { ...s, phase, phaseStartedAt: now, phaseEndsAt: seconds ? now + seconds * 1000 : null, pausedRemainingMs: null };
}

/** Prossimo Sensitivo: a rotazione, a squadre alternando le squadre (o la stessa, per il recupero). */
function startTurn(s: S, now: number): S {
  const number = s.played + 1;
  if (s.cfg.mode === "tutti") {
    const psychicId = s.order[(number - 1) % s.order.length]!;
    return enter({ ...s, turn: makeTurn(s, number, psychicId, null, false) }, "pick", now, s.cfg.pickSeconds);
  }
  const { teamId, catchUp } = nextTeam(s);
  const team = teamById(s, teamId)!;
  const k = s.teamTurns[teamId] ?? 0;
  const psychicId = team.members[k % team.members.length]!;
  return enter(
    { ...s, turn: makeTurn(s, number, psychicId, teamId, catchUp), teamTurns: { ...s.teamTurns, [teamId]: k + 1 } },
    "pick",
    now,
    s.cfg.pickSeconds,
  );
}

function nextTeam(s: S): { teamId: string; catchUp: boolean } {
  if (s.played === 0) return { teamId: s.order[0]!, catchUp: false };
  const last = s.turn;
  const lastTeam = last.teamId ?? s.order[0]!;
  const rivals = s.teams.filter((t) => t.id !== lastTeam).map((t) => s.board[t.id] ?? 0);
  if (s.cfg.catchUp && last.result?.zone === 4 && !last.catchUp && (s.board[lastTeam] ?? 0) < Math.max(0, ...rivals)) {
    return { teamId: lastTeam, catchUp: true };
  }
  return { teamId: s.order[(s.order.indexOf(lastTeam) + 1) % s.order.length]!, catchUp: false };
}

function isOver(s: S): boolean {
  if (s.endAfterTurn || s.played >= s.maxTurns) return true;
  return s.cfg.mode === "squadre" && s.teams.some((t) => (s.board[t.id] ?? 0) >= s.cfg.targetScore);
}

/** Il turno è concluso (giocato o saltato): il prossimo, oppure la classifica finale. */
function afterTurn(s: S, now: number): S {
  const next = { ...s, played: s.played + 1 };
  return isOver(next) ? enter(next, "final", now, null) : startTurn(next, now);
}

function pick(s: S, index: number, now: number): S {
  const spectrum = s.turn.options[index];
  if (!spectrum) return s;
  return enter({ ...s, turn: { ...s.turn, spectrum } }, "clue", now, s.cfg.clueSeconds);
}

function startGuess(s: S, now: number): S {
  const next = enter({ ...s, turn: { ...s.turn, dials: {}, counter: {} } }, "guess", now, s.cfg.guessSeconds);
  return guessers(next).length === 0 ? closeGuess(next, now) : next;
}

function closeGuess(s: S, now: number): S {
  if (s.cfg.mode === "squadre" && teamPosition(s) !== null && counterVoters(s).length > 0) {
    return enter(s, "counter", now, s.cfg.counterSeconds);
  }
  return reveal(s, now);
}

/** Apre il coperchio: calcola punti del turno, tabellone e cronologia. */
function reveal(s: S, now: number): S {
  const t = s.turn;
  const spectrum = t.spectrum!;
  const ids = guessers(s).filter((id) => t.dials[id]);
  const dials = ids.map((id) => ({ playerId: id, pos: t.dials[id]!.pos }));
  let result: TurnResult;
  let board = s.board;
  if (s.cfg.mode === "tutti") {
    const { guesses, psychicPoints } = scoreFreeForAll(dials, t.target, s.cfg.zoneWidth, s.cfg.unitPoints);
    board = { ...board };
    for (const g of guesses) board[g.playerId] = (board[g.playerId] ?? 0) + g.points;
    board[t.psychicId] = (board[t.psychicId] ?? 0) + psychicPoints;
    result = {
      number: t.number,
      psychicId: t.psychicId,
      teamId: null,
      spectrum,
      clue: t.clue ?? "",
      target: t.target,
      guesses,
      psychicPoints,
      teamPos: null,
      zone: 0,
      counters: [],
    };
  } else {
    const teamPos = teamPosition(s);
    const counters = s.teams
      .filter((team) => team.id !== t.teamId)
      .map((team) => ({ teamId: team.id, dir: majority(team.members.flatMap((id) => (t.counter[id] ? [t.counter[id]] : []))) }));
    const scored = scoreTeams(teamPos, t.target, s.cfg.zoneWidth, counters, s.cfg.counterPoints);
    board = { ...board, [t.teamId!]: (board[t.teamId!] ?? 0) + scored.zone };
    for (const c of scored.counters) board[c.teamId] = (board[c.teamId] ?? 0) + c.points;
    result = {
      number: t.number,
      psychicId: t.psychicId,
      teamId: t.teamId,
      spectrum,
      clue: t.clue ?? "",
      target: t.target,
      guesses: dials.map((d) => ({ ...d, zone: 0, points: 0 })),
      psychicPoints: 0,
      teamPos,
      zone: scored.zone,
      counters: scored.counters,
    };
  }
  return enter(
    { ...s, turn: { ...t, result }, board, history: [...s.history, result], used: [...new Set([...s.used, keyOf(spectrum)])] },
    "reveal",
    now,
    null,
  );
}

/** Ora equa di un invio se arriva in tempo per la fase in corso, altrimenti `null`. */
function onTime(s: S, meta: { receivedAt: number; claimedTime: number; rtt: number | null }): number | null {
  if (s.pausedRemainingMs !== null) return null;
  if (s.phaseEndsAt === null) return meta.receivedAt;
  if (meta.receivedAt > s.phaseEndsAt + GRACE_MS) return null;
  const time = fairTime({ claimed: meta.claimedTime, receivedAt: meta.receivedAt, rtt: meta.rtt, openedAt: s.phaseStartedAt });
  return time > s.phaseEndsAt ? null : time;
}

function setDial(s: S, playerId: string, rawPos: number, confirm: boolean, time: number, now: number): S {
  const pos = clampPos(rawPos);
  const prev = s.turn.dials[playerId];
  if (prev && prev.time > time) return s;
  if (prev && prev.pos === pos && prev.confirmed === confirm) return s;
  const next = { ...s, turn: { ...s.turn, dials: { ...s.turn.dials, [playerId]: { pos, time, confirmed: confirm } } } };
  return confirm && guessers(next).every((id) => next.turn.dials[id]?.confirmed) ? closeGuess(next, now) : next;
}

function expire(s: S, now: number): S {
  switch (s.phase) {
    case "pick":
      return pick(s, 0, now);
    case "clue":
      return afterTurn(s, now); // niente indizio: il turno salta
    case "guess":
      return closeGuess(s, now);
    case "counter":
      return reveal(s, now);
    default:
      return s;
  }
}

const PLAYING: Phase[] = ["pick", "clue", "guess", "counter"];

// ---- Punti ----

/** Punti in classifica per giocatore. */
function playerTotals(s: S): Record<string, number> {
  if (s.cfg.mode === "tutti") return s.board;
  const totals: Record<string, number> = {};
  for (const team of s.teams) for (const id of team.members) totals[id] = (s.board[team.id] ?? 0) * s.cfg.unitPoints;
  return totals;
}

function scoresOf(s: S): ScoreDelta[] {
  return totalsToScores(playerTotals(s), "Lunghezza d'Onda");
}

// ---- Viste ----

/** I valori delle regole di questa partita, per la pagina «Regole» del telefono. Sono pubblici. */
export interface RulesInfo {
  mode: Mode;
  turns: number;
  targetScore: number;
  zoneWidth: number;
  unitPoints: number;
  counterPoints: number;
  catchUp: boolean;
  clueSeconds: number;
  guessSeconds: number;
  counterSeconds: number;
}

const rulesOf = (s: S): RulesInfo => ({
  mode: s.cfg.mode,
  turns: s.maxTurns,
  targetScore: s.cfg.targetScore,
  zoneWidth: s.cfg.zoneWidth,
  unitPoints: s.cfg.unitPoints,
  counterPoints: s.cfg.counterPoints,
  catchUp: s.cfg.catchUp,
  clueSeconds: s.cfg.clueSeconds,
  guessSeconds: s.cfg.guessSeconds,
  counterSeconds: s.cfg.counterSeconds,
});

const revealed = (s: S) => s.phase === "reveal" || s.phase === "final" || s.phase === "done";

/**
 * Parte pubblica, uguale per TV e telefoni: niente bersaglio (la chiave non c'è) né proposte del Sensitivo; in
 * «tutti contro tutti» niente posizioni altrui prima della rivelazione, a squadre quelle della squadra di turno.
 */
function publicView(s: S) {
  const t = s.turn;
  const live = s.phase === "guess" || s.phase === "counter";
  const team = s.cfg.mode === "squadre";
  const gs = guessers(s);
  const voters = counterVoters(s);
  const totals = playerTotals(s);
  return {
    phase: s.phase,
    phaseStartedAt: s.phaseStartedAt,
    phaseEndsAt: s.phaseEndsAt,
    pausedRemainingMs: s.pausedRemainingMs,
    mode: s.cfg.mode,
    rules: rulesOf(s),
    played: s.played,
    maxTurns: s.maxTurns,
    turn: {
      number: t.number,
      catchUp: t.catchUp,
      psychic: { id: t.psychicId, nickname: nick(s, t.psychicId) },
      teamId: t.teamId,
      spectrum: t.spectrum,
      clue: t.clue,
    },
    teams: s.teams.map((x) => ({ id: x.id, name: x.name, color: x.color, score: s.board[x.id] ?? 0, members: x.members.map((id) => ({ id, nickname: nick(s, id) })) })),
    standings: s.players
      .map((id) => ({ id, nickname: nick(s, id), points: totals[id] ?? 0 }))
      .sort((a, b) => b.points - a.points || a.nickname.localeCompare(b.nickname, "it")),
    guessers: s.phase === "guess" ? gs.length : 0,
    confirmed: s.phase === "guess" ? gs.filter((id) => t.dials[id]?.confirmed).length : 0,
    teamDials: team && live ? gs.flatMap((id) => (t.dials[id] ? [{ playerId: id, nickname: nick(s, id), pos: t.dials[id].pos, confirmed: t.dials[id].confirmed }] : [])) : null,
    teamPos: team && live ? teamPosition(s) : null,
    counterVoters: s.phase === "counter" ? voters.length : 0,
    counterVoted: s.phase === "counter" ? voters.filter((id) => t.counter[id]).length : 0,
    result: revealed(s) ? t.result : null,
    history: s.phase === "final" || s.phase === "done" ? s.history : [],
  };
}

export const lunghezzaOnda: MinigameType<LunghezzaOndaConfig, LunghezzaOndaState, Input, Command> = {
  id: "lunghezza-onda",
  title: "Lunghezza d'Onda",
  defaultTheme: "gameshow",
  configSchema: lunghezzaOndaConfigSchema as unknown as z.ZodType<LunghezzaOndaConfig>,
  inputSchema,
  commandSchema,
  minPlayers: 3,
  maxPlayers: 30,
  sampleConfig: {
    mode: "tutti",
    spectra: DEFAULT_SPECTRA,
    turns: 0,
    targetScore: 10,
    zoneWidth: 5,
    edgeMargin: 5,
    pickSeconds: 20,
    clueSeconds: 60,
    guessSeconds: 60,
    counterSeconds: 20,
    catchUp: true,
    unitPoints: 25,
    counterPoints: 1,
  },

  /** A squadre il round parte solo con almeno 2 squadre da almeno 2 giocatori (lo controlla l'avvio della partita). */
  buildConfig(raw, _lookup, roster) {
    const parsed = lunghezzaOndaConfigSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "configurazione non valida" };
    const problem = parsed.data.mode === "squadre" ? teamsProblem(roster.players, roster.teams) : null;
    return problem ? { ok: false, error: problem } : { ok: true, config: parsed.data };
  },

  init(config, ctx, now) {
    const rng = makeRng(ctx.seed);
    const players = ctx.players.map((p) => p.id);
    const teams = config.mode === "squadre" ? formTeams(ctx.players, ctx.teams, rng) : [];
    const order = config.mode === "squadre" ? shuffle(teams.map((t) => t.id), rng) : shuffle(players, rng);
    const maxTurns = config.turns || (config.mode === "squadre" ? 20 : Math.min(Math.max(1, players.length), 8));
    const base: S = {
      cfg: config,
      seed: ctx.seed,
      participants: ctx.players,
      players,
      teams,
      order,
      teamTurns: {},
      turn: makeTurn({ cfg: config, used: [], seen: ctx.seen ?? [], seed: ctx.seed }, 1, order[0] ?? "", null, false),
      played: 0,
      maxTurns,
      used: [],
      seen: ctx.seen ?? [],
      history: [],
      board: {},
      endAfterTurn: false,
      phase: "pick",
      phaseStartedAt: now,
      phaseEndsAt: null,
      pausedRemainingMs: null,
    };
    return startTurn(base, now);
  },

  onInput(state, playerId, input, meta) {
    if (!state.players.includes(playerId)) return state;
    const at = meta.receivedAt;
    const t = state.turn;
    switch (input.type) {
      case "pick":
        return state.phase === "pick" && playerId === t.psychicId && state.pausedRemainingMs === null ? pick(state, input.index, at) : state;
      case "clue":
        if (state.phase !== "clue" || playerId !== t.psychicId || state.pausedRemainingMs !== null) return state;
        return startGuess({ ...state, turn: { ...t, clue: input.text } }, at);
      case "dial":
      case "confirm": {
        if (state.phase !== "guess" || !guessers(state).includes(playerId)) return state;
        const time = onTime(state, meta);
        return time === null ? state : setDial(state, playerId, input.pos, input.type === "confirm", time, at);
      }
      case "counter": {
        if (state.phase !== "counter" || !counterVoters(state).includes(playerId) || t.counter[playerId] === input.dir) return state;
        if (onTime(state, meta) === null) return state;
        const next = { ...state, turn: { ...t, counter: { ...t.counter, [playerId]: input.dir } } };
        return counterVoters(next).every((id) => next.turn.counter[id]) ? reveal(next, at) : next;
      }
    }
  },

  onTick(state, now) {
    if (state.pausedRemainingMs !== null || state.phaseEndsAt === null) return state;
    // Chi indovina o scommette ha la tolleranza sulla scadenza (un invio in tempo può arrivare un po' dopo).
    const grace = state.phase === "guess" || state.phase === "counter" ? GRACE_MS : 0;
    return now >= state.phaseEndsAt + grace ? expire(state, now) : state;
  },

  onHostCommand(state, command, now) {
    switch (command.type) {
      case "pause":
        if (!PLAYING.includes(state.phase) || state.pausedRemainingMs !== null || state.phaseEndsAt === null) return state;
        return { ...state, pausedRemainingMs: Math.max(0, state.phaseEndsAt - now), phaseEndsAt: null };
      case "resume":
        return state.pausedRemainingMs === null ? state : { ...state, phaseEndsAt: now + state.pausedRemainingMs, pausedRemainingMs: null };
      case "reject-clue":
        // Indizio non valido: il Sensitivo lo riscrive, il tempo riparte.
        return state.phase === "guess" ? enter({ ...state, turn: { ...state.turn, clue: null, dials: {}, counter: {} } }, "clue", now, state.cfg.clueSeconds) : state;
      case "skip-turn":
        return PLAYING.includes(state.phase) ? afterTurn(state, now) : state;
      case "close":
        return PLAYING.includes(state.phase) ? expire(state, now) : state;
      case "next":
        if (state.phase === "reveal") return afterTurn(state, now);
        return state.phase === "final" ? enter(state, "done", now, null) : state;
      case "end":
        if (state.phase === "pick" || state.phase === "clue" || state.phase === "reveal") return enter(state, "final", now, null);
        return PLAYING.includes(state.phase) && !state.endAfterTurn ? { ...state, endAfterTurn: true } : state;
    }
  },

  isFinished: (state) => state.phase === "done",
  scores: (state) => scoresOf(state),
  result: (state) => rankByPoints(playerTotals(state), state.players),
  shownItems: (state) => state.used,

  screenView(state) {
    return publicView(state);
  },

  viewFor(state, playerId) {
    if (!state.players.includes(playerId)) return { ...publicView(state), me: null };
    const t = state.turn;
    const role = roleOf(state, playerId);
    const psychic = role === "psychic";
    const myTeam = teamOfPlayer(state, playerId);
    const dial = t.dials[playerId];
    return {
      ...publicView(state),
      me: {
        id: playerId,
        role,
        teamId: myTeam?.id ?? null,
        ...(psychic && state.phase === "pick" && { options: t.options }),
        // Il bersaglio: solo al Sensitivo e solo dopo la scelta dello spettro (prima la chiave non c'è).
        ...(psychic && (state.phase === "clue" || state.phase === "guess" || state.phase === "counter") && { target: t.target }),
        myDial: dial?.pos ?? null,
        confirmed: dial?.confirmed ?? false,
        myCounter: t.counter[playerId] ?? null,
        // Le scommesse dei compagni di squadra (mai quelle delle altre squadre).
        teamCounter:
          role === "counter" && state.phase === "counter" && myTeam
            ? myTeam.members.flatMap((id) => (t.counter[id] ? [{ playerId: id, nickname: nick(state, id), dir: t.counter[id] }] : []))
            : null,
      },
    };
  },

  hostView(state) {
    const t = state.turn;
    const playing = PLAYING.includes(state.phase);
    const dials = Object.entries(t.dials).map(([id, d]) => `${nick(state, id)}: ${d.pos}${d.confirmed ? " ✓" : ""}`);
    return {
      info: {
        phase: state.phase,
        Modalità: state.cfg.mode === "squadre" ? "A squadre" : "Tutti contro tutti",
        Turno: `${Math.min(t.number, state.maxTurns)} / ${state.maxTurns}${t.catchUp ? " (recupero)" : ""}`,
        Sensitivo: nick(state, t.psychicId),
        Spettro: t.spectrum ? `${t.spectrum.left} ↔ ${t.spectrum.right}` : t.options.map((o) => `${o.left} ↔ ${o.right}`).join(" / "),
        "Bersaglio (segreto)": t.target,
        Indizio: t.clue ?? "—",
        Posizioni: dials.length ? dials.join(", ") : "—",
        ...(state.cfg.mode === "squadre" && { Punteggio: state.teams.map((x) => `${x.name} ${state.board[x.id] ?? 0}`).join(" · ") }),
        ...(state.endAfterTurn && { Nota: "Il round finisce dopo questo turno" }),
      },
      actions: [
        { id: "next", label: state.phase === "final" ? "Concludi" : "Avanti", enabled: state.phase === "reveal" || state.phase === "final" },
        { id: "close", label: "Chiudi la fase", enabled: playing, danger: true },
        { id: "reject-clue", label: "Indizio non valido", enabled: state.phase === "guess", danger: true },
        { id: "skip-turn", label: "Salta il turno", enabled: playing, danger: true },
        { id: "end", label: "Termina dopo questo turno", enabled: (playing && !state.endAfterTurn) || state.phase === "reveal", danger: true },
        state.pausedRemainingMs !== null
          ? { id: "resume", label: "Riprendi", enabled: true }
          : { id: "pause", label: "Pausa", enabled: playing && state.phaseEndsAt !== null },
      ],
    };
  },
};
