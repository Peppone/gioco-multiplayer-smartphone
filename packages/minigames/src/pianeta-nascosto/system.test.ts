import { describe, expect, it } from "vitest";
import { clueHolds, clueLabel, clueText } from "./clues.js";
import { BLOCKS_BY_LEVEL, DIFFICULTIES, factsFor, generateFacts, generateSystem, xCandidates } from "./system.js";
import { placementErrors } from "./sky.js";

describe("pianeta-nascosto: sistema, indizi, deducibilità", () => {
    it.each(["standard", "expert"] as const)("%s: indizi veri, un solo Pianeta X, nessuna conferenza da sola", { timeout: 60_000 }, (mode) => {
    for (let seed = 1; seed <= 30; seed++) {
      const sys = generateSystem(mode, seed);
      expect(placementErrors(sys.sky)).toEqual([]);
      expect(sys.topics).toHaveLength(6);
      expect(sys.conferences).toHaveLength(mode === "expert" ? 2 : 1);
      const clues = [...sys.topics.map((t) => t.clue), ...sys.conferences.map((c) => c.clue)];
      for (const c of clues) expect(clueHolds(c, sys.sky), clueText(c)).toBe(true);
      expect(xCandidates(sys.sky, clues)).toEqual([sys.sky.indexOf("planetX") + 1]);
      for (const c of sys.conferences) expect(xCandidates(sys.sky, [c.clue]).length).toBeGreaterThan(1);
      expect(new Set(sys.topics.map((t) => clueLabel(t.clue).slice().sort().join())).size).toBe(6);
      if (seed <= 3) expect(generateSystem(mode, seed)).toEqual(sys);
    }
  });

  it("un sistema deducibile si trova per ogni seme (compreso il 9014, che con la sola estrazione stretta non ne dava)", { timeout: 120_000 }, () => {
    for (let seed = 9000; seed < 9060; seed++) expect(() => generateSystem("standard", seed), `seme ${seed}`).not.toThrow();
  });

  it("fatti iniziali veri, non banali e diversi tra osservatori; 12/8/4/0 per livello e livelli annidati", () => {
    for (const mode of ["standard", "expert"] as const) {
      const sys = generateSystem(mode, 7);
      const series = generateFacts(sys.sky, mode, 7, 4);
      const seen = new Set<string>();
      for (const s of series) {
        expect(s).toHaveLength(3);
        expect(new Set(s.flat().map((f) => `${f.sector}:${f.absent}`)).size).toBe(12);
        for (const f of s.flat()) {
          expect(sys.sky[f.sector - 1]).not.toBe(f.absent);
          seen.add(`${f.sector}:${f.absent}`);
        }
        expect(DIFFICULTIES.map((d) => factsFor(s, d).length)).toEqual([12, 8, 4, 0]);
        expect(factsFor(s, "beginner")).toEqual(factsFor(s, "youth").slice(0, 8));
      }
      // i fatti possibili sono ~32 in Base: oltre, osservatori diversi possono avere un fatto in comune
      expect(seen.size).toBeGreaterThanOrEqual(30);
      expect(BLOCKS_BY_LEVEL.genius).toBe(0);
    }
  });

  it("testi italiani di esempio", () => {
    expect(clueText({ kind: "someAdjacent", a: "comet", b: "comet" })).toBe("Almeno una cometa è adiacente a un'altra cometa");
    expect(clueText({ kind: "allWithin", a: "asteroid", b: "empty", n: 3 })).toBe("Ogni asteroide è entro 3 settori da un settore vuoto");
    expect(clueText({ kind: "band", a: "dwarf", n: 7 })).toBe("Tutti i pianeti nani stanno in una fascia di 7 settori o meno");
    expect(clueText({ kind: "xNotOpposite", b: "gas" })).toBe("Il Pianeta X non è direttamente opposto a una nube di gas");
  });
});
