import { describe, expect, it } from "vitest";
import { type ObjectKind } from "./sky.js";
import { breakdownOf } from "./scoring.js";
import { placeTheories, reviewTheories } from "./theories.js";
import type { Observatory, Theory } from "./types.js";

const A = "asteroid", C = "comet", G = "gas", E = "empty", D = "dwarf", X = "planetX";
const SKY: ObjectKind[] = [A, A, C, E, G, D, C, G, E, X, A, A];
const th = (id: number, ownerId: string, sector: number, object: Theory["object"], space: Theory["space"], phase: number): Theory => ({ id, ownerId, sector, object, space, phase, faceUp: false, correct: null });
const obs = (id: string) => ({ id, guessPoints: 0 }) as Observatory;

describe("pianeta-nascosto: teorie giuste dopo la prima", () => {
  it("una teoria giusta più esterna, ancora coperta quando l'altra si rivela, vale gli stessi punti (ma non la priorità)", () => {
    // a è arrivata in fondo alla pista (fase 1), b ha inviato dopo (fase 3) la stessa teoria giusta
    const r = reviewTheories(SKY, [th(1, "a", 1, A, 3, 1), th(2, "b", 1, A, 1, 3)], (x, y) => x.localeCompare(y));
    expect(r.theories.every((t) => t.faceUp && t.correct)).toBe(true);
    expect(r.penalties).toEqual([]);
    const a = breakdownOf(obs("a"), r.theories, "standard", []);
    const b = breakdownOf(obs("b"), r.theories, "standard", []);
    expect([a.asteroid, b.asteroid]).toEqual([2, 2]);
    expect([a.priority, b.priority]).toEqual([1, 0]);
  });

  it("anche la teoria giusta che aspetta la rivelazione finale vale i punti", () => {
    const covered = [th(1, "a", 1, A, 3, 1), th(2, "b", 1, A, 0, 5)];
    const r = reviewTheories(SKY, covered, (x, y) => x.localeCompare(y));
    expect(breakdownOf(obs("b"), r.theories, "standard", []).total).toBe(2);
  });

  it("una volta rivelata una teoria giusta in un settore non se ne possono più piazzare", () => {
    const r = placeTheories([], [{ ownerId: "b", sector: 1, object: A }], 4, 1, { 1: A });
    expect(r.placed).toEqual([]);
    expect(r.theories).toEqual([]);
  });
});
