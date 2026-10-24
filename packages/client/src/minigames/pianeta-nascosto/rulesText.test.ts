import { describe, expect, it } from "vitest";
import { rulesSections } from "./rulesText";
import type { Settings } from "./types";

const base: Settings = { mode: "standard", sectors: 12, turnMode: "sequential", decision: "vote", maxDays: 0, turnSeconds: 90, theorySeconds: 60, assist: false, tokens: { asteroid: 4, comet: 2, gas: 2, dwarf: 1 }, theoriesPerPhase: 1, targets: 2, pointScale: 10 };
const all = (r: Settings) => rulesSections(r).flatMap((s) => [s.title, ...s.lines]).join("\n");

describe("regole del Pianeta Nascosto", () => {
  it("Base: numeri veri della partita", () => {
    const text = all(base);
    expect(text).toContain("12 settori");
    expect(text).toContain("(6)");
    expect(text).toContain("4 asteroidi, 2 comete, 2 nubi di gas, 1 pianeta nano (9 in tutto)");
    expect(text).toContain("fino a 1 teoria");
    expect(text).toContain("pianeta nano 4");
    expect(text).toContain("2 gettoni");
    expect(text).toContain("1 minuto e 30 secondi");
    expect(text).toContain("Non c'è un limite di giorni");
    expect(text).toContain("moltiplicano per 10");
    expect(text).not.toContain("2 per 7–9");
    expect(text).not.toContain("X1 e X2");
  });

  it("Esperto: più settori, gettoni, conferenze e il pianeta nano vale meno", () => {
    const text = all({ ...base, mode: "expert", sectors: 18, tokens: { asteroid: 4, comet: 2, gas: 2, dwarf: 4 }, theoriesPerPhase: 2 });
    expect(text).toContain("18 settori");
    expect(text).toContain("(9)");
    expect(text).toContain("4 pianeti nani (12 in tutto)");
    expect(text).toContain("fino a 2 teorie");
    expect(text).toContain("pianeta nano 2");
    expect(text).toContain("2 per 7–9");
    expect(text).toContain("X1 e X2");
  });

  it("segue le impostazioni: turni insieme, capitano, giorni massimi, aiuto, senza limite di tempo", () => {
    const text = all({ ...base, turnMode: "simultaneous", decision: "captain", maxDays: 40, assist: true, turnSeconds: 0, pointScale: 5 });
    expect(text).toContain("Agiscono insieme");
    expect(text).toContain("ognuno propone e decide il capitano");
    expect(text).toContain("Dopo 40 giorni");
    expect(text).toContain("ipotesi finale");
    expect(text).toContain("segna da solo");
    expect(text).toContain("non c'è un limite di tempo");
    expect(text).toContain("moltiplicano per 5");
  });
});
