import { describe, expect, it } from "vitest";
import { fairTime } from "./fairtime.js";

const base = { receivedAt: 10_000, rtt: 100, openedAt: 9_000 };

describe("fairTime", () => {
  it("accetta un timestamp plausibile", () => {
    expect(fairTime({ ...base, claimed: 9_950 })).toBe(9_950);
  });

  it("riporta al presente un timestamp nel futuro", () => {
    expect(fairTime({ ...base, claimed: 20_000 })).toBe(10_000);
  });

  it("non concede più vantaggio di RTT + margine a chi dichiara un'ora troppo antica", () => {
    expect(fairTime({ ...base, claimed: 9_100 })).toBe(10_000 - 150);
  });

  it("non va prima dell'apertura degli input", () => {
    expect(fairTime({ ...base, rtt: 5_000, claimed: 8_000 })).toBe(9_000);
  });

  it("con RTT sconosciuto usa un limite prudente e gestisce NaN", () => {
    expect(fairTime({ ...base, rtt: null, claimed: 1 })).toBe(9_000);
    expect(fairTime({ ...base, claimed: Number.NaN })).toBe(10_000);
  });
});
