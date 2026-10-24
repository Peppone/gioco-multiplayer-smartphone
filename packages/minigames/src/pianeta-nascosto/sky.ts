/**
 * Il sistema solare del Pianeta Nascosto: settori in cerchio, oggetti e regole di posizione (piano, §3.1).
 * Funzioni pure. Il settore n è all'indice n − 1.
 */

export type Mode = "standard" | "expert";
/** I quattro corpi celesti: gli unici su cui si fanno teorie e fatti iniziali. */
export type Body = "asteroid" | "dwarf" | "comet" | "gas";
/** Ciò che mostrano gli strumenti (il Pianeta X appare vuoto). */
export type Seen = Body | "empty";
export type ObjectKind = Seen | "planetX";

export const BODIES: Body[] = ["asteroid", "dwarf", "comet", "gas"];

export const SECTORS: Record<Mode, number> = { standard: 12, expert: 18 };

/** Quanti oggetti di ogni tipo ci sono in un sistema. */
export const COMPOSITION: Record<Mode, Record<ObjectKind, number>> = {
  standard: { planetX: 1, comet: 2, asteroid: 4, dwarf: 1, gas: 2, empty: 2 },
  expert: { planetX: 1, comet: 2, asteroid: 4, dwarf: 4, gas: 2, empty: 5 },
};

/** Settori dove possono stare le comete. */
export const COMET_SECTORS: Record<Mode, number[]> = {
  standard: [2, 3, 5, 7, 11],
  expert: [2, 3, 5, 7, 11, 13, 17],
};

export function modeOf(sectorCount: number): Mode | null {
  return sectorCount === 12 ? "standard" : sectorCount === 18 ? "expert" : null;
}

/** I due settori adiacenti (in cerchio). */
export function neighbors(sector: number, n: number): [number, number] {
  return [((sector + n - 2) % n) + 1, (sector % n) + 1];
}

/** Il settore direttamente opposto (a metà cerchio). */
export function opposite(sector: number, n: number): number {
  return ((sector - 1 + n / 2) % n) + 1;
}

/** Distanza in settori lungo il cerchio (0 = stesso settore, 1 = adiacenti). */
export function distance(a: number, b: number, n: number): number {
  const d = Math.abs(a - b) % n;
  return Math.min(d, n - d);
}

/** I settori (da 1) che contengono quel tipo di oggetto. */
export function sectorsOf(sky: ObjectKind[], kind: ObjectKind): number[] {
  const out: number[] = [];
  sky.forEach((k, i) => {
    if (k === kind) out.push(i + 1);
  });
  return out;
}

/** La fascia più corta di settori consecutivi che contiene tutti i settori indicati (0 se l'elenco è vuoto). */
export function bandWidth(sectors: number[], n: number): number {
  if (sectors.length === 0) return 0;
  const sorted = [...sectors].sort((a, b) => a - b);
  // La fascia più corta lascia fuori il buco più grande tra due settori consecutivi dell'elenco.
  let maxGap = 0;
  for (let i = 0; i < sorted.length; i++) {
    const next = i + 1 < sorted.length ? sorted[i + 1]! : sorted[0]! + n;
    maxGap = Math.max(maxGap, next - sorted[i]! - 1);
  }
  return n - maxGap;
}

/** La serie più lunga di settori consecutivi (in cerchio) che contengono quel tipo di oggetto. */
export function longestRun(sky: ObjectKind[], kind: ObjectKind): number {
  const n = sky.length;
  if (sky.every((k) => k === kind)) return n;
  let best = 0;
  let run = 0;
  for (let i = 0; i < 2 * n; i++) {
    run = sky[i % n] === kind ? run + 1 : 0;
    best = Math.max(best, Math.min(run, n));
  }
  return best;
}

/** Le regole di posizione violate (vuoto = sistema valido). Testi per i messaggi di errore e i test. */
export function placementErrors(sky: ObjectKind[]): string[] {
  const n = sky.length;
  const mode = modeOf(n);
  if (!mode) return [`numero di settori non valido: ${n}`];
  const errors: string[] = [];
  for (const [kind, count] of Object.entries(COMPOSITION[mode]) as [ObjectKind, number][]) {
    const found = sectorsOf(sky, kind).length;
    if (found !== count) errors.push(`${kind}: ${found} invece di ${count}`);
  }
  const has = (s: number, kind: ObjectKind) => sky[s - 1] === kind;
  for (const s of sectorsOf(sky, "comet")) {
    if (!COMET_SECTORS[mode].includes(s)) errors.push(`cometa nel settore ${s}, che non è un settore da cometa`);
  }
  for (const s of sectorsOf(sky, "asteroid")) {
    if (!neighbors(s, n).some((t) => has(t, "asteroid"))) errors.push(`asteroide nel settore ${s} senza asteroidi vicini`);
  }
  for (const s of sectorsOf(sky, "gas")) {
    if (!neighbors(s, n).some((t) => has(t, "empty"))) errors.push(`nube di gas nel settore ${s} senza settori vuoti vicini`);
  }
  for (const s of sectorsOf(sky, "planetX")) {
    if (neighbors(s, n).some((t) => has(t, "dwarf"))) errors.push(`Pianeta X nel settore ${s} vicino a un pianeta nano`);
  }
  if (mode === "expert") {
    // I quattro pianeti nani stanno in una fascia di esattamente 6 settori, con un pianeta nano a ciascun estremo.
    if (bandWidth(sectorsOf(sky, "dwarf"), n) !== 6) errors.push("i pianeti nani non sono in una fascia di 6 settori");
  }
  return errors;
}

/**
 * Genera un sistema valido dal generatore `rng`: pianeti nani (in Esperto in una fascia di 6), comete nei settori ammessi,
 * il resto mescolato; si scartano i sistemi che violano le regole di posizione.
 */
export function generateSky(mode: Mode, rng: () => number): ObjectKind[] {
  const n = SECTORS[mode];
  const comp = COMPOSITION[mode];
  for (let attempt = 0; attempt < 100_000; attempt++) {
    const sky: (ObjectKind | null)[] = Array(n).fill(null);
    if (mode === "expert") {
      const start = Math.floor(rng() * n);
      sky[start] = "dwarf";
      sky[(start + 5) % n] = "dwarf";
      const inner = [1, 2, 3, 4];
      for (let k = 0; k < 2; k++) sky[(start + inner.splice(Math.floor(rng() * inner.length), 1)[0]!) % n] = "dwarf";
    }
    const comets = [...COMET_SECTORS[mode]].filter((s) => sky[s - 1] === null);
    for (let k = 0; k < comp.comet; k++) sky[comets.splice(Math.floor(rng() * comets.length), 1)[0]! - 1] = "comet";
    const rest: ObjectKind[] = [];
    for (const [kind, count] of Object.entries(comp) as [ObjectKind, number][]) {
      const placed = sky.filter((k) => k === kind).length;
      for (let k = placed; k < count; k++) rest.push(kind);
    }
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [rest[i], rest[j]] = [rest[j]!, rest[i]!];
    }
    const free = sky.map((k, i) => (k === null ? i : -1)).filter((i) => i >= 0);
    if (free.length !== rest.length) continue;
    free.forEach((i, k) => (sky[i] = rest[k]!));
    if (placementErrors(sky as ObjectKind[]).length === 0) return sky as ObjectKind[];
  }
  throw new Error(`nessun sistema valido trovato (${mode})`);
}

/** Come lo vedono gli strumenti: il Pianeta X appare vuoto. */
export const seenOf = (kind: ObjectKind): Seen => (kind === "planetX" ? "empty" : kind);
