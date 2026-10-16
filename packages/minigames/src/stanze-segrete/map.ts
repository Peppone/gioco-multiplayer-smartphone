/**
 * Modello della griglia di «Stanze Segrete»: stanze numerate da 0 (riga 1, colonna 1) in ordine di riga,
 * adiacenti solo in orizzontale e in verticale. Funzioni pure, senza dipendenze dal resto del plugin.
 */

export type CellId = number;
export type Dir = "up" | "down" | "left" | "right";
export const DIRS: readonly Dir[] = ["up", "down", "left", "right"];

export interface Grid {
  rows: number;
  cols: number;
}

const DELTA: Record<Dir, [number, number]> = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

export const cellCount = (g: Grid) => g.rows * g.cols;
export const rowOf = (g: Grid, c: CellId) => Math.floor(c / g.cols);
export const colOf = (g: Grid, c: CellId) => c % g.cols;
export const isCell = (g: Grid, c: unknown): c is CellId => Number.isInteger(c) && (c as number) >= 0 && (c as number) < cellCount(g);

/** La stanza confinante nella direzione indicata, o `null` se c'è il bordo della mappa. */
export function neighbor(g: Grid, cell: CellId, dir: Dir): CellId | null {
  const r = rowOf(g, cell) + DELTA[dir][0];
  const c = colOf(g, cell) + DELTA[dir][1];
  if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) return null;
  return r * g.cols + c;
}

export const neighbors = (g: Grid, cell: CellId): CellId[] => DIRS.map((d) => neighbor(g, cell, d)).filter((n): n is CellId => n !== null);
export const areAdjacent = (g: Grid, a: CellId, b: CellId) => neighbors(g, a).includes(b);

/** La direzione che porta da `a` alla stanza adiacente `b`, o `null`. */
export function directionBetween(g: Grid, a: CellId, b: CellId): Dir | null {
  return DIRS.find((d) => neighbor(g, a, d) === b) ?? null;
}

export function isCorner(g: Grid, cell: CellId): boolean {
  const r = rowOf(g, cell);
  const c = colOf(g, cell);
  return (r === 0 || r === g.rows - 1) && (c === 0 || c === g.cols - 1);
}

/** Percorso di stanze adiacenti, senza ripassare dalla stessa stanza, che legge `word`; `null` se non esiste. */
export function findWordPath(g: Grid, letters: readonly string[], word: string): CellId[] | null {
  const target = word.toUpperCase();
  if (target.length === 0) return null;
  const path: CellId[] = [];
  const used = new Set<CellId>();
  const walk = (cell: CellId, i: number): boolean => {
    if ((letters[cell] ?? "").toUpperCase() !== target[i]) return false;
    path.push(cell);
    used.add(cell);
    if (i === target.length - 1) return true;
    for (const n of neighbors(g, cell)) if (!used.has(n) && walk(n, i + 1)) return true;
    path.pop();
    used.delete(cell);
    return false;
  };
  for (let start = 0; start < cellCount(g); start++) if (walk(start, 0)) return path;
  return null;
}

/**
 * Disposizioni di lettere (una diversa per stanza) in cui ogni parola si legge come percorso di stanze adiacenti
 * e l'ultima lettera della prima parola sta nella stanza `anchor`. Aiuto per l'editor: elenca al più `limit` mappe.
 */
export function findLayouts(g: Grid, words: readonly string[], anchor: CellId, limit = 20): string[][] {
  const ws = words.map((w) => w.toUpperCase()).filter((w) => w.length > 0);
  const n = cellCount(g);
  const distinct = new Set(ws.join(""));
  if (ws.length === 0 || distinct.size > n || !isCell(g, anchor)) return [];
  const out: string[][] = [];
  const grid: (string | null)[] = Array.from({ length: n }, () => null);
  const where = new Map<string, CellId>();

  const place = (wi: number): void => {
    if (out.length >= limit) return;
    if (wi === ws.length) {
      // le stanze avanzate si riempiono con le lettere inutilizzate in ordine: serve una lettera per stanza
      if (grid.every((x) => x !== null)) out.push(grid.map((x) => x!));
      return;
    }
    const word = ws[wi]!;
    const path: CellId[] = [];
    const used = new Set<CellId>();
    const walk = (cell: CellId, i: number): void => {
      if (out.length >= limit) return;
      const ch = word[i]!;
      const known = where.get(ch);
      const here = grid[cell];
      const fresh = here === null && known === undefined;
      if (!(fresh || (here === ch && known === cell))) return;
      if (wi === 0 && i === word.length - 1 && cell !== anchor) return;
      if (fresh) {
        grid[cell] = ch;
        where.set(ch, cell);
      }
      path.push(cell);
      used.add(cell);
      if (i === word.length - 1) place(wi + 1);
      else for (const nb of neighbors(g, cell)) if (!used.has(nb)) walk(nb, i + 1);
      path.pop();
      used.delete(cell);
      if (fresh) {
        grid[cell] = null;
        where.delete(ch);
      }
    };
    for (let c = 0; c < n; c++) walk(c, 0);
  };
  place(0);
  return out;
}
