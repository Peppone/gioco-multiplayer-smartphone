import { describe, expect, it } from "vitest";
import { clueHolds, clueLabel } from "./clues.js";
import { type ObjectKind, bandWidth, longestRun, opposite, placementErrors } from "./sky.js";

const A = "asteroid", D = "dwarf", C = "comet", G = "gas", E = "empty", X = "planetX";
/** Sistema Base valido: 1 ◍, 2 ◍, 3 ☄, 4 vuoto, 5 ☁, 6 ◌, 7 ☄, 8 ☁, 9 vuoto, 10 X, 11 ◍, 12 ◍. */
const SKY: ObjectKind[] = [A, A, C, E, G, D, C, G, E, X, A, A];

describe("pianeta-nascosto: cielo e regole", () => {
  it("fasce, serie e settori opposti in cerchio", () => {
    expect(bandWidth([11, 12, 1, 2], 12)).toBe(4);
    expect(bandWidth([3, 9], 12)).toBe(7);
    expect(bandWidth([], 12)).toBe(0);
    expect(longestRun(SKY, A)).toBe(4); // 11, 12, 1, 2 attraverso il confine
    expect(opposite(1, 12)).toBe(7);
    expect(opposite(12, 18)).toBe(3);
  });

  it("il sistema d'esempio rispetta le regole di posizione; gli errori si segnalano", () => {
    expect(placementErrors(SKY)).toEqual([]);
    const broken: ObjectKind[] = [...SKY];
    broken[5] = E; // il pianeta nano diventa vuoto…
    broken[8] = D; // …e va accanto al Pianeta X
    expect(placementErrors(broken)).toContain("Pianeta X nel settore 10 vicino a un pianeta nano");
  });

  it("in Esperto i pianeti nani stanno in una fascia di esattamente 6 settori", () => {
    // 18 settori, controllata solo la regola dei pianeti nani: ◌ in 1, 3, 4, 6 (fascia 1–6).
    const sky: ObjectKind[] = [D, E, D, D, E, D, E, G, E, A, A, E, C, A, A, G, C, X];
    expect(placementErrors(sky).filter((e) => e.includes("pianeti nani"))).toEqual([]);
    const wide: ObjectKind[] = [...sky];
    wide[5] = E;
    wide[6] = D; // fascia 1–7
    expect(placementErrors(wide)).toContain("i pianeti nani non sono in una fascia di 6 settori");
  });

  it("le regole delle ricerche", () => {
    expect(clueHolds({ kind: "someAdjacent", a: A, b: C }, SKY)).toBe(true);
    expect(clueHolds({ kind: "noneAdjacent", a: D, b: A }, SKY)).toBe(true);
    expect(clueHolds({ kind: "allAdjacent", a: G, b: E }, SKY)).toBe(true);
    expect(clueHolds({ kind: "allAdjacent", a: G, b: C }, SKY)).toBe(false); // la nube del 5 non tocca comete
    // «Entro N settori» esclude il settore stesso: ogni cometa ha un'altra cometa entro 4, non entro 3.
    expect(clueHolds({ kind: "allWithin", a: C, b: C, n: 4 }, SKY)).toBe(true);
    expect(clueHolds({ kind: "allWithin", a: C, b: C, n: 3 }, SKY)).toBe(false);
    expect(clueHolds({ kind: "noneWithin", a: D, b: A, n: 3 }, SKY)).toBe(true); // il più vicino (2) è a distanza 4
    expect(clueHolds({ kind: "someOpposite", a: C, b: A }, SKY)).toBe(true); // 7 ↔ 1
    expect(clueHolds({ kind: "allOpposite", a: C, b: A }, SKY)).toBe(false); // 3 ↔ 9 vuoto
    expect(clueHolds({ kind: "band", a: A, n: 4 }, SKY)).toBe(true);
    expect(clueHolds({ kind: "band", a: A, n: 3 }, SKY)).toBe(false);
    expect(clueHolds({ kind: "allConsecutive", a: A }, SKY)).toBe(true);
    expect(clueHolds({ kind: "allConsecutive", a: G }, SKY)).toBe(false);
    // «Ci sono N … in settori consecutivi»: la serie più lunga è esattamente N.
    expect(clueHolds({ kind: "someConsecutive", a: A, n: 4 }, SKY)).toBe(true);
    expect(clueHolds({ kind: "someConsecutive", a: A, n: 3 }, SKY)).toBe(false);
  });

  it("le regole delle conferenze sul Pianeta X", () => {
    expect(clueHolds({ kind: "xWithin", b: G, n: 2 }, SKY)).toBe(true); // 8 è a distanza 2 da 10
    expect(clueHolds({ kind: "xNotWithin", b: G, n: 1 }, SKY)).toBe(true);
    expect(clueHolds({ kind: "xNotAdjacent", b: A }, SKY)).toBe(false); // 11 è un asteroide
    expect(clueHolds({ kind: "xNotOpposite", b: E }, SKY)).toBe(false); // 4 è vuoto
  });

  it("l'etichetta elenca i tipi nominati, senza il settore vuoto", () => {
    expect(clueLabel({ kind: "someAdjacent", a: A, b: C })).toEqual([A, C]);
    expect(clueLabel({ kind: "allWithin", a: C, b: C, n: 3 })).toEqual([C]);
    expect(clueLabel({ kind: "allAdjacent", a: G, b: E })).toEqual([G]);
    expect(clueLabel({ kind: "xWithin", b: G, n: 2 })).toEqual([X, G]);
  });
});
