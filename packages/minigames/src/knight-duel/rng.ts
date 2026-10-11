/**
 * Generatore pseudo-casuale a seme (mulberry32): stesso seme = stessa sequenza.
 * Le funzioni di gioco ricevono un seme e non usano mai `Math.random()`, così restano deterministiche e testabili.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Intero in [0, n). */
export const randInt = (rng: () => number, n: number): number => Math.floor(rng() * n);

/** Copia mescolata (Fisher-Yates); l'originale non viene modificato. */
export function shuffle<T>(list: readonly T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Deriva un nuovo seme da un seme e un numero (es. il ciclo del duello): serve a separare i flussi casuali. */
export function deriveSeed(seed: number, salt: number): number {
  return Math.imul((seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0, 0x85ebca6b) >>> 0;
}
