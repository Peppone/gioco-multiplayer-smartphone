import { TRACK_LAST, type Token } from "./board.js";
import type { ObjectKind } from "./sky.js";
import type { Theory } from "./types.js";

/**
 * Teorie sulle piste di revisione (piano, §3.5): gettoni coperti che avanzano verso l'interno, revisione settore per
 * settore, oggetti confermati e penalità. Funzioni pure.
 */

export interface Pick {
  ownerId: string;
  sector: number;
  object: Token;
}

/**
 * Piazza le teorie scelte nello spazio esterno, **in ordine di turno**. Non si piazza in un settore già confermato, né due
 * teorie della stessa squadra nello stesso settore. Due squadre che scelgono lo stesso settore nella stessa fase con oggetti
 * diversi: vale la prima in ordine di turno, l'altra torna indietro (il gettone non si spende).
 * Il piano chiedeva anche di rifiutare le teorie identiche a una già in pista: non si fa, perché il rifiuto rivelerebbe
 * l'oggetto di una teoria coperta.
 */
export function placeTheories(theories: Theory[], picks: Pick[], phase: number, firstId: number, confirmed: Record<number, unknown>): { theories: Theory[]; placed: Pick[]; dropped: Pick[] } {
  const out = [...theories];
  const placed: Pick[] = [];
  const dropped: Pick[] = [];
  let id = firstId;
  for (const p of picks) {
    const clash = placed.some((q) => q.sector === p.sector && q.object !== p.object);
    const sameOwner = placed.some((q) => q.sector === p.sector && q.ownerId === p.ownerId);
    if (confirmed[p.sector] !== undefined || clash || sameOwner) {
      dropped.push(p);
      continue;
    }
    out.push({ id: id++, ownerId: p.ownerId, sector: p.sector, object: p.object, space: 0, phase, faceUp: false, correct: null });
    placed.push(p);
  }
  return { theories: out, placed, dropped };
}

/** Tutte le teorie coperte avanzano di uno spazio verso l'interno. */
export function advanceTheories(theories: Theory[]): Theory[] {
  return theories.map((t) => (t.faceUp || t.space >= TRACK_LAST ? t : { ...t, space: (t.space + 1) as Theory["space"] }));
}

export interface ReviewEvent {
  sector: number;
  theoryId: number;
  ownerId: string;
  object: Token;
  correct: boolean;
}

export interface ReviewResult {
  theories: Theory[];
  /** Settori confermati in questa revisione: settore → oggetto. */
  confirmed: Record<number, Token>;
  /** Oggetti che si sa **non** esserci: settore + oggetto (teorie sbagliate senza conferma). */
  refuted: { sector: number; object: Token }[];
  /** Una voce per ogni teoria sbagliata tolta: chi avanza di 1 (nell'ordine in cui vanno applicate). */
  penalties: { ownerId: string; sector: number }[];
  /** In ordine di rivelazione, per l'animazione della TV. */
  events: ReviewEvent[];
}

/**
 * Revisione: per ogni settore con una teoria nello spazio interno (in ordine numerico) si rivelano le teorie interne.
 * Se una è giusta il settore è confermato e si rivelano anche le teorie più esterne (le sbagliate si tolgono); altrimenti
 * le sbagliate si tolgono e l'oggetto è escluso. `turnOrder` ordina i proprietari per turno (anche per le penalità).
 */
export function reviewTheories(sky: ObjectKind[], theories: Theory[], turnOrder: (a: string, b: string) => number): ReviewResult {
  let current = theories;
  const confirmed: Record<number, Token> = {};
  const refuted: ReviewResult["refuted"] = [];
  const penalties: ReviewResult["penalties"] = [];
  const events: ReviewEvent[] = [];
  const sectors = [...new Set(theories.filter((t) => !t.faceUp && t.space === TRACK_LAST).map((t) => t.sector))].sort((a, b) => a - b);
  for (const sector of sectors) {
    const covered = current.filter((t) => !t.faceUp && t.sector === sector);
    const inner = covered.filter((t) => t.space === TRACK_LAST);
    const truth = sky[sector - 1]!;
    const hit = inner.some((t) => t.object === truth);
    const revealed = [...(hit ? covered : inner)].sort((a, b) => b.space - a.space || turnOrder(a.ownerId, b.ownerId) || a.id - b.id);
    const ids = new Set(revealed.map((t) => t.id));
    if (hit) confirmed[sector] = truth as Token;
    else for (const o of new Set(inner.map((t) => t.object))) refuted.push({ sector, object: o });
    for (const t of revealed) {
      const correct = t.object === truth;
      events.push({ sector, theoryId: t.id, ownerId: t.ownerId, object: t.object, correct });
      if (!correct) penalties.push({ ownerId: t.ownerId, sector });
    }
    current = current.flatMap((t) => (ids.has(t.id) ? (t.object === truth ? [{ ...t, faceUp: true, correct: true }] : []) : [t]));
  }
  // Più penalità insieme: nell'ordine di turno, così l'ordine relativo non cambia.
  penalties.sort((a, b) => a.sector - b.sector || turnOrder(a.ownerId, b.ownerId));
  return { theories: current, confirmed, refuted, penalties, events };
}

/** Rivelazione finale: ogni teoria ancora coperta si gira; le giuste restano, le sbagliate si tolgono (nessuna penalità). */
export function revealAll(sky: ObjectKind[], theories: Theory[]): Theory[] {
  return theories.flatMap((t) => (t.faceUp ? [t] : sky[t.sector - 1] === t.object ? [{ ...t, faceUp: true, correct: true }] : []));
}
