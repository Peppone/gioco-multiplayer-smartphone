import { describe, expect, it } from "vitest";
import type { RatePlan } from "@gioco/shared";
import { REVEAL_STEPS, heardAtSong, revealClarity, revealRegions, snippetReveals } from "./reveal";

const plan = { clipMs: 20_000, clearAtPercent: 100 };

describe("nitidezza lungo il brano", () => {
  it("a velocità normale cresce linearmente dal punto di partenza fino a fine ascolto", () => {
    const clarity = revealClarity(plan, null, 10);
    expect(clarity(0)).toBe(0); // prima della partenza
    expect(clarity(10)).toBe(0);
    expect(clarity(20)).toBeCloseTo(0.5, 6);
    expect(clarity(30)).toBe(1);
    expect(clarity(50)).toBe(1);
  });

  it("«nitido al» anticipa il momento in cui il suono è tornato originale", () => {
    const clarity = revealClarity({ clipMs: 20_000, clearAtPercent: 50 }, null, 0);
    expect(clarity(5)).toBeCloseTo(0.5, 6);
    expect(clarity(10)).toBe(1);
  });

  it("a velocità doppia il brano scorre più in fretta ma la nitidezza segue il tempo ascoltato", () => {
    const rate: RatePlan = { rate: 2, untilMs: null, transitionMs: 0 };
    const clarity = revealClarity(plan, rate, 0);
    // 10 s ascoltati = 20 s di brano = metà della nitidezza
    expect(clarity(20)).toBeCloseTo(0.5, 5);
    expect(clarity(40)).toBe(1);
  });

  it("l'inverso di songMsAt non scende mai e non supera il massimo", () => {
    const rate: RatePlan = { rate: 0.5, untilMs: 4_000, transitionMs: 2_000 };
    let last = 0;
    for (let song = 0; song <= 30_000; song += 500) {
      const heard = heardAtSong(rate, song, 20_000);
      expect(heard).toBeGreaterThanOrEqual(last);
      expect(heard).toBeLessThanOrEqual(20_000);
      last = heard;
    }
    expect(heardAtSong(null, 7_000, 20_000)).toBeCloseTo(7_000, 3);
    expect(heardAtSong(null, -5, 20_000)).toBe(0);
  });
});

describe("spezzoni con «Svela gradualmente»", () => {
  const loop = { snippetsMs: [2_000, 4_000, 8_000], pauseMs: 1_000 };
  const spezzoni = snippetReveals(loop, 10, { clipMs: 18_000, clearAtPercent: 100 });

  it("ogni spezzone parte dallo stesso punto del brano e sta dopo il precedente nel file preparato", () => {
    expect(spezzoni.map((s) => s.fromSeconds)).toEqual([10, 10, 10]);
    expect(spezzoni.map((s) => s.lengthSeconds)).toEqual([2, 4, 8]);
    expect(spezzoni.map((s) => s.offsetSeconds)).toEqual([0, 2, 6]);
  });

  it("la nitidezza conta il tempo già ascoltato negli spezzoni e nelle pause precedenti", () => {
    // il secondo spezzone comincia dopo 2 s + 1 s di pausa = 3 s ascoltati su 18
    expect(spezzoni[0]!.clarity(10)).toBe(0);
    expect(spezzoni[1]!.clarity(10)).toBeCloseTo(3 / 18, 6);
    expect(spezzoni[1]!.clarity(12)).toBeCloseTo(5 / 18, 6);
    // il terzo: 2+1+4+1 = 8 s
    expect(spezzoni[2]!.clarity(10)).toBeCloseTo(8 / 18, 6);
    expect(spezzoni[2]!.clarity(18)).toBeCloseTo(16 / 18, 6); // 8 s già ascoltati + 8 s dentro lo spezzone
    expect(spezzoni[2]!.clarity(20)).toBe(1);
  });

  it("lo stesso punto del brano è più nitido negli spezzoni successivi", () => {
    for (const at of [10, 11, 12]) {
      expect(spezzoni[1]!.clarity(at)).toBeGreaterThan(spezzoni[0]!.clarity(at));
      expect(spezzoni[2]!.clarity(at)).toBeGreaterThan(spezzoni[1]!.clarity(at));
    }
  });
});

describe("tratti a nitidezza fissa", () => {
  it("dividono il brano in gradini crescenti, senza buchi, e finiscono dove il suono è nitido", () => {
    const clarity = revealClarity(plan, null, 0);
    const regions = revealRegions(clarity, 0, 40);
    expect(regions.length).toBeGreaterThan(1);
    expect(regions.length).toBeLessThanOrEqual(REVEAL_STEPS);
    regions.forEach((r, i) => {
      expect(r.to).toBeGreaterThan(r.from);
      expect(r.clarity).toBeLessThan(1);
      expect(r.clarity * REVEAL_STEPS).toBeCloseTo(Math.round(r.clarity * REVEAL_STEPS), 9);
      if (i > 0) {
        expect(r.clarity).toBeGreaterThan(regions[i - 1]!.clarity);
        expect(r.from).toBeCloseTo(regions[i - 1]!.to, 9);
      }
    });
    expect(regions[0]!.from).toBe(0);
    expect(regions[0]!.clarity).toBe(0);
    expect(regions[regions.length - 1]!.to).toBeCloseTo(20, 1);
  });

  it("un tratto non è mai più nitido del vero (il gradino è quello di inizio tratto)", () => {
    const clarity = revealClarity(plan, null, 0);
    for (const r of revealRegions(clarity, 0, 40)) expect(r.clarity).toBeLessThanOrEqual(clarity(r.from) + 1e-9);
  });

  it("dopo la fine dell'ascolto non resta nessun tratto: lì il suono è l'originale", () => {
    expect(revealRegions(revealClarity(plan, null, 0), 25, 40)).toEqual([]);
  });

  it("senza rampa (nitidezza sempre 0) è un tratto solo, pieno", () => {
    expect(revealRegions(() => 0, 2, 9.5)).toEqual([{ from: 2, to: expect.closeTo(9.5, 6), clarity: 0 }]);
  });
});
