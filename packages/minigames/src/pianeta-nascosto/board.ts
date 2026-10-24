import { type Mode, type Seen, SECTORS, COMET_SECTORS } from "./sky.js";

/**
 * Il tabellone del Pianeta Nascosto: tracciato del tempo, Terra, cielo visibile e costi (piano, §3.2–§3.3).
 * Funzioni pure. Il tempo si misura in giorni = settori percorsi (più giri possibili): il settore è `time mod N + 1`.
 */

/**
 * Icone sull'anello interno: stanno sul confine tra il settore `k` e il successivo e si attivano quando la freccia
 * della Terra passa da `k` a `k + 1`. Le teorie a ogni giro, le conferenze solo la prima volta.
 */
export const BOARD_LAYOUT: Record<Mode, { theory: number[]; conferences: { id: "X1" | "X2"; after: number }[] }> = {
  standard: { theory: [3, 6, 9, 12], conferences: [{ id: "X1", after: 10 }] },
  expert: { theory: [3, 6, 9, 12, 15, 18], conferences: [{ id: "X1", after: 7 }, { id: "X2", after: 16 }] },
};

/** Gettoni teoria per squadra (piano, §3.5). */
export type Token = "asteroid" | "comet" | "gas" | "dwarf";
export const TOKEN_KINDS: Token[] = ["asteroid", "comet", "gas", "dwarf"];
export const TOKENS: Record<Mode, Record<Token, number>> = {
  standard: { asteroid: 4, comet: 2, gas: 2, dwarf: 1 },
  expert: { asteroid: 4, comet: 2, gas: 2, dwarf: 4 },
};
/** Teorie per fase: 1 in Base, 2 in Esperto. */
export const THEORIES_PER_PHASE: Record<Mode, number> = { standard: 1, expert: 2 };

export const TARGETS_PER_TEAM = 2;
export const COSTS = { target: 4, research: 1, locate: 5, pass: 1 } as const;
/** Spazi della pista di revisione: 0 = esterno [+], 3 = interno [↻]. */
export const TRACK_LAST = 3;

export const sectorOfTime = (time: number, n: number): number => (((time % n) + n) % n) + 1;

/** Costo di un rilevamento in base alla lunghezza dell'arco (4 per 1–3 settori, 3 per 4–6, 2 per 7–9). */
export function surveyCost(length: number): number {
  return length <= 3 ? 4 : length <= 6 ? 3 : 2;
}

/** Quanti settori si vedono: metà del cerchio. */
export const visibleCount = (n: number): number => n / 2;

/** I settori del cielo visibile quando la freccia indica `earthSector`. */
export function visibleSectors(earthSector: number, n: number): number[] {
  return Array.from({ length: visibleCount(n) }, (_, i) => ((earthSector - 1 + i) % n) + 1);
}

export const isVisible = (sector: number, earthSector: number, n: number): boolean => ((sector - earthSector + n) % n) < visibleCount(n);

/** Lunghezza dell'arco da `from` a `to` in senso orario (estremi inclusi). */
export const arcLength = (from: number, to: number, n: number): number => ((to - from + n) % n) + 1;

/** I settori dell'arco. */
export function arcSectors(from: number, to: number, n: number): number[] {
  return Array.from({ length: arcLength(from, to, n) }, (_, i) => ((from - 1 + i) % n) + 1);
}

export type ArcError = "not-visible" | "too-long" | "comet-ends";

/** Controlla un arco di rilevamento nel cielo visibile; per le comete deve iniziare e finire su un settore da cometa. */
export function arcError(object: Seen, from: number, to: number, earthSector: number, mode: Mode): ArcError | null {
  const n = SECTORS[mode];
  if (from < 1 || from > n || to < 1 || to > n) return "not-visible";
  const len = arcLength(from, to, n);
  if (len > visibleCount(n)) return "too-long";
  const offset = (from - earthSector + n) % n;
  if (offset + len > visibleCount(n)) return "not-visible";
  if (object === "comet" && !(COMET_SECTORS[mode].includes(from) && COMET_SECTORS[mode].includes(to))) return "comet-ends";
  return null;
}

/** Cosa succede quando la freccia della Terra passa dal settore `from` al successivo. */
export type Crossing = { kind: "theory" } | { kind: "conference"; id: "X1" | "X2" } | null;

export function crossingAfter(mode: Mode, from: number): Crossing[] {
  const layout = BOARD_LAYOUT[mode];
  const out: Crossing[] = [];
  if (layout.theory.includes(from)) out.push({ kind: "theory" });
  for (const c of layout.conferences) if (c.after === from) out.push({ kind: "conference", id: c.id });
  return out;
}

/** Quanti giorni (settori) servono per fare `lag` di ritardo: chi è indietro di 1–3 può inviare una teoria, di 4–5 due. */
export function lastCallTheories(lag: number): number {
  return lag >= 4 ? 2 : lag >= 1 ? 1 : 0;
}
