import type { Token } from "./board.js";
import type { Mode } from "./sky.js";
import type { Observatory, Theory } from "./types.js";

/** Punti delle teorie giuste (piano, §3.6): asteroide 2, cometa 3, nube di gas 4, pianeta nano 4 (Esperto: 2). */
export const THEORY_POINTS: Record<Mode, Record<Token, number>> = {
  standard: { asteroid: 2, comet: 3, gas: 4, dwarf: 4 },
  expert: { asteroid: 2, comet: 3, gas: 4, dwarf: 2 },
};
export const PRIORITY_POINTS = 1;
export const LOCATE_FIRST_POINTS = 10;
export const LOCATE_LATER_PER_SECTOR = 2;
export const FINAL_GUESS_POINTS = 5;

export interface Breakdown {
  priority: number;
  asteroid: number;
  comet: number;
  gas: number;
  dwarf: number;
  /** Pianeta X: localizzato per primi, in ultima opportunità o ipotesi finale. */
  planetX: number;
  total: number;
}

/** Il foglio del punteggio di un osservatorio (punti originali). */
export function breakdownOf(obs: Observatory, theories: Theory[], mode: Mode, firstFinders: string[]): Breakdown {
  const correct = theories.filter((t) => t.faceUp && t.correct);
  const mine = correct.filter((t) => t.ownerId === obs.id);
  const by = (object: Token) => mine.filter((t) => t.object === object).length * THEORY_POINTS[mode][object];
  // Priorità: in ogni settore, chi ha la teoria giusta della fase più bassa (o pari prima).
  let priority = 0;
  for (const sector of new Set(mine.map((t) => t.sector))) {
    const first = Math.min(...correct.filter((t) => t.sector === sector).map((t) => t.phase));
    if (mine.some((t) => t.sector === sector && t.phase === first)) priority += PRIORITY_POINTS;
  }
  const planetX = (firstFinders.includes(obs.id) ? LOCATE_FIRST_POINTS : 0) + obs.guessPoints;
  const parts = { priority, asteroid: by("asteroid"), comet: by("comet"), gas: by("gas"), dwarf: by("dwarf"), planetX };
  return { ...parts, total: Object.values(parts).reduce((s, v) => s + v, 0) };
}

/** Classifica: totale, poi punti del Pianeta X, poi bonus di priorità, poi pari merito (stesso rango). */
export function rankObservatories(rows: { id: string; breakdown: Breakdown }[]): { id: string; rank: number }[] {
  const key = (b: Breakdown) => [b.total, b.planetX, b.priority];
  const sorted = [...rows].sort((a, b) => {
    const [x, y] = [key(a.breakdown), key(b.breakdown)];
    return y[0]! - x[0]! || y[1]! - x[1]! || y[2]! - x[2]! || a.id.localeCompare(b.id);
  });
  let rank = 0;
  return sorted.map((r, i) => {
    const prev = sorted[i - 1];
    if (!prev || key(prev.breakdown).some((v, k) => v !== key(r.breakdown)[k])) rank = i + 1;
    return { id: r.id, rank };
  });
}
