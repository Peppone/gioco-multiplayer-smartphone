import { describe, expect, it } from "vitest";
import { findLayouts, findWordPath, isCorner, neighbor, neighbors } from "./map.js";

const g = { rows: 3, cols: 3 };
const MAP = "ACS TIU ROM".replace(/ /g, "").split("");

describe("mappa", () => {
  it("adiacenza solo ortogonale e bordi", () => {
    expect(neighbor(g, 0, "up")).toBeNull();
    expect(neighbor(g, 0, "right")).toBe(1);
    expect(neighbor(g, 4, "down")).toBe(7);
    expect(neighbors(g, 4).sort()).toEqual([1, 3, 5, 7]);
    expect(neighbors(g, 0)).toHaveLength(2);
  });

  it("gli angoli sono i quattro d'angolo, non il centro", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].filter((c) => isCorner(g, c))).toEqual([0, 2, 6, 8]);
  });

  it("MORTA e USCITA si leggono sulla mappa del piano", () => {
    expect(findWordPath(g, MAP, "MORTA")).toEqual([8, 7, 6, 3, 0]);
    expect(findWordPath(g, MAP, "USCITA")).toEqual([5, 2, 1, 4, 3, 0]);
  });

  it("una parola non trovabile è segnalata con null", () => {
    expect(findWordPath(g, MAP, "MAMMA")).toBeNull();
    expect(findWordPath(g, MAP, "AM")).toBeNull(); // A e M non confinano
    expect(findWordPath(g, MAP, "")).toBeNull();
  });

  it("findLayouts elenca disposizioni valide, compresa quella del piano, con la A nell'angolo", () => {
    const layouts = findLayouts(g, ["MORTA", "USCITA"], 0, 100);
    expect(layouts.length).toBeGreaterThanOrEqual(4);
    expect(layouts.map((l) => l.join(""))).toContain(MAP.join(""));
    for (const l of layouts) {
      expect(l[0]).toBe("A");
      expect(findWordPath(g, l, "MORTA")).not.toBeNull();
      expect(findWordPath(g, l, "USCITA")).not.toBeNull();
    }
  });

  it("con l'ancora in una stanza non d'angolo i layout esistono ma la config li rifiuta (vedi index.test)", () => {
    expect(isCorner(g, 4)).toBe(false);
  });
});
