import { describe, expect, it } from "vitest";
import { makeRng } from "../knight-duel/rng.js";
import { DEFAULT_LEGENDARY_DECK, DEFAULT_NORMAL_DECK } from "./config.js";
import { averageTokens, canPayTokens, drawCard, effectOf } from "./rewards.js";

describe("ricompense", () => {
  it("su 10 000 pescate le frequenze sono vicine alle quantità del mazzo", () => {
    for (const deck of [DEFAULT_NORMAL_DECK, DEFAULT_LEGENDARY_DECK]) {
      const rng = makeRng(7);
      const count = new Map<string, number>();
      const n = 10_000;
      for (let i = 0; i < n; i++) {
        const c = drawCard(deck, rng);
        count.set(c.label, (count.get(c.label) ?? 0) + 1);
      }
      const total = deck.reduce((s, c) => s + c.qty, 0);
      for (const c of deck) expect((count.get(c.label) ?? 0) / n, c.label).toBeCloseTo(c.qty / total, 1);
    }
  });

  it("i mazzi predefiniti rendono come da piano (Normale ≈ +0,73, Leggendario ≈ +1,1 token con «Rischio forte» pagato in token)", () => {
    expect(averageTokens(DEFAULT_NORMAL_DECK)).toBeCloseTo(0.73, 1);
    expect(averageTokens(DEFAULT_LEGENDARY_DECK)).toBeGreaterThan(averageTokens(DEFAULT_NORMAL_DECK));
  });

  it("«Rischio forte»: a scelta fra −2 token e una vita in meno; con meno di 2 token solo la vita", () => {
    const risk = DEFAULT_LEGENDARY_DECK.find((c) => c.label === "Rischio forte")!;
    expect(effectOf(risk, "tokens", 3)).toEqual({ tokens: -2, nextLives: 0 });
    expect(effectOf(risk, "life", 3)).toEqual({ tokens: 0, nextLives: -1 });
    expect(canPayTokens(risk, 1)).toBe(false);
    expect(effectOf(risk, "tokens", 1)).toEqual({ tokens: 0, nextLives: -1 });
  });

  it("una carta non «a scelta» applica tutti i suoi effetti", () => {
    const risky = DEFAULT_LEGENDARY_DECK.find((c) => c.label === "Vantaggio rischioso")!;
    expect(effectOf(risky, "life", 0)).toEqual({ tokens: 2, nextLives: -1 });
  });
});
