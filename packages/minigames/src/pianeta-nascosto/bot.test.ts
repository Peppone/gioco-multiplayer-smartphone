import { describe, expect, it } from "vitest";
import { type S, T0, host, plugin, tick } from "./test-helpers.js";
import { cfg } from "./test-helpers.js";

/** Una partita di soli robot, a passi di un secondo. */
function botGame(over: Record<string, unknown>, seed: number): { s: S; maxTickMs: number; steps: number } {
  let s = plugin.init(cfg({ bots: 3, turnSeconds: 0, theorySeconds: 0, ...over }), { players: [], teams: [], seed }, T0);
  s = host(s, { type: "start" }, T0);
  let now = T0;
  let maxTickMs = 0;
  let steps = 0;
  while (s.phase !== "done" && steps++ < 20_000) {
    now += 1000;
    const t = performance.now();
    s = tick(s, now);
    maxTickMs = Math.max(maxTickMs, performance.now() - t);
    if (["conference", "reveal", "final"].includes(s.phase)) s = host(s, { type: "next" }, now);
  }
  return { s, maxTickMs, steps };
}

describe("pianeta-nascosto: robot", () => {
  it.each([["standard", 12], ["expert", 5]] as const)("%s: i robot finiscono la partita, non sbagliano mai una teoria e localizzano solo da certi", { timeout: 300_000 }, (mode, games) => {
    let located = 0;
    for (let seed = 1; seed <= games; seed++) {
      const { s } = botGame({ mode }, seed);
      expect(s.phase, `seme ${seed}`).toBe("done");
      // Mai una teoria sbagliata (nessuna penalità) e mai una localizzazione fallita.
      expect(s.publicLog.filter((l) => l.text.includes("teoria sbagliata")), `seme ${seed}`).toEqual([]);
      expect(s.publicLog.filter((l) => l.ok === false), `seme ${seed}`).toEqual([]);
      located += s.publicLog.filter((l) => l.ok === true).length;
      // I robot non entrano mai nella classifica generale.
      expect(plugin.scores(s)).toEqual([]);
      expect(plugin.result(s).ranking).toEqual([]);
    }
    expect(located).toBeGreaterThanOrEqual(games);
  });

  it("un robot facile e uno difficile finiscono entrambi", { timeout: 120_000 }, () => {
    for (const botLevel of ["easy", "hard"]) expect(botGame({ botLevel }, 3).s.phase).toBe("done");
  });

  it("in Base il pensiero del robot sta sotto ~20 ms a passo (misura: massimo su 5 partite)", { timeout: 120_000 }, () => {
    let worst = 0;
    for (let seed = 1; seed <= 5; seed++) worst = Math.max(worst, botGame({}, seed).maxTickMs);
    console.log("pianeta-nascosto: massimo onTick con i robot (Base):", Math.round(worst), "ms");
    expect(worst).toBeLessThan(150);
  });
});
