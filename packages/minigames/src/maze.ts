import { randInt, shuffle } from "./knight-duel/rng.js";

/**
 * Labirinti su griglia, comuni a più giochi (modulo «Labirinto» di Artificieri, «Pilota alla cieca»).
 * Una cella è un intero con un bit per ogni lato aperto: `UP`, `RIGHT`, `DOWN`, `LEFT`. I passaggi sono sempre
 * simmetrici (se una cella è aperta a destra, quella a destra è aperta a sinistra). Funzioni pure e deterministiche.
 */

export const UP = 1;
export const RIGHT = 2;
export const DOWN = 4;
export const LEFT = 8;

export type Dir = "up" | "right" | "down" | "left";
export const DIRS: Record<Dir, { dx: number; dy: number; bit: number; opposite: number }> = {
  up: { dx: 0, dy: -1, bit: UP, opposite: DOWN },
  right: { dx: 1, dy: 0, bit: RIGHT, opposite: LEFT },
  down: { dx: 0, dy: 1, bit: DOWN, opposite: UP },
  left: { dx: -1, dy: 0, bit: LEFT, opposite: RIGHT },
};
const DIR_LIST = Object.keys(DIRS) as Dir[];

export interface Maze {
  w: number;
  h: number;
  /** Indice `y * w + x`; ogni bit è un lato aperto. */
  cells: number[];
}

export const cellIndex = (m: Pick<Maze, "w">, x: number, y: number) => y * m.w + x;
export const cellXY = (m: Pick<Maze, "w">, i: number) => ({ x: i % m.w, y: Math.floor(i / m.w) });

/** La cella confinante in quella direzione, o `null` se è fuori dalla griglia (a prescindere dai muri). */
export function neighbour(m: Pick<Maze, "w" | "h">, i: number, dir: Dir): number | null {
  const { x, y } = cellXY(m, i);
  const nx = x + DIRS[dir].dx;
  const ny = y + DIRS[dir].dy;
  return nx < 0 || ny < 0 || nx >= m.w || ny >= m.h ? null : ny * m.w + nx;
}

/** La cella raggiunta muovendosi da `i` verso `dir`, oppure `null` se c'è un muro (o il bordo). */
export function step(m: Maze, i: number, dir: Dir): number | null {
  if ((m.cells[i]! & DIRS[dir].bit) === 0) return null;
  return neighbour(m, i, dir);
}

function open(cells: number[], m: Pick<Maze, "w" | "h">, i: number, dir: Dir): void {
  const j = neighbour(m, i, dir)!;
  cells[i] = cells[i]! | DIRS[dir].bit;
  cells[j] = cells[j]! | DIRS[dir].opposite;
}

/**
 * Labirinto «perfetto» (un solo percorso tra due celle qualsiasi) dal seme, con il metodo della visita in
 * profondità. Con `loops` > 0 si aprono altrettanti muri in più (a caso, tra quelli ancora chiusi): nascono cicli,
 * quindi più percorsi (serve a «Pilota alla cieca»).
 */
export function generateMaze(w: number, h: number, rng: () => number, opts: { loops?: number } = {}): Maze {
  const m: Maze = { w, h, cells: new Array<number>(w * h).fill(0) };
  const seen = new Array<boolean>(w * h).fill(false);
  const stack = [randInt(rng, w * h)];
  seen[stack[0]!] = true;
  while (stack.length > 0) {
    const i = stack[stack.length - 1]!;
    const free = shuffle(DIR_LIST, rng).filter((d) => {
      const j = neighbour(m, i, d);
      return j !== null && !seen[j];
    });
    if (free.length === 0) {
      stack.pop();
      continue;
    }
    const dir = free[0]!;
    open(m.cells, m, i, dir);
    const j = neighbour(m, i, dir)!;
    seen[j] = true;
    stack.push(j);
  }
  const walls = shuffle(
    Array.from({ length: w * h }, (_, i) => i).flatMap((i) => (["right", "down"] as Dir[]).filter((d) => neighbour(m, i, d) !== null && (m.cells[i]! & DIRS[d].bit) === 0).map((d) => ({ i, d }))),
    rng,
  );
  for (const { i, d } of walls.slice(0, Math.max(0, opts.loops ?? 0))) open(m.cells, m, i, d);
  return m;
}

/** Distanza in passi da `from` a ogni cella (-1 se irraggiungibile). */
export function distances(m: Maze, from: number): number[] {
  const dist = new Array<number>(m.w * m.h).fill(-1);
  dist[from] = 0;
  const queue = [from];
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    for (const d of DIR_LIST) {
      const j = step(m, i, d);
      if (j !== null && dist[j] === -1) {
        dist[j] = dist[i]! + 1;
        queue.push(j);
      }
    }
  }
  return dist;
}

/** Percorso più breve da `from` a `to` (celle comprese, estremi inclusi), o `null` se non c'è. */
export function shortestPath(m: Maze, from: number, to: number): number[] | null {
  const prev = new Array<number>(m.w * m.h).fill(-1);
  const seen = new Array<boolean>(m.w * m.h).fill(false);
  seen[from] = true;
  const queue = [from];
  for (let q = 0; q < queue.length && !seen[to]; q++) {
    const i = queue[q]!;
    for (const d of DIR_LIST) {
      const j = step(m, i, d);
      if (j !== null && !seen[j]) {
        seen[j] = true;
        prev[j] = i;
        queue.push(j);
      }
    }
  }
  if (!seen[to]) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev[path[0]!]!);
  return path;
}

/** Le direzioni da seguire per percorrere `path` (celle adiacenti). */
export function directionsOf(m: Pick<Maze, "w" | "h">, path: number[]): Dir[] {
  return path.slice(1).map((j, k) => DIR_LIST.find((d) => neighbour(m, path[k]!, d) === j)!);
}

/** Numero di passaggi aperti (ogni passaggio conta una volta). Un labirinto perfetto ne ha `w × h − 1`. */
export function passages(m: Maze): number {
  return m.cells.reduce((n, c) => n + [UP, RIGHT, DOWN, LEFT].filter((b) => (c & b) !== 0).length, 0) / 2;
}
