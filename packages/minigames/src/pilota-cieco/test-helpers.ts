import type { InputMeta, MinigameContext } from "@gioco/shared";
import { doorOpen, patrolCell } from "@gioco/shared";
import { LEFT, RIGHT, shortestPath, step } from "../maze.js";
import { type Dir } from "../maze.js";
import type { Course } from "./generate.js";
import { asMaze } from "./generate.js";
import { type PilotaState, pilotaCieco as plugin, pilotaConfigSchema } from "./index.js";
import { initialRun } from "./move.js";

/** Funzioni comuni ai test di Pilota alla cieca: squadre, input con ora e ritardo, livelli a mano, pilota automatico. */
export type S = PilotaState;

export const T0 = 1_000_000;
export const TEAM_IDS = ["ta", "tb", "tc", "td", "te"];

/** Giocatori con i team della serata: `sizes[i]` giocatori nella squadra i (ids `a1, a2…`, `b1…`). */
export function ctxFor(seed: number, sizes: number[] = [3, 3]): MinigameContext {
  const letters = "abcde";
  return {
    seed,
    teams: sizes.map((_, i) => ({ id: TEAM_IDS[i]!, name: `Squadra ${letters[i]!.toUpperCase()}` })),
    players: sizes.flatMap((n, i) => Array.from({ length: n }, (_, k) => ({ id: `${letters[i]}${k + 1}`, nickname: `${letters[i]!.toUpperCase()}${k + 1}`, teamId: TEAM_IDS[i]! }))),
  };
}

/** Livelli semplici (niente mine, porte, pattuglie) quando il test non ne ha bisogno. */
export const PLAIN = { mineDensity: 0, doors: 0, keys: 1, patrols: false };

export const cfg = (over: Record<string, unknown> = {}) => pilotaConfigSchema.parse(over);
export const start = (seed = 1, over: Record<string, unknown> = {}, ctx = ctxFor(seed)): S => plugin.init(cfg(over), ctx, T0);

export const meta = (at: number, claimed = at, rtt: number | null = 30): InputMeta => ({ receivedAt: at, claimedTime: claimed, rtt });
export const move = (s: S, id: string, dir: Dir, at: number, claimed = at, rtt: number | null = 30): S => plugin.onInput(s, id, plugin.inputSchema.parse({ type: "move", dir }), meta(at, claimed, rtt));
export const host = (s: S, command: Record<string, unknown>, at: number): S => plugin.onHostCommand(s, plugin.commandSchema.parse(command), at);

/** Corridoio 6×1: ingresso 0, uscita 5, controlli a 0 e 3, chiave a 2. */
export const corridor = (over: Partial<Course> = {}): Course => ({
  w: 6,
  h: 1,
  cells: [RIGHT, RIGHT | LEFT, RIGHT | LEFT, RIGHT | LEFT, RIGHT | LEFT, LEFT],
  start: 0,
  exit: 5,
  checkpoints: [0, 3],
  mines: [],
  doors: [],
  keys: [2],
  patrols: [],
  route: [0, 1, 2, 3, 4, 5],
  ...over,
});

/** Sostituisce il livello di una squadra (e la sua corsia in corso) con uno scritto a mano. */
export function withCourse(s: S, teamId: string, course: Course): S {
  return { ...s, courses: { ...s.courses, [teamId]: course }, lanes: s.lanes.map((l) => (l.teamId === teamId ? { ...l, course, run: initialRun(course) } : l)) };
}

/** Porta lo stato alla gara in corso (con «Via» a `T0 + 1000`). */
export function toRun(s: S): S {
  const out = host(s, { type: "go" }, T0 + 1000);
  if (out.phase !== "run") throw new Error(`fase ${out.phase}`);
  return out;
}

const DIR_LIST: Dir[] = ["up", "right", "down", "left"];

/**
 * Un pilota paziente: per ogni corsia va verso la prossima chiave (o l'uscita) lungo il percorso più breve, aspetta se la
 * porta davanti è chiusa o se una pattuglia sarebbe sulla casella, e rispetta `stepMs`. Ogni 100 ms dà un passo (se può)
 * e un tick. `scan` vede lo stato a ogni passo. Si ferma quando la fase non è più `run` o passa `maxMs`.
 */
export function autopilot(s0: S, from: number, maxMs: number, scan?: (s: S, at: number) => void): { s: S; at: number } {
  let s = s0;
  let at = from;
  for (; at < from + maxMs && s.phase === "run"; at += 100) {
    for (const lane of s.lanes) {
      const c = lane.course;
      if (lane.run.finishedAt !== null || at < lane.run.frozenUntil || at < lane.run.lastStepAt + s.cfg.stepMs) continue;
      const target = c.keys.find((k) => !lane.run.keysTaken.includes(k)) ?? c.exit;
      const path = shortestPath(asMaze(c), lane.run.pos, target);
      if (!path || path.length < 2) continue;
      const next = path[1]!;
      const elapsed = at - s.levelStartedAt!;
      const door = c.doors.find((d) => d.cell === next);
      if ((door && !doorOpen(door, elapsed)) || c.patrols.some((p) => patrolCell(p, elapsed) === next)) continue;
      s = move(s, lane.pilotId, DIR_LIST.find((d) => step(asMaze(c), lane.run.pos, d) === next)!, at);
    }
    s = plugin.onTick(s, at);
    scan?.(s, at);
  }
  return { s, at };
}
