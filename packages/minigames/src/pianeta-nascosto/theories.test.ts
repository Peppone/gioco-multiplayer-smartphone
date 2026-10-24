import { describe, expect, it } from "vitest";
import { type ObjectKind } from "./sky.js";
import { advanceTheories, placeTheories, revealAll, reviewTheories } from "./theories.js";
import type { Theory } from "./types.js";

const A = "asteroid", D = "dwarf", C = "comet", G = "gas", E = "empty", X = "planetX";
const SKY: ObjectKind[] = [A, A, C, E, G, D, C, G, E, X, A, A];
const order = (a: string, b: string) => a.localeCompare(b);
const th = (id: number, ownerId: string, sector: number, object: Theory["object"], space: Theory["space"], phase = 1): Theory => ({ id, ownerId, sector, object, space, phase, faceUp: false, correct: null });

describe("pianeta-nascosto: teorie e revisione", () => {
  it("piazzamento in ordine di turno: stesso settore con oggetti diversi nella stessa fase, vince il primo", () => {
    const r = placeTheories([], [{ ownerId: "a", sector: 1, object: A }, { ownerId: "b", sector: 1, object: G }, { ownerId: "c", sector: 1, object: A }, { ownerId: "a", sector: 2, object: A }], 1, 1, {});
    expect(r.placed.map((p) => `${p.ownerId}${p.sector}${p.object}`)).toEqual(["a1asteroid", "c1asteroid", "a2asteroid"]);
    expect(r.dropped.map((p) => p.ownerId)).toEqual(["b"]);
    expect(r.theories.every((t) => t.space === 0 && !t.faceUp)).toBe(true);
    expect(placeTheories([], [{ ownerId: "a", sector: 4, object: A }], 1, 1, { 4: E }).placed).toEqual([]);
  });

  it("avanzano di uno spazio fino all'interno e poi restano", () => {
    let t = [th(1, "a", 1, A, 0)];
    for (const expected of [1, 2, 3, 3]) {
      t = advanceTheories(t);
      expect(t[0]!.space).toBe(expected);
    }
  });

  it("teoria giusta: conferma il settore, rivela le più esterne (sbagliate tolte con penalità, giuste restano)", () => {
    const t = [th(1, "a", 1, A, 3, 1), th(2, "b", 1, G, 2, 2), th(3, "c", 1, A, 1, 3), th(4, "c", 5, G, 3, 1)];
    const r = reviewTheories(SKY, t, order);
    expect(r.confirmed).toEqual({ 1: A, 5: G });
    expect(r.theories.map((x) => `${x.id}${x.faceUp}`).sort()).toEqual(["1true", "3true", "4true"]);
    expect(r.penalties).toEqual([{ ownerId: "b", sector: 1 }]);
    expect(r.refuted).toEqual([]);
  });

  it("teoria sbagliata: l'oggetto è escluso per tutti, la teoria si toglie e quelle più esterne restano coperte", () => {
    const t = [th(1, "a", 1, G, 3, 1), th(2, "b", 1, A, 2, 2)];
    const r = reviewTheories(SKY, t, order);
    expect(r.confirmed).toEqual({});
    expect(r.refuted).toEqual([{ sector: 1, object: G }]);
    expect(r.penalties).toEqual([{ ownerId: "a", sector: 1 }]);
    expect(r.theories.map((x) => x.id)).toEqual([2]);
    expect(r.theories[0]!.faceUp).toBe(false);
  });

  it("più penalità insieme seguono l'ordine di turno; settori in ordine numerico", () => {
    const t = [th(1, "z", 5, A, 3), th(2, "a", 5, D, 3), th(3, "m", 2, C, 3)];
    const r = reviewTheories(SKY, t, order);
    expect(r.penalties.map((p) => `${p.sector}${p.ownerId}`)).toEqual(["2m", "5a", "5z"]);
    expect(r.events.map((e) => e.sector)).toEqual([2, 5, 5]);
  });

  it("rivelazione finale: le giuste restano, le sbagliate si tolgono senza penalità", () => {
    const r = revealAll(SKY, [th(1, "a", 1, A, 1), th(2, "a", 5, A, 0), { ...th(3, "b", 2, A, 3), faceUp: true, correct: true }]);
    expect(r.map((x) => x.id)).toEqual([1, 3]);
    expect(r.every((x) => x.faceUp && x.correct)).toBe(true);
  });
});
