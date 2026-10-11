import { describe, expect, it } from "vitest";
import type { MinigameContext } from "@gioco/shared";
import { type StimaState, stima } from "./index.js";

const ctx: MinigameContext = {
  players: ["a", "b", "c", "d"].map((id) => ({ id, nickname: id.toUpperCase(), teamId: null })),
  teams: [],
  seed: 1,
};

const config = stima.configSchema.parse({
  questions: [
    { text: "Quanto?", answer: 100, unit: "km" },
    { text: "Con cursore", answer: 50, min: 0, max: 100 },
  ],
  timeSec: 20,
  rewards: [1000, 600, 300],
  exactBonus: 200,
});

const guess = (s: StimaState, id: string, value: number, at: number) =>
  stima.onInput(s, id, { type: "guess", value }, { receivedAt: at, claimedTime: at - 10, rtt: 20 });

const reveal = (s: StimaState) => stima.onHostCommand(s, { type: "next" }, 30_000);

describe("stima", () => {
  it("vince chi si avvicina di più; i premi scendono col piazzamento", () => {
    let s = stima.init(config, ctx, 0);
    s = guess(s, "a", 110, 1_000); // distanza 10
    s = guess(s, "b", 95, 1_000); // 5  → 1°
    s = guess(s, "c", 150, 1_000); // 50 → 3°
    s = guess(s, "d", 80, 1_000); // 20 → 2°
    s = reveal(s);
    expect(s.outcomes.map((o) => [o.playerId, o.rank, o.points])).toEqual([
      ["b", 1, 1000],
      ["a", 2, 600],
      ["d", 3, 300],
      ["c", 4, 0],
    ]);
  });

  it("a pari distanza stesso posto e stesso premio; il bonus va solo a chi indovina esatto", () => {
    let s = stima.init(config, ctx, 0);
    s = guess(s, "a", 90, 1_000); // 10
    s = guess(s, "b", 110, 1_000); // 10 (pari con a)
    s = guess(s, "c", 100, 1_000); // esatto
    s = reveal(s);
    expect(s.outcomes.find((o) => o.playerId === "c")).toMatchObject({ rank: 1, points: 1200 });
    expect(s.outcomes.filter((o) => o.rank === 2).map((o) => o.points)).toEqual([600, 600]);
  });

  it("chi non stima non prende punti; si può cambiare idea, e la stima vecchia in ritardo non vince", () => {
    let s = stima.init(config, ctx, 0);
    s = guess(s, "a", 10, 1_000);
    s = guess(s, "a", 99, 5_000);
    expect(s.guesses.a?.value).toBe(99);
    // messaggio più vecchio (claimed 2 s) che arriva dopo: ignorato
    s = stima.onInput(s, "a", { type: "guess", value: 1 }, { receivedAt: 6_000, claimedTime: 2_000, rtt: 8_000 });
    expect(s.guesses.a?.value).toBe(99);
    s = reveal(s);
    expect(s.totals.b).toBeUndefined();
    expect(s.totals.a).toBe(1000);
  });

  it("rifiuta valori fuori dai limiti (cursore), fuori tempo e non numerici", () => {
    let s = stima.init(config, ctx, 0);
    s = reveal(s);
    s = stima.onHostCommand(s, { type: "next" }, 40_000); // seconda domanda: 0..100
    s = guess(s, "a", 500, 41_000);
    expect(s.guesses.a).toBeUndefined();
    s = guess(s, "a", 50, 41_000);
    expect(s.guesses.a?.value).toBe(50);
    expect(stima.inputSchema.safeParse({ type: "guess", value: Number.NaN }).success).toBe(false);
    expect(stima.inputSchema.safeParse({ type: "guess", value: Infinity }).success).toBe(false);
    expect(stima.inputSchema.safeParse({ type: "guess", value: "12" }).success).toBe(false);
  });

  it("il tempo scaduto rivela da solo", () => {
    const s = stima.init(config, ctx, 0);
    expect(stima.onTick(s, 20_000)).toBe(s);
    expect(stima.onTick(s, 20_600).phase).toBe("reveal");
  });

  it("la configurazione verifica minimo, massimo e valore esatto", () => {
    expect(stima.configSchema.safeParse({ questions: [{ text: "x", answer: 5, min: 10, max: 0 }] }).success).toBe(false);
    expect(stima.configSchema.safeParse({ questions: [{ text: "x", answer: 500, min: 0, max: 100 }] }).success).toBe(false);
    expect(stima.configSchema.safeParse({ questions: [{ text: "x", answer: 5 }] }).success).toBe(true);
  });

  it("anti-leak: valore esatto e stime degli altri restano segreti fino alla rivelazione", () => {
    let s = stima.init(config, ctx, 0);
    s = guess(s, "a", 77, 1_000);
    const text = (v: unknown) => JSON.stringify(v);
    expect(text(stima.screenView(s))).not.toMatch(/"answer"|77|"results"/);
    expect(text(stima.viewFor(s, "b", null))).not.toMatch(/"answer"|77/);
    expect(stima.viewFor(s, "a", null)).toMatchObject({ myGuess: 77 });
    expect(text(stima.hostView(s).info)).toContain("100 km"); // la regia conosce la risposta
    const r = reveal(s);
    expect(stima.screenView(r)).toMatchObject({ reveal: { answer: 100, results: [{ nickname: "A", value: 77 }] } });
  });
});
