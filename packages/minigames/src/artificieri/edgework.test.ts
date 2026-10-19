import { describe, expect, it } from "vitest";
import { makeRng } from "../knight-duel/rng.js";
import { type EdgeCond, type Edgework, INDICATOR_LABELS, PORT_NAMES, describeEdgeCond, edgeCondKeys, evalEdgeCond, genEdgeCond, genEdgework } from "./edgework.js";

const edge: Edgework = {
  serial: "AL5QF2",
  batteries: 2,
  indicators: [
    { label: "FRK", lit: true },
    { label: "CAR", lit: false },
  ],
  ports: ["RJ-45"],
};

describe("bordo della bomba", () => {
  it("è deterministico e ben formato per molti semi", () => {
    for (let seed = 0; seed < 2000; seed++) {
      const e = genEdgework(makeRng(seed));
      expect(e).toEqual(genEdgework(makeRng(seed)));
      expect(e.serial).toMatch(/^[A-Z2-9]{5}[2-9]$/);
      expect(e.serial).not.toMatch(/[IOQY]/);
      expect(e.batteries).toBeGreaterThanOrEqual(0);
      expect(e.batteries).toBeLessThanOrEqual(4);
      expect(e.indicators.length).toBeGreaterThanOrEqual(1);
      expect(new Set(e.indicators.map((i) => i.label)).size).toBe(e.indicators.length);
      expect(e.indicators.every((i) => (INDICATOR_LABELS as readonly string[]).includes(i.label))).toBe(true);
      expect(new Set(e.ports).size).toBe(e.ports.length);
      expect(e.ports.every((p) => (PORT_NAMES as readonly string[]).includes(p))).toBe(true);
    }
  });

  it("valuta ogni tipo di condizione", () => {
    const cases: [EdgeCond, boolean][] = [
      [{ type: "serial-odd" }, false],
      [{ type: "serial-even" }, true],
      [{ type: "serial-vowel" }, true],
      [{ type: "batteries", op: "gte", n: 2 }, true],
      [{ type: "batteries", op: "gte", n: 3 }, false],
      [{ type: "batteries", op: "lte", n: 1 }, false],
      [{ type: "batteries", op: "lte", n: 2 }, true],
      [{ type: "indicator", label: "FRK", lit: true }, true],
      [{ type: "indicator", label: "FRK", lit: false }, false],
      [{ type: "indicator", label: "CAR", lit: false }, true],
      [{ type: "indicator", label: "SND", lit: true }, false],
      [{ type: "indicator", label: "SND", lit: false }, false],
      [{ type: "port", port: "RJ-45", present: true }, true],
      [{ type: "port", port: "USB", present: true }, false],
      [{ type: "port", port: "USB", present: false }, true],
    ];
    for (const [cond, expected] of cases) expect(evalEdgeCond(cond, edge), JSON.stringify(cond)).toBe(expected);
  });

  it("il numero di serie senza vocali non soddisfa «contiene una vocale»", () => {
    expect(evalEdgeCond({ type: "serial-vowel" }, { ...edge, serial: "BC5DF3" })).toBe(false);
    expect(evalEdgeCond({ type: "serial-odd" }, { ...edge, serial: "BC5DF3" })).toBe(true);
  });

  it("le condizioni generate hanno testo e chiavi, e si possono valutare", () => {
    const rng = makeRng(7);
    for (let i = 0; i < 500; i++) {
      const c = genEdgeCond(rng);
      expect(describeEdgeCond(c)).toMatch(/^[a-zàèéìòù]/);
      expect(describeEdgeCond(c)).not.toMatch(/undefined|NaN/);
      expect(edgeCondKeys(c).length).toBeGreaterThan(0);
      expect(typeof evalEdgeCond(c, edge)).toBe("boolean");
    }
  });
});
