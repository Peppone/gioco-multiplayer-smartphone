import { describe, expect, it } from "vitest";
import { type LoopPlan, clarityAt, loopPosition, loopTotalMs } from "./playback.js";

const plan: LoopPlan = { snippetsMs: [500, 1_000, 2_000], pauseMs: 1_000 };

describe("ascolto a spezzoni", () => {
  it("la durata totale somma gli spezzoni e le loro pause (anche l'ultima)", () => {
    expect(loopTotalMs(plan)).toBe(500 + 1_000 + 2_000 + 3 * 1_000);
  });

  it("suona il primo spezzone, tace, poi riparte dall'inizio del brano con uno spezzone più lungo", () => {
    expect(loopPosition(plan, 0)).toEqual({ index: 0, sounding: true, songMs: 0, nextChangeMs: 500 });
    expect(loopPosition(plan, 300)).toEqual({ index: 0, sounding: true, songMs: 300, nextChangeMs: 500 });
    expect(loopPosition(plan, 500)).toEqual({ index: 0, sounding: false, songMs: 500, nextChangeMs: 1_500 });
    expect(loopPosition(plan, 1_499)).toMatchObject({ sounding: false, nextChangeMs: 1_500 });
    expect(loopPosition(plan, 1_500)).toEqual({ index: 1, sounding: true, songMs: 0, nextChangeMs: 2_500 });
    expect(loopPosition(plan, 3_000)).toEqual({ index: 1, sounding: false, songMs: 1_000, nextChangeMs: 3_500 });
    expect(loopPosition(plan, 3_500)).toEqual({ index: 2, sounding: true, songMs: 0, nextChangeMs: 5_500 });
  });

  it("dopo l'ultima pausa non cambia più nulla", () => {
    const end = loopTotalMs(plan);
    expect(loopPosition(plan, end)).toEqual({ index: 2, sounding: false, songMs: 2_000, nextChangeMs: null });
    expect(loopPosition(plan, end + 10_000).nextChangeMs).toBeNull();
  });

  it("riprendendo da un punto a metà spezzone riparte dalla posizione giusta", () => {
    // 1,5 s di pausa + 0,6 s del secondo spezzone
    expect(loopPosition(plan, 2_100)).toMatchObject({ index: 1, sounding: true, songMs: 600 });
  });

  it("un tempo negativo vale come l'inizio", () => {
    expect(loopPosition(plan, -50)).toMatchObject({ index: 0, sounding: true, songMs: 0 });
  });
});

describe("nitidezza progressiva", () => {
  it("cresce con il tempo e arriva a 1 a fine ascolto", () => {
    expect(clarityAt(0, 30_000)).toBe(0);
    expect(clarityAt(15_000, 30_000)).toBeCloseTo(0.5);
    expect(clarityAt(30_000, 30_000)).toBe(1);
    expect(clarityAt(45_000, 30_000)).toBe(1);
  });

  it("con una percentuale il brano è nitido prima della fine", () => {
    expect(clarityAt(12_000, 30_000, 80)).toBeCloseTo(0.5);
    expect(clarityAt(24_000, 30_000, 80)).toBe(1);
    expect(clarityAt(27_000, 30_000, 80)).toBe(1);
  });
});
