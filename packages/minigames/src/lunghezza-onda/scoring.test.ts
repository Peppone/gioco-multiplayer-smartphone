import { describe, expect, it } from "vitest";
import { clampPos, counterCorrect, majority, median, scoreFreeForAll, scoreTeams, zoneOf } from "./scoring.js";

describe("lunghezza-onda: calcoli dei punti", () => {
  it("le fasce hanno confini inclusi: mezza fascia è ancora centro", () => {
    const z = (pos: number) => zoneOf(pos, 50, 5);
    expect([z(50), z(52.5), z(47.5)]).toEqual([4, 4, 4]);
    expect([z(53), z(57.5), z(42.5)]).toEqual([3, 3, 3]);
    expect([z(58), z(62.5), z(37.5)]).toEqual([2, 2, 2]);
    expect([z(63), z(0), z(100)]).toEqual([0, 0, 0]);
  });

  it("le posizioni si arrotondano a 0,5 e restano tra 0 e 100", () => {
    expect(clampPos(33.26)).toBe(33.5);
    expect(clampPos(33.2)).toBe(33);
    expect(clampPos(-4)).toBe(0);
    expect(clampPos(140)).toBe(100);
  });

  it("mediana con numero dispari e pari di valori, nessun valore = null", () => {
    expect(median([70, 10, 40])).toBe(40);
    expect(median([10, 21])).toBe(15.5);
    expect(median([90, 10, 20, 30])).toBe(25);
    expect(median([])).toBeNull();
  });

  it("scommessa a maggioranza; pareggio o nessun voto = nessuna scommessa", () => {
    expect(majority(["left", "left", "right"])).toBe("left");
    expect(majority(["right"])).toBe("right");
    expect(majority(["left", "right"])).toBeNull();
    expect(majority([])).toBeNull();
  });

  it("la scommessa è giusta se il bersaglio sta da quella parte; a pari posizione nessuno ha ragione", () => {
    expect(counterCorrect("left", 60, 40)).toBe(true);
    expect(counterCorrect("right", 60, 40)).toBe(false);
    expect(counterCorrect("left", 50, 50)).toBe(false);
    expect(counterCorrect("right", 50, 50)).toBe(false);
  });

  it("tutti contro tutti: fascia × unità a ciascuno, al Sensitivo la media arrotondata", () => {
    const { guesses, psychicPoints } = scoreFreeForAll(
      [
        { playerId: "a", pos: 50 },
        { playerId: "b", pos: 54 },
        { playerId: "c", pos: 90 },
      ],
      50,
      5,
      25,
    );
    expect(guesses.map((g) => g.points)).toEqual([100, 75, 0]);
    expect(psychicPoints).toBe(58); // (100 + 75 + 0) / 3 = 58,3
    expect(scoreFreeForAll([], 50, 5, 25).psychicPoints).toBe(0);
  });

  it("a squadre: fascia della mediana; scommesse giuste valgono, ma non se la squadra ha fatto 4", () => {
    const near = scoreTeams(55, 50, 5, [{ teamId: "x", dir: "left" }, { teamId: "y", dir: "right" }, { teamId: "z", dir: null }], 1);
    expect(near.zone).toBe(3);
    expect(near.counters.map((c) => [c.correct, c.points])).toEqual([[true, 1], [false, 0], [false, 0]]);
    const bull = scoreTeams(51, 50, 5, [{ teamId: "x", dir: "left" }], 1);
    expect(bull.zone).toBe(4);
    expect(bull.counters[0]).toMatchObject({ correct: true, points: 0 });
    const none = scoreTeams(null, 50, 5, [{ teamId: "x", dir: "left" }], 1);
    expect(none.zone).toBe(0);
    expect(none.counters[0]!.correct).toBe(false);
  });
});
