import { type Clue, clueHolds } from "./clues.js";
import { type Body, type Mode, type ObjectKind, type Seen, COMET_SECTORS, COMPOSITION, SECTORS, neighbors, placementErrors } from "./sky.js";

/**
 * Risolutore del Pianeta Nascosto (piano, §3.10): enumera i sistemi compatibili con ciò che una squadra sa.
 * Serve al bot, all'aiuto `assist` e ai test. Funzioni pure e deterministiche (la casualità è un `rng` passato da chi chiama).
 */

export interface Survey {
  object: Seen;
  from: number;
  to: number;
  count: number;
}

/** Tutto ciò che una squadra sa del sistema. Il settore n è all'indice n − 1 nei sistemi enumerati. */
export interface Knowledge {
  mode: Mode;
  /** «Il settore non contiene questo corpo celeste»: fatti iniziali e teorie sbagliate. */
  notBody: { sector: number; body: Body }[];
  /** Ciò che mostrano gli strumenti in un settore (puntamenti), oppure un corpo confermato (revisione). */
  exact: { sector: number; kind: Seen }[];
  surveys: Survey[];
  /** Ricerche lette e conferenze tenute. */
  clues: Clue[];
  /** Localizzazioni fallite: quella combinazione (Pianeta X nel settore, con quei vicini) non è il sistema. */
  failedLocations: { sector: number; left: Seen; right: Seen }[];
}

export const emptyKnowledge = (mode: Mode): Knowledge => ({ mode, notBody: [], exact: [], surveys: [], clues: [], failedLocations: [] });

export interface SolveResult {
  skies: ObjectKind[][];
  /** False se l'enumerazione si è interrotta per il limite di nodi o di risultati: l'elenco non è completo. */
  complete: boolean;
  nodes: number;
}

const KINDS: ObjectKind[] = ["empty", "asteroid", "dwarf", "comet", "gas", "planetX"];
const IDX: Record<ObjectKind, number> = { empty: 0, asteroid: 1, dwarf: 2, comet: 3, gas: 4, planetX: 5 };
const ALL = 0b111111;

/** Le fasce di pianeti nani di Esperto: estremi a distanza 5 e due dei quattro settori interni. */
function dwarfConfigs(n: number): number[][] {
  const out: number[][] = [];
  const pairs = [[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]];
  for (let start = 0; start < n; start++) for (const [a, b] of pairs) out.push([start, (start + 5) % n, (start + a!) % n, (start + b!) % n]);
  return out;
}

/** I tipi ammessi in ogni settore dalle regole di posizione e dalle conoscenze (maschera di bit). */
function allowedMasks(k: Knowledge): number[] {
  const n = SECTORS[k.mode];
  const masks = Array<number>(n).fill(ALL);
  for (let s = 1; s <= n; s++) if (!COMET_SECTORS[k.mode].includes(s)) masks[s - 1]! &= ~(1 << IDX.comet);
  for (const f of k.notBody) masks[f.sector - 1]! &= ~(1 << IDX[f.body]);
  for (const e of k.exact) {
    masks[e.sector - 1]! &= e.kind === "empty" ? (1 << IDX.empty) | (1 << IDX.planetX) : 1 << IDX[e.kind];
  }
  return masks;
}

interface Options {
  maxNodes: number;
  maxResults?: number;
  /** Con un generatore i tipi si provano in ordine casuale (campionamento). */
  rng?: () => number;
}

export function solve(k: Knowledge, opts: Options): SolveResult {
  const n = SECTORS[k.mode];
  const masks = allowedMasks(k);
  const results: ObjectKind[][] = [];
  const state = { nodes: 0, stop: false };
  const configs = k.mode === "expert" ? dwarfConfigs(n) : [null];
  const order = opts.rng ? shuffled(configs, opts.rng) : configs;
  for (const config of order) {
    if (state.stop) break;
    search(k, masks, config, opts, state, results);
  }
  return { skies: results, complete: !state.stop, nodes: state.nodes };
}

function shuffled<T>(list: T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function search(k: Knowledge, masks: number[], dwarves: number[] | null, opts: Options, state: { nodes: number; stop: boolean }, results: ObjectKind[][]): void {
  const n = SECTORS[k.mode];
  const cells: (number | null)[] = Array(n).fill(null);
  const remaining = KINDS.map((kind) => COMPOSITION[k.mode][kind]);
  if (dwarves) {
    for (const s of dwarves) {
      if (!(masks[s]! & (1 << IDX.dwarf))) return;
      cells[s] = IDX.dwarf;
    }
    remaining[IDX.dwarf] = 0;
  }
  // I rilevamenti come vincoli di conteggio, con quanti settori dell'arco sono ancora da assegnare.
  const surveys = k.surveys.map((sv) => {
    const members: boolean[] = Array(n).fill(false);
    let len = 0;
    for (let s = sv.from; len === 0 || s !== (sv.to % n) + 1; s = (s % n) + 1) {
      members[s - 1] = true;
      len++;
    }
    const target = sv.object === "empty" ? [IDX.empty, IDX.planetX] : [IDX[sv.object]];
    return { members, target, count: sv.count, found: 0, left: len };
  });
  const bySector = Array.from({ length: n }, (_, i) => surveys.filter((sv) => sv.members[i]));
  // Contributo dei settori già assegnati (i pianeti nani preimpostati).
  for (let i = 0; i < n; i++) {
    if (cells[i] === null) continue;
    for (const sv of bySector[i]!) {
      sv.left--;
      if (sv.target.includes(cells[i]!)) sv.found++;
    }
  }
  if (surveys.some((sv) => sv.found > sv.count || sv.found + sv.left < sv.count)) return;

  const left = (i: number) => (i + n - 1) % n;
  const right = (i: number) => (i + 1) % n;
  /** Le regole che riguardano il settore i, controllabili solo quando i suoi vicini sono noti. */
  const localOk = (i: number): boolean => {
    const c = cells[i];
    if (c === null || c === undefined) return true;
    const a = cells[left(i)];
    const b = cells[right(i)];
    if (c === IDX.planetX) return a !== IDX.dwarf && b !== IDX.dwarf;
    if (c === IDX.dwarf) return a !== IDX.planetX && b !== IDX.planetX;
    if (a === null || b === null || a === undefined || b === undefined) return true;
    if (c === IDX.asteroid) return a === IDX.asteroid || b === IDX.asteroid;
    if (c === IDX.gas) return a === IDX.empty || b === IDX.empty;
    return true;
  };
  const leaf = (): ObjectKind[] | null => {
    const sky = cells.map((c) => KINDS[c!]!);
    if (placementErrors(sky).length > 0) return null;
    for (const f of k.failedLocations) {
      const [l, r] = neighbors(f.sector, n);
      if (sky[f.sector - 1] === "planetX" && sky[l - 1] === f.left && sky[r - 1] === f.right) return null;
    }
    return k.clues.every((clue) => clueHolds(clue, sky)) ? sky : null;
  };

  const go = (i: number): void => {
    if (state.stop) return;
    if (++state.nodes > opts.maxNodes) {
      state.stop = true;
      return;
    }
    while (i < n && cells[i] !== null) i++;
    if (i === n) {
      for (let j = 0; j < n; j++) if (!localOk(j)) return;
      const sky = leaf();
      if (sky) {
        results.push(sky);
        if (opts.maxResults !== undefined && results.length >= opts.maxResults) state.stop = true;
      }
      return;
    }
    const kinds = [0, 1, 2, 3, 4, 5].filter((c) => masks[i]! & (1 << c) && remaining[c]! > 0);
    for (const c of opts.rng ? shuffled(kinds, opts.rng) : kinds) {
      // assegna
      cells[i] = c;
      remaining[c]!--;
      let ok = true;
      for (const sv of bySector[i]!) {
        sv.left--;
        if (sv.target.includes(c)) sv.found++;
      }
      for (const sv of bySector[i]!) if (sv.found > sv.count || sv.found + sv.left < sv.count) ok = false;
      if (ok && localOk(i) && localOk(left(i)) && localOk(right(i))) go(i + 1);
      // annulla
      for (const sv of bySector[i]!) {
        sv.left++;
        if (sv.target.includes(c)) sv.found--;
      }
      remaining[c]!++;
      cells[i] = null;
      if (state.stop) return;
    }
  };
  go(0);
}

const cache = new Map<string, SolveResult>();
const CACHE_MAX = 64;

/** Chiave di una conoscenza, per la cache (il risultato è deterministico). */
export const knowledgeKey = (k: Knowledge): string => JSON.stringify(k);

/** Come `solve`, con cache sulle conoscenze (l'enumerazione completa non cambia a parità di conoscenze). */
export function solveCached(k: Knowledge, maxNodes: number): SolveResult {
  const key = `${maxNodes}|${knowledgeKey(k)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const result = solve(k, { maxNodes });
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}
