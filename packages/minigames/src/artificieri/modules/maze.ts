import { randInt } from "../../knight-duel/rng.js";
import { DIRS, type Dir, type Maze, cellXY, directionsOf, distances, generateMaze, shortestPath, step } from "../../maze.js";
import type { Edgework } from "../edgework.js";
import type { Difficulty, JudgeInput, ManualSection, ModuleAction, ModuleDef, Solution, Verdict } from "./types.js";

/**
 * Labirinto: sulla TV una griglia 6×6 senza muri, con due segni, la posizione e l'arrivo; sul telefono quattro frecce.
 * Nel manuale ci sono nove labirinti con i muri: i due segni dicono qual è quello della bomba. Sbattere contro un
 * muro è un errore (e non ci si muove).
 */

export const MAZE_SIZE = 6;
export const MAZES_IN_MANUAL = 9;
const PER_PAGE = 3;
/** Distanza minima tra partenza e arrivo, in passi: un labirinto già a due passi sarebbe uno scherzo. */
const MIN_DISTANCE: Record<Difficulty, number> = { facile: 5, media: 7, difficile: 9 };

export interface MazeEntry {
  cells: number[];
  /** Le due celle con un segno (in ordine di cella), uniche tra i nove labirinti. */
  marks: [number, number];
}

export interface MazeRules {
  mazes: MazeEntry[];
}

export interface MazeData {
  /** I due segni visibili sulla TV: dicono quale labirinto del manuale è. */
  marks: [number, number];
  start: number;
  goal: number;
}

export interface MazeProgress {
  pos: number;
}

const asMaze = (e: MazeEntry): Maze => ({ w: MAZE_SIZE, h: MAZE_SIZE, cells: e.cells });
const sameMarks = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];

/** Il labirinto del manuale che ha questi due segni (uno solo: lo garantisce il generatore). */
export function mazeFor(rules: MazeRules, marks: [number, number]): MazeEntry {
  return rules.mazes.find((m) => sameMarks(m.marks, marks))!;
}

function genRules(rng: () => number): MazeRules {
  const mazes: MazeEntry[] = [];
  while (mazes.length < MAZES_IN_MANUAL) {
    const a = randInt(rng, MAZE_SIZE * MAZE_SIZE);
    const b = randInt(rng, MAZE_SIZE * MAZE_SIZE);
    if (a === b) continue;
    const marks: [number, number] = a < b ? [a, b] : [b, a];
    if (mazes.some((m) => sameMarks(m.marks, marks))) continue;
    mazes.push({ cells: generateMaze(MAZE_SIZE, MAZE_SIZE, rng).cells, marks });
  }
  return { mazes };
}

function genData(rng: () => number, rules: MazeRules, _edge: Edgework, difficulty: Difficulty): MazeData {
  const entry = rules.mazes[randInt(rng, rules.mazes.length)]!;
  const maze = asMaze(entry);
  const start = randInt(rng, MAZE_SIZE * MAZE_SIZE);
  const dist = distances(maze, start);
  const far = dist.flatMap((d, i) => (d >= MIN_DISTANCE[difficulty] ? [i] : []));
  // con un labirinto «corto» si prende la cella più lontana
  const goal = far.length > 0 ? far[randInt(rng, far.length)]! : dist.indexOf(Math.max(...dist));
  return { marks: entry.marks, start, goal };
}

const DIR_NAME: Record<Dir, string> = { up: "su", right: "destra", down: "giù", left: "sinistra" };

function manual(rules: MazeRules): ManualSection[] {
  return Array.from({ length: Math.ceil(rules.mazes.length / PER_PAGE) }, (_, p) => ({
    title: `Labirinti ${p * PER_PAGE + 1}–${Math.min(rules.mazes.length, (p + 1) * PER_PAGE)}`,
    blocks: [
      ...(p === 0 ? [{ type: "p" as const, text: "Sulla bomba ci sono due cerchi: cerca il labirinto che ha i due cerchi nelle stesse caselle. Le linee spesse sono muri; la casella in alto a sinistra è la prima. Sbattere contro un muro è un errore." }] : []),
      { type: "mazes" as const, size: MAZE_SIZE, mazes: rules.mazes.slice(p * PER_PAGE, (p + 1) * PER_PAGE) },
    ],
  }));
}

export const mazeModule: ModuleDef<MazeData, MazeRules, MazeProgress> = {
  kind: "maze",
  genRules,
  genData,
  initProgress: (data) => ({ pos: data.start }),
  judge({ data, rules, progress }: JudgeInput<MazeData, MazeRules, MazeProgress>, action: ModuleAction, _remainingMs: number): { verdict: Verdict; progress: MazeProgress } {
    if (action.type !== "move" || !(action.dir in DIRS)) return { verdict: "ignored", progress };
    const next = step(asMaze(mazeFor(rules, data.marks)), progress.pos, action.dir);
    if (next === null) return { verdict: "strike", progress };
    return { verdict: next === data.goal ? "solved" : "ok", progress: { pos: next } };
  },
  solution({ data, rules, progress }): Solution {
    const maze = asMaze(mazeFor(rules, data.marks));
    const dirs = directionsOf(maze, shortestPath(maze, progress.pos, data.goal)!);
    const at = cellXY(maze, progress.pos);
    return {
      actions: dirs.map((dir) => ({ type: "move" as const, dir })),
      text: `Da riga ${at.y + 1}, colonna ${at.x + 1}: ${dirs.map((d) => DIR_NAME[d]).join(", ")}`,
    };
  },
  manual,
};
