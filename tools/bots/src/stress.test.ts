import { describe, expect, it } from "vitest";
import { runStress } from "./run.js";

// Test di carico: 30 giocatori simulati, con latenza e orologi sfasati, giocano una partita classica
// (un round per ogni minigioco) e un duello su un server vero. Dura più di un minuto: `pnpm test:stress`.
describe("stress test con 30 giocatori", () => {
  it("regge una serata completa senza errori, con aggiornamenti rapidi e punteggi coerenti", async () => {
    const report = await runStress({ players: 30, scenario: "all", latencyMs: [50, 300], thinkMs: [200, 2000], seed: 7 });
    const failed = report.checks.filter((c) => !c.ok).map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ""}`);
    expect(failed, `controlli falliti:\n${failed.join("\n")}`).toEqual([]);
    expect(report.matches).toHaveLength(2);
    expect(report.fanoutMs.p95).toBeLessThan(1_500);
  }, 280_000);
});
