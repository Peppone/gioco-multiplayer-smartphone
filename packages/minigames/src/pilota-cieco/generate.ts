import type { Door, Patrol } from "@gioco/shared";
import { deriveSeed, makeRng, randInt, shuffle } from "../knight-duel/rng.js";
import { type Dir, DIRS, type Maze, distances, generateMaze, shortestPath, step } from "../maze.js";

/**
 * Generatore dei livelli di «Pilota alla cieca»: un labirinto con cicli, un ingresso, un'uscita lontana, chiavi,
 * punti di controllo, porte, mine e pattuglie. Tutto dal seme: stesso seme, stesso livello. Funzioni pure.
 */

export type Size = "piccolo" | "medio" | "grande";
export type Mode = "insieme" | "a-turno";

export interface LevelParams {
  mode: Mode;
  size: Size;
  /** Percentuale di caselle con una mina. */
  mineDensity: number;
  doors: number;
  keys: number;
  patrols: boolean;
}

export interface LevelSpec {
  w: number;
  h: number;
  /** Muri tolti dal labirinto perfetto: nascono cicli, quindi strade alternative. */
  loops: number;
  mines: number;
  doors: number;
  keys: number;
  patrols: number;
  doorPeriod: number;
  patrolStepMs: number;
}

const BASE: Record<Size, number> = { piccolo: 9, medio: 11, grande: 13 };
/** In «insieme» le corsie sono quattro su una TV: oltre 13×13 le caselle diventano troppo piccole. */
const MAX_SIDE: Record<Mode, number> = { insieme: 13, "a-turno": 15 };

/** I numeri del livello `level` (da 1): labirinto più grande, più mine, porte più veloci, pattuglie dal livello 2. */
export function levelSpec(p: LevelParams, level: number): LevelSpec {
  const side = Math.min(MAX_SIDE[p.mode], BASE[p.size] + 2 * (level - 1));
  const cells = side * side;
  return {
    w: side,
    h: side,
    loops: Math.round(cells * 0.05),
    // più mine a ogni livello, ma mai oltre il 20% delle caselle: servono caselle libere anche per il percorso
    mines: Math.min(Math.floor(cells * 0.2), Math.floor((p.mineDensity / 100) * cells * (1 + 0.25 * (level - 1)))),
    doors: p.doors,
    keys: p.keys,
    patrols: p.patrols && level >= 2 ? Math.min(3, level - 1) : 0,
    doorPeriod: Math.max(2000, 4000 - 500 * (level - 1)),
    patrolStepMs: Math.max(700, 1100 - 100 * (level - 1)),
  };
}

export interface Course {
  w: number;
  h: number;
  /** I muri (un bit per lato aperto, come in `maze.ts`): pubblici. */
  cells: number[];
  start: number;
  exit: number;
  /** Il pilota che salta torna all'ultimo raggiunto (il primo è `start`): pubblici. */
  checkpoints: number[];
  /** SEGRETE (strato «mine»). */
  mines: number[];
  /** Le posizioni sono pubbliche, l'orario no (strato «porte»). */
  doors: Door[];
  /** SEGRETE finché non raccolte (strato «chiavi»). */
  keys: number[];
  /** SEGRETE (strato «pattuglie»). */
  patrols: Patrol[];
  /** Percorso più breve ingresso → chiavi → uscita (celle, estremi inclusi): le mine non lo toccano mai. */
  route: number[];
}

export const asMaze = (c: Pick<Course, "w" | "h" | "cells">): Maze => ({ w: c.w, h: c.h, cells: c.cells });

const NEIGHBOURS = Object.keys(DIRS) as Dir[];

/** Lunghezza in passi di un percorso (celle comprese gli estremi). */
export const routeLength = (c: Pick<Course, "route">): number => c.route.length - 1;

/** Percorso più breve da `from` a `to` passando per tutte le `via`, nell'ordine migliore (al massimo 3 tappe). */
function bestRoute(maze: Maze, from: number, via: number[], to: number): number[] {
  const orders = permutations(via);
  let best: number[] | null = null;
  for (const order of orders) {
    const stops = [from, ...order, to];
    const path: number[] = [from];
    for (let i = 0; i < stops.length - 1; i++) path.push(...shortestPath(maze, stops[i]!, stops[i + 1]!)!.slice(1));
    if (!best || path.length < best.length) best = path;
  }
  return best!;
}

function permutations<T>(list: T[]): T[][] {
  if (list.length <= 1) return [list];
  return list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map((rest) => [x, ...rest]));
}

/** Passi che mancano a chi è in `pos` con le chiavi `taken` già in tasca: fino alle chiavi che restano, poi l'uscita. */
export function remainingSteps(c: Course, pos: number, taken: number[]): number {
  return bestRoute(asMaze(c), pos, c.keys.filter((k) => !taken.includes(k)), c.exit).length - 1;
}

/** Distanza in passi di ogni cella dall'insieme `sources` (ricerca in ampiezza da più punti). */
function distanceFrom(maze: Maze, sources: number[]): number[] {
  const dist = new Array<number>(maze.w * maze.h).fill(-1);
  const queue = [...sources];
  for (const s of sources) dist[s] = 0;
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]!;
    for (const d of NEIGHBOURS) {
      const j = step(maze, i, d);
      if (j !== null && dist[j] === -1) {
        dist[j] = dist[i]! + 1;
        queue.push(j);
      }
    }
  }
  return dist;
}

export function generateCourse(seed: number, spec: LevelSpec): Course {
  const rng = makeRng(seed);
  const { w, h } = spec;
  const maze = generateMaze(w, h, rng, { loops: spec.loops });
  const n = w * h;

  // Ingresso su un lato, uscita tra le tre celle più lontane.
  const start = randInt(rng, h) * w;
  const dist = distances(maze, start);
  const far = dist.map((d, i) => ({ d, i })).sort((a, b) => b.d - a.d || a.i - b.i).slice(0, 3);
  const exit = far[randInt(rng, far.length)]!.i;

  // Chiavi a metà strada: lontane dall'ingresso, mai sull'uscita.
  const maxD = dist[exit]!;
  const middle = shuffle(
    dist.map((d, i) => ({ d, i })).filter((x) => x.i !== start && x.i !== exit && x.d >= maxD * 0.3 && x.d <= maxD * 0.8).map((x) => x.i),
    rng,
  );
  const keys = middle.slice(0, spec.keys);
  const route = bestRoute(maze, start, keys, exit);
  const onRoute = new Set(route);

  // Punti di controllo a un terzo e due terzi del percorso.
  const reserved = new Set<number>([start, exit, ...keys]);
  const checkpoints = [start];
  for (const t of [1 / 3, 2 / 3]) {
    const c = route[Math.floor(t * (route.length - 1))]!;
    if (!reserved.has(c) && !checkpoints.includes(c)) checkpoints.push(c);
  }
  checkpoints.forEach((c) => reserved.add(c));

  // Porte: la prima sul percorso (obbliga a fare i conti con il suo orario), le altre ovunque.
  const doors: Door[] = [];
  const used = new Set<number>();
  const addDoor = (cell: number) => {
    used.add(cell);
    doors.push({ cell, period: spec.doorPeriod, offset: randInt(rng, spec.doorPeriod * 2) });
  };
  const interior = route.slice(2, Math.max(2, route.length - 2)).filter((c) => !reserved.has(c));
  if (spec.doors > 0 && interior.length > 0) addDoor(interior[randInt(rng, interior.length)]!);
  const spare = shuffle([...Array(n).keys()].filter((c) => !reserved.has(c) && !used.has(c)), rng);
  while (doors.length < spec.doors && spare.length > 0) addDoor(spare.shift()!);

  // Mine: sulle caselle più vicine al percorso (le più insidiose) ma mai sul percorso, quindi il livello si può sempre vincere.
  const near = distanceFrom(maze, route);
  const mineSpots = shuffle([...Array(n).keys()].filter((c) => !onRoute.has(c) && !reserved.has(c) && !used.has(c)), rng).sort((a, b) => near[a]! - near[b]!);
  const mines = mineSpots.slice(0, spec.mines);

  // Pattuglie: avanti e indietro su un tratto di 3–5 caselle, lontano da ingresso, uscita, chiavi e punti di controllo.
  const patrols: Patrol[] = [];
  for (let attempt = 0; patrols.length < spec.patrols && attempt < 60; attempt++) {
    const first = randInt(rng, n);
    if (reserved.has(first)) continue;
    const path = [first];
    while (path.length < 5) {
      const options = NEIGHBOURS.map((d) => step(maze, path.at(-1)!, d)).filter((c): c is number => c !== null && !path.includes(c) && !reserved.has(c));
      if (options.length === 0) break;
      path.push(options[randInt(rng, options.length)]!);
    }
    if (path.length >= 3) patrols.push({ path, stepMs: spec.patrolStepMs, offset: randInt(rng, spec.patrolStepMs * 8) });
  }

  return { w, h, cells: maze.cells, start, exit, checkpoints, mines, doors, keys, patrols, route };
}

/**
 * I livelli di tutte le squadre per un livello: con le stesse caratteristiche (stesse quantità di mine, porte, chiavi,
 * pattuglie, stessa dimensione) e un percorso più breve di lunghezza simile (vicina a una lunghezza di riferimento comune),
 * ma labirinti diversi: guardando le corsie altrui non si impara dove sono le mine.
 * Si cercano percorsi entro il 4% della lunghezza mediana di alcuni livelli di prova: così nessuno si discosta di più del 10% dalla media.
 */
const FAIR_TOLERANCE = 0.04;

export function generateCourses(seed: number, level: number, spec: LevelSpec, teams: number): Course[] {
  // Lunghezza di riferimento: la mediana di alcuni livelli di prova (la prima squadra non fa da campione: un livello
  // lunghissimo o cortissimo non può farsi inseguire dagli altri).
  const sample = Array.from({ length: 9 }, (_, k) => routeLength(generateCourse(deriveSeed(seed, level * 100_000 + 90_000 + k), spec))).sort((x, y) => x - y);
  const target = sample[4]!;
  const out: Course[] = [];
  for (let i = 0; i < teams; i++) {
    let best: Course | null = null;
    for (let attempt = 0; attempt < 200; attempt++) {
      const c = generateCourse(deriveSeed(seed, level * 100_000 + i * 1_000 + attempt), spec);
      if (!best || Math.abs(routeLength(c) - target) < Math.abs(routeLength(best) - target)) best = c;
      if (Math.abs(routeLength(c) - target) <= target * FAIR_TOLERANCE) break;
    }
    out.push(best!);
  }
  return out;
}

