import { z } from "zod";
import { type Door, type MinigameType, type ParticipantInfo, type Patrol, type ScoreDelta, fairTime } from "@gioco/shared";
import { type TeamEntry, formTeams, tooSmallTeams } from "../artificieri/turns.js";
import { deriveSeed, makeRng, shuffle } from "../knight-duel/rng.js";
import { GRACE_MS, rankByPoints } from "../util.js";
import { type Course, type LevelParams, generateCourses, levelSpec, remainingSteps, routeLength } from "./generate.js";
import { BUMP_MS, type LaneRun, type MoveRules, initialRun, patrolCatch, stepLane } from "./move.js";

/**
 * Pilota alla cieca: gara a squadre in un labirinto con informazioni divise. Il pilota guarda la TV e muove la pedina ma
 * non vede i pericoli; ogni navigatore vede sul telefono un solo strato (mine, porte, chiavi, pattuglie) e deve
 * dirlo a voce. Le squadre corrono insieme (fino a 4 corsie sulla TV) oppure a turno.
 * Regole e decisioni in docs/PIANO-PILOTA-CIECO.md.
 */

export type Phase = "ready" | "run" | "level-end" | "final" | "done";
export type Layer = "mines" | "doors" | "keys" | "patrols";
export const LAYERS: Layer[] = ["mines", "doors", "keys", "patrols"];

/** Alla presentazione del livello si parte da soli dopo questi secondi (la regia può anticipare con «Via»). */
export const READY_SECONDS = 10;
/** Corsie sulla TV in «insieme»: oltre, le squadre si dividono in più gare di seguito. */
export const MAX_LANES = 4;

const sec = (title: string, description?: string) => ({ title, ...(description && { description }) });

export const pilotaConfigSchema = z.object({
  mode: z
    .enum(["insieme", "a-turno"])
    .default("insieme")
    .meta({ ...sec("Modalità", "Insieme: fino a 4 squadre in contemporanea, TV divisa in corsie. A turno: una squadra alla volta, labirinto a tutto schermo"), enumLabels: { insieme: "Insieme (corsie)", "a-turno": "A turno" } }),
  levels: z.number().int().min(1).max(5).default(3).meta(sec("Livelli")),
  size: z
    .enum(["piccolo", "medio", "grande"])
    .default("medio")
    .meta({ ...sec("Dimensione", "Al primo livello 9×9, 11×11 o 13×13; +2 a ogni livello fino a 13 (15 a turno)"), enumLabels: { piccolo: "Piccolo (9×9)", medio: "Medio (11×11)", grande: "Grande (13×13)" } }),
  mineDensity: z.number().int().min(0).max(20).default(8).meta(sec("Mine (% delle caselle)", "Aumentano a ogni livello, mai sul percorso più breve")),
  doors: z.number().int().min(0).max(8).default(3).meta(sec("Porte", "Si aprono e chiudono a periodi: l'orario lo vede solo chi ha lo strato «porte»")),
  keys: z.number().int().min(0).max(3).default(1).meta(sec("Chiavi", "Servono tutte per aprire l'uscita. 0 = uscita sempre aperta")),
  patrols: z.boolean().default(true).meta(sec("Pattuglie", "Dal livello 2")),
  stepMs: z.number().int().min(150).max(1000).default(350).meta(sec("Pausa tra due passi (ms)")),
  penaltyMs: z.number().int().min(0).max(10_000).default(3000).meta(sec("Blocco dopo una mina o una pattuglia (ms)")),
  levelSeconds: z.number().int().min(30).max(600).default(150).meta(sec("Durata di un livello (s)")),
  finishPoints: z.array(z.number().int().min(0).max(1000)).min(1).max(8).default([150, 100, 75, 50]).meta({ title: "Punti per ordine di arrivo", description: "Primo, secondo… (oltre la lista vale l'ultimo valore)", itemLabel: "Punti" }),
  distancePoints: z.number().int().min(0).max(100).default(50).meta(sec("Punti massimi a chi non arriva", "In proporzione alla strada fatta")),
  strikePenalty: z.number().int().min(0).max(100).default(10).meta(sec("Penalità per mina o pattuglia")),
});

export type PilotaConfig = z.infer<typeof pilotaConfigSchema>;

const inputSchema = z.discriminatedUnion("type", [z.object({ type: z.literal("move"), dir: z.enum(["up", "down", "left", "right"]) })]);
const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("go") }),
  /** Cambia il pilota della squadra (o di tutte, senza `teamId`) prima del via. */
  z.object({ type: z.literal("skip-pilot"), teamId: z.string().optional() }),
  z.object({ type: z.literal("finish-level") }),
  z.object({ type: z.literal("next") }),
  z.object({ type: z.literal("end") }),
]);
type Input = z.infer<typeof inputSchema>;
type Command = z.infer<typeof commandSchema>;

export interface LaneState {
  teamId: string;
  pilotId: string;
  /** Navigatore → strati che vede. */
  layers: Record<string, Layer[]>;
  /** Il livello della squadra: i segreti (mine, orari, chiavi, pattuglie) stanno solo qui e in `hostView`. */
  course: Course;
  run: LaneRun;
}

export interface LaneResult {
  teamId: string;
  finished: boolean;
  /** Tempo di arrivo dall'inizio della gara (ms), o `null` se non è arrivata. */
  elapsedMs: number | null;
  /** Strada fatta, da 0 a 1 (1 = arrivata). */
  progress: number;
  strikes: number;
  /** Assegnati quando tutte le squadre del livello hanno giocato. */
  points: number | null;
}

export interface PilotaState {
  cfg: PilotaConfig;
  seed: number;
  participants: ParticipantInfo[];
  players: string[];
  teams: TeamEntry[];
  /** Da 1. */
  level: number;
  courses: Record<string, Course>;
  /** Le gare del livello: ognuna con le squadre che corrono insieme. */
  units: string[][];
  unit: number;
  lanes: LaneState[];
  /** Risultati del livello in corso, gara per gara. */
  results: LaneResult[];
  /** Livelli conclusi (con i punti). */
  history: { level: number; results: LaneResult[] }[];
  /** I punti assegnati ai livelli conclusi si sono già sommati? */
  levelClosed: boolean;
  board: Record<string, number>;
  phase: Phase;
  phaseStartedAt: number;
  levelStartedAt: number | null;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
  pausedAt: number | null;
}

type S = PilotaState;

const nick = (s: S, id: string) => s.participants.find((p) => p.id === id)?.nickname ?? "?";
const person = (s: S, id: string) => ({ id, nickname: nick(s, id) });
const team = (s: S, id: string) => s.teams.find((t) => t.id === id)!;
const moveRules = (cfg: PilotaConfig): MoveRules => ({ stepMs: cfg.stepMs, penaltyMs: cfg.penaltyMs, bumpMs: BUMP_MS });
const params = (cfg: PilotaConfig): LevelParams => ({ mode: cfg.mode, size: cfg.size, mineDensity: cfg.mineDensity, doors: cfg.doors, keys: cfg.keys, patrols: cfg.patrols });
const lanesOf = (s: S) => s.lanes;

// ---- Livelli e gare ----

/** Gli strati che il livello ha davvero (uno senza mine non ha lo strato «mine»). */
function activeLayers(c: Course): Layer[] {
  return LAYERS.filter((l) => (l === "mines" ? c.mines : l === "doors" ? c.doors : l === "keys" ? c.keys : c.patrols).length > 0);
}

/** Strati ai navigatori: a turno, ogni strato ad almeno uno; con più navigatori che strati ne avanzano senza. */
function assignLayers(layers: Layer[], navigators: string[], rng: () => number): Record<string, Layer[]> {
  const out: Record<string, Layer[]> = Object.fromEntries(navigators.map((n) => [n, [] as Layer[]]));
  if (navigators.length === 0) return out;
  const order = shuffle(navigators, rng);
  layers.forEach((l, i) => out[order[i % order.length]!]!.push(l));
  return out;
}

const pilotOf = (t: TeamEntry, level: number, shift = 0) => t.order[(level - 1 + shift) % t.order.length]!;

function makeLane(s: S, teamId: string, shift = 0): LaneState {
  const t = team(s, teamId);
  const course = s.courses[teamId]!;
  const pilotId = pilotOf(t, s.level, shift);
  const navigators = t.members.filter((id) => id !== pilotId);
  const rng = makeRng(deriveSeed(s.seed, s.level * 1000 + s.unit * 10 + shift + 7));
  return { teamId, pilotId, layers: assignLayers(activeLayers(course), navigators, rng), course, run: initialRun(course) };
}

function enter(s: S, phase: Phase, now: number, seconds: number | null = null): S {
  return { ...s, phase, phaseStartedAt: now, phaseEndsAt: seconds ? now + seconds * 1000 : null, pausedRemainingMs: null, pausedAt: null };
}

function beginUnit(s: S, now: number): S {
  const base: S = { ...s, levelStartedAt: null };
  return enter({ ...base, lanes: s.units[s.unit]!.map((id) => makeLane(base, id)) }, "ready", now, READY_SECONDS);
}

function startLevel(s: S, level: number, now: number): S {
  const spec = levelSpec(params(s.cfg), level);
  const courses = generateCourses(s.seed, level, spec, s.teams.length);
  const ids = s.teams.map((t) => t.id);
  const units = s.cfg.mode === "insieme" ? Array.from({ length: Math.ceil(ids.length / MAX_LANES) }, (_, i) => ids.slice(i * MAX_LANES, (i + 1) * MAX_LANES)) : ids.map((id) => [id]);
  const next: S = { ...s, level, courses: Object.fromEntries(s.teams.map((t, i) => [t.id, courses[i]!])), units, unit: 0, results: [], levelClosed: false };
  return beginUnit(next, now);
}

function startRun(s: S, now: number): S {
  return enter({ ...s, levelStartedAt: now }, "run", now, s.cfg.levelSeconds);
}

// ---- Fine di una gara, punti ----

function resultOf(s: S, lane: LaneState): LaneResult {
  const finished = lane.run.finishedAt !== null;
  const total = Math.max(1, routeLength(lane.course));
  const left = finished ? 0 : remainingSteps(lane.course, lane.run.pos, lane.run.keysTaken);
  return {
    teamId: lane.teamId,
    finished,
    elapsedMs: finished ? lane.run.finishedAt! - s.levelStartedAt! : null,
    progress: finished ? 1 : Math.min(1, Math.max(0, 1 - left / total)),
    strikes: lane.run.strikes,
    points: null,
  };
}

/** Punti del livello: per ordine di arrivo (all'ora equa) a chi arriva, in proporzione alla strada a chi no, meno le penalità. */
export function levelPoints(cfg: PilotaConfig, results: LaneResult[]): LaneResult[] {
  const finishers = results.filter((r) => r.finished).sort((a, b) => a.elapsedMs! - b.elapsedMs! || a.teamId.localeCompare(b.teamId));
  return results.map((r) => {
    const rank = finishers.indexOf(r);
    const base = r.finished ? cfg.finishPoints[Math.min(rank, cfg.finishPoints.length - 1)]! : Math.round(cfg.distancePoints * r.progress);
    return { ...r, points: Math.max(0, base - cfg.strikePenalty * r.strikes) };
  });
}

/** Somma i punti del livello alla classifica (una volta sola). */
function closeLevel(s: S): S {
  if (s.levelClosed) return s;
  const results = levelPoints(s.cfg, s.results);
  const board = { ...s.board };
  for (const r of results) board[r.teamId] = (board[r.teamId] ?? 0) + (r.points ?? 0);
  return { ...s, results, board, history: [...s.history, { level: s.level, results }], levelClosed: true };
}

function endUnit(s: S, now: number): S {
  const next: S = { ...s, results: [...s.results, ...s.lanes.map((l) => resultOf(s, l))] };
  return enter(s.unit >= s.units.length - 1 ? closeLevel(next) : next, "level-end", now);
}

const allFinished = (s: S) => s.lanes.every((l) => l.run.finishedAt !== null);

function advance(s: S, now: number): S {
  if (s.unit < s.units.length - 1) return beginUnit({ ...s, unit: s.unit + 1 }, now);
  return s.level < s.cfg.levels ? startLevel(s, s.level + 1, now) : enter(s, "final", now);
}

// ---- Pausa ----

function shiftTimes(s: S, d: number): S {
  return {
    ...s,
    levelStartedAt: s.levelStartedAt === null ? null : s.levelStartedAt + d,
    lanes: s.lanes.map((l) => ({ ...l, run: { ...l.run, frozenUntil: l.run.frozenUntil + d, lastStepAt: l.run.lastStepAt + d, finishedAt: l.run.finishedAt === null ? null : l.run.finishedAt + d } })),
  };
}

// ---- Viste ----

function rank(s: S, lane: LaneState): number | null {
  if (lane.run.finishedAt === null) return null;
  return s.lanes.filter((l) => l.run.finishedAt !== null && l.run.finishedAt < lane.run.finishedAt!).length + 1;
}

/** Ciò che sa chiunque guardi la TV: i muri, le posizioni, le porte (dove sono, non quando si aprono), le mine già scoperte. */
function lanePublic(s: S, lane: LaneState) {
  const c = lane.course;
  const r = lane.run;
  const t = team(s, lane.teamId);
  return {
    teamId: lane.teamId,
    teamName: t.name,
    teamColor: t.color,
    pilot: person(s, lane.pilotId),
    w: c.w,
    h: c.h,
    cells: c.cells,
    start: c.start,
    exit: c.exit,
    checkpoints: c.checkpoints,
    doorCells: c.doors.map((d) => d.cell),
    pos: r.pos,
    frozenUntil: r.frozenUntil,
    strikes: r.strikes,
    keys: { total: c.keys.length, taken: r.keysTaken.length },
    keysTaken: r.keysTaken,
    hitMines: r.minesHit,
    finishedAt: r.finishedAt,
    rank: rank(s, lane),
    // A fine gara si scopre tutto, perché chi ha guardato capisca com'è andata.
    ...(s.phase === "level-end" && { reveal: { mines: c.mines, doors: c.doors, keys: c.keys, patrols: c.patrols } }),
  };
}

export interface RulesInfo {
  mode: PilotaConfig["mode"];
  levels: number;
  stepMs: number;
  penaltyMs: number;
  levelSeconds: number;
  keys: number;
  finishPoints: number[];
  distancePoints: number;
  strikePenalty: number;
}

function rulesOf(s: S): RulesInfo {
  const c = s.cfg;
  return { mode: c.mode, levels: c.levels, stepMs: c.stepMs, penaltyMs: c.penaltyMs, levelSeconds: c.levelSeconds, keys: c.keys, finishPoints: c.finishPoints, distancePoints: c.distancePoints, strikePenalty: c.strikePenalty };
}

const resultView = (r: LaneResult) => ({ teamId: r.teamId, finished: r.finished, elapsedMs: r.elapsedMs, progress: Math.round(r.progress * 100) / 100, strikes: r.strikes, points: r.points });

function publicBase(s: S) {
  return {
    phase: s.phase,
    phaseStartedAt: s.phaseStartedAt,
    phaseEndsAt: s.phaseEndsAt,
    pausedRemainingMs: s.pausedRemainingMs,
    levelStartedAt: s.levelStartedAt,
    settings: rulesOf(s),
    level: s.level,
    unit: s.unit,
    units: s.units.length,
    teams: s.teams.map((t) => ({ id: t.id, name: t.name, color: t.color, members: t.members.map((id) => person(s, id)) })),
    lanes: s.phase === "final" || s.phase === "done" ? [] : lanesOf(s).map((l) => lanePublic(s, l)),
    results: s.results.map(resultView),
    history: s.history.map((h) => ({ level: h.level, results: h.results.map(resultView) })),
    board: s.board,
  };
}

function layerData(lane: LaneState, layers: Layer[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const l of layers) {
    if (l === "mines") out.mines = lane.course.mines;
    if (l === "doors") out.doors = lane.course.doors as Door[];
    if (l === "keys") out.keys = lane.course.keys.filter((k) => !lane.run.keysTaken.includes(k));
    if (l === "patrols") out.patrols = lane.course.patrols as Patrol[];
  }
  return out;
}

export const pilotaCieco: MinigameType<PilotaConfig, PilotaState, Input, Command> = {
  id: "pilota-cieco",
  title: "Pilota alla cieca",
  defaultTheme: "pixel",
  configSchema: pilotaConfigSchema as unknown as z.ZodType<PilotaConfig>,
  inputSchema,
  commandSchema,
  minPlayers: 2,

  sampleConfig: pilotaConfigSchema.parse({}) as PilotaConfig,

  // Ogni team della serata con giocatori deve avere almeno 2 membri: il pilota e un navigatore.
  buildConfig(raw, _lookup, roster) {
    const parsed = pilotaConfigSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`).join("; ") };
    const small = tooSmallTeams(roster.players, roster.teams);
    if (small.length > 0) return { ok: false, error: `La squadra «${small[0]!.name}» ha un solo giocatore: servono almeno 2 (il pilota e un navigatore)` };
    return { ok: true, config: parsed.data as PilotaConfig };
  },

  init(config, ctx, now) {
    const rng = makeRng(ctx.seed);
    // senza team della serata: 2–4 squadre a caso (una sola con meno di 4 giocatori)
    const teams = formTeams(ctx.players, ctx.teams, rng, (n) => (n < 4 ? 1 : Math.min(4, Math.max(2, Math.floor(n / 3)))));
    const base: S = {
      cfg: config,
      seed: ctx.seed,
      participants: ctx.players,
      players: ctx.players.map((p) => p.id),
      teams,
      level: 1,
      courses: {},
      units: [],
      unit: 0,
      lanes: [],
      results: [],
      history: [],
      levelClosed: false,
      board: Object.fromEntries(teams.map((t) => [t.id, 0])),
      phase: "done",
      phaseStartedAt: now,
      levelStartedAt: null,
      phaseEndsAt: null,
      pausedRemainingMs: null,
      pausedAt: null,
    };
    return teams.length === 0 ? base : startLevel(base, 1, now);
  },

  onInput(state, playerId, input, meta) {
    if (!state.players.includes(playerId) || input.type !== "move") return state;
    if (state.phase !== "run" || state.pausedRemainingMs !== null || state.levelStartedAt === null || state.phaseEndsAt === null) return state;
    const lane = state.lanes.find((l) => l.pilotId === playerId);
    if (!lane || meta.receivedAt > state.phaseEndsAt + GRACE_MS) return state;
    // l'ora del passo è l'ora equa: un passo in tempo che arriva poco dopo la scadenza conta, la latenza non penalizza né aiuta
    const fair = fairTime({ claimed: meta.claimedTime, receivedAt: meta.receivedAt, rtt: meta.rtt, openedAt: state.levelStartedAt });
    if (fair > state.phaseEndsAt) return state;
    const out = stepLane(lane.course, lane.run, input.dir, fair, state.levelStartedAt, moveRules(state.cfg));
    if (out.run === lane.run) return state;
    const next: S = { ...state, lanes: state.lanes.map((l) => (l === lane ? { ...l, run: out.run } : l)) };
    return allFinished(next) ? endUnit(next, meta.receivedAt) : next;
  },

  onTick(state, now) {
    if (state.pausedRemainingMs !== null) return state;
    if (state.phase === "ready" && state.phaseEndsAt !== null && now >= state.phaseEndsAt) return startRun(state, now);
    if (state.phase !== "run" || state.levelStartedAt === null || state.phaseEndsAt === null) return state;
    if (now >= state.phaseEndsAt + GRACE_MS) return endUnit(state, now);
    // una pattuglia può raggiungere un pilota fermo
    const rules = moveRules(state.cfg);
    let changed = false;
    const lanes = state.lanes.map((l) => {
      const run = patrolCatch(l.course, l.run, now, state.levelStartedAt!, rules);
      if (run === l.run) return l;
      changed = true;
      return { ...l, run };
    });
    return changed ? { ...state, lanes } : state;
  },

  onHostCommand(state, command, now) {
    const timed = state.phase === "ready" || state.phase === "run";
    switch (command.type) {
      case "go":
        return state.phase === "ready" ? startRun(state, now) : state;
      case "pause":
        if (!timed || state.pausedRemainingMs !== null || state.phaseEndsAt === null) return state;
        return { ...state, pausedRemainingMs: Math.max(0, state.phaseEndsAt - now), phaseEndsAt: null, pausedAt: now };
      case "resume": {
        if (state.pausedRemainingMs === null || state.pausedAt === null) return state;
        const resumed = state.phase === "run" ? shiftTimes(state, now - state.pausedAt) : state;
        return { ...resumed, phaseEndsAt: now + state.pausedRemainingMs, pausedRemainingMs: null, pausedAt: null };
      }
      case "skip-pilot": {
        if (state.phase !== "ready") return state;
        const lanes = state.lanes.map((l) => {
          if (command.teamId !== undefined && l.teamId !== command.teamId) return l;
          const t = team(state, l.teamId);
          const next = t.order[(t.order.indexOf(l.pilotId) + 1) % t.order.length]!;
          const navigators = t.members.filter((id) => id !== next);
          return { ...l, pilotId: next, layers: assignLayers(activeLayers(l.course), navigators, makeRng(deriveSeed(state.seed, state.level * 1000 + state.unit * 10 + now % 997))) };
        });
        return { ...state, lanes };
      }
      case "finish-level":
        return state.phase === "run" ? endUnit(state, now) : state;
      case "next":
        if (state.phase === "level-end") return advance(state, now);
        return state.phase === "final" ? enter(state, "done", now) : state;
      case "end": {
        if (state.phase === "final" || state.phase === "done") return state;
        const ended = state.phase === "run" ? endUnit(state, now) : state;
        // un livello a metà (a turno) si chiude con i risultati che ci sono
        return enter(ended.results.length > 0 ? closeLevel(ended) : ended, "final", now);
      }
    }
  },

  isFinished: (state) => state.phase === "done",

  scores(state): ScoreDelta[] {
    return state.teams.flatMap((t) => (state.board[t.id] ?? 0) === 0 ? [] : t.members.map((playerId) => ({ playerId, teamId: null, points: state.board[t.id]!, reason: "Pilota alla cieca" })));
  },
  result(state) {
    const totals: Record<string, number> = {};
    for (const t of state.teams) for (const id of t.members) totals[id] = state.board[t.id] ?? 0;
    return rankByPoints(totals, state.players);
  },

  screenView(state) {
    return publicBase(state);
  },

  viewFor(state, playerId) {
    const base = publicBase(state);
    if (!state.players.includes(playerId)) return { ...base, me: null };
    const t = state.teams.find((x) => x.members.includes(playerId));
    const playing = state.phase === "ready" || state.phase === "run" || state.phase === "level-end";
    const lane = playing ? state.lanes.find((l) => l.teamId === t?.id) : undefined;
    if (!lane || !t) return { ...base, me: { id: playerId, role: "spectator" as const, teamId: t?.id ?? null } };
    if (lane.pilotId === playerId) return { ...base, me: { id: playerId, role: "pilot" as const, teamId: lane.teamId } };
    // Navigatore: solo gli strati che ha, e solo della propria corsia.
    const layers = lane.layers[playerId] ?? [];
    return { ...base, me: { id: playerId, role: "navigator" as const, teamId: lane.teamId, layers, layerData: layerData(lane, layers) } };
  },

  hostView(state) {
    const timed = state.phase === "ready" || state.phase === "run";
    const paused = state.pausedRemainingMs !== null;
    return {
      info: {
        ...publicBase(state),
        // La regia vede tutto: strati, orari e chi li ha.
        secrets: state.lanes.map((l) => ({
          teamId: l.teamId,
          mines: l.course.mines,
          doors: l.course.doors,
          keys: l.course.keys,
          patrols: l.course.patrols,
          layers: Object.entries(l.layers).map(([id, layers]) => ({ ...person(state, id), layers })),
        })),
      },
      actions: [
        { id: "go", label: "Via", enabled: state.phase === "ready" },
        { id: "next", label: "Avanti", enabled: state.phase === "level-end" || state.phase === "final" },
        paused ? { id: "resume", label: "Riprendi", enabled: true } : { id: "pause", label: "Pausa", enabled: timed && state.phaseEndsAt !== null },
        { id: "skip-pilot", label: "Cambia pilota", enabled: state.phase === "ready" },
        { id: "finish-level", label: "Chiudi la gara", enabled: state.phase === "run", danger: true },
        { id: "end", label: "Termina il round", enabled: state.phase !== "final" && state.phase !== "done", danger: true },
      ],
    };
  },
};
