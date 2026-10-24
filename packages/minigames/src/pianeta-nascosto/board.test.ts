import { describe, expect, it } from "vitest";
import { BOARD_LAYOUT, TOKENS, arcError, arcLength, crossingAfter, isVisible, lastCallTheories, sectorOfTime, surveyCost, visibleSectors } from "./board.js";

describe("pianeta-nascosto: tabellone", () => {
  it("le icone stanno sui confini indicati dall'utente (piano, §3.2 bis)", () => {
    const at = (mode: "standard" | "expert", n: number) => crossingAfter(mode, n).map((c) => (c ? (c.kind === "theory" ? "T" : c.id) : ""));
    expect([3, 6, 9, 12].map((n) => at("standard", n))).toEqual([["T"], ["T"], ["T"], ["T"]]);
    expect(at("standard", 10)).toEqual(["X1"]);
    expect([3, 6, 9, 12, 15, 18].map((n) => at("expert", n))).toEqual(Array(6).fill(["T"]));
    expect(at("expert", 7)).toEqual(["X1"]);
    expect(at("expert", 16)).toEqual(["X2"]);
    for (const n of [1, 2, 4, 5, 11]) expect(at("standard", n)).toEqual([]);
    expect(BOARD_LAYOUT.standard.theory).toHaveLength(4);
  });

  it("tempo, cielo visibile e archi", () => {
    expect(sectorOfTime(0, 12)).toBe(1);
    expect(sectorOfTime(12, 12)).toBe(1);
    expect(sectorOfTime(14, 12)).toBe(3);
    expect(visibleSectors(11, 12)).toEqual([11, 12, 1, 2, 3, 4]);
    expect(visibleSectors(16, 18)).toHaveLength(9);
    expect(isVisible(4, 11, 12)).toBe(true);
    expect(isVisible(5, 11, 12)).toBe(false);
    expect(arcLength(11, 2, 12)).toBe(4);
    expect(arcError("asteroid", 11, 3, 11, "standard")).toBeNull();
    expect(arcError("asteroid", 3, 6, 11, "standard")).toBe("not-visible");
    expect(arcError("asteroid", 1, 8, 1, "standard")).toBe("too-long");
    expect(arcError("comet", 2, 3, 1, "standard")).toBeNull();
    expect(arcError("comet", 1, 3, 1, "standard")).toBe("comet-ends");
  });

  it("costi dei rilevamenti, ultime opportunità e gettoni", () => {
    expect([1, 3, 4, 6, 7, 9].map(surveyCost)).toEqual([4, 4, 3, 3, 2, 2]);
    expect([0, 1, 3, 4, 5].map(lastCallTheories)).toEqual([0, 1, 1, 2, 2]);
    const total = (m: "standard" | "expert") => Object.values(TOKENS[m]).reduce((a, b) => a + b, 0);
    expect([total("standard"), total("expert")]).toEqual([9, 12]);
  });
});
