import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limiter.js";

describe("RateLimiter", () => {
  it("accetta fino al limite nella finestra e poi rifiuta", () => {
    const rl = new RateLimiter(3, 1000);
    expect([0, 100, 200, 300].map((t) => rl.allow("a", t))).toEqual([true, true, true, false]);
  });

  it("riaccetta quando gli eventi vecchi escono dalla finestra", () => {
    const rl = new RateLimiter(2, 1000);
    rl.allow("a", 0);
    rl.allow("a", 500);
    expect(rl.allow("a", 900)).toBe(false);
    expect(rl.allow("a", 1001)).toBe(true); // il primo evento è scaduto
  });

  it("le chiavi sono indipendenti e i rifiutati non allungano il blocco", () => {
    const rl = new RateLimiter(1, 1000);
    expect(rl.allow("a", 0)).toBe(true);
    expect(rl.allow("b", 0)).toBe(true);
    expect(rl.allow("a", 500)).toBe(false);
    expect(rl.allow("a", 1000)).toBe(true);
  });
});
