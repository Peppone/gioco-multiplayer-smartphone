import { describe, expect, it } from "vitest";
import { rulesSections } from "./rulesText";
import type { Rules } from "./types";

const rules: Rules = { rows: 3, cols: 3, sightSec: 8, messageMaxLength: 280, positionsPublic: true };
const text = (r = rules) => rulesSections(r).flatMap((s) => [s.title, ...s.paragraphs]).join("\n");

describe("regole di Stanze Segrete", () => {
  it("usano i valori veri della partita", () => {
    expect(text()).toContain("9 stanze (3 × 3)");
    expect(text()).toContain("8 secondi");
    expect(text()).toContain("280 caratteri");
    expect(text({ ...rules, rows: 2, cols: 4, sightSec: 3 })).toContain("8 stanze (2 × 4)");
    expect(text({ ...rules, sightSec: 3 })).toContain("3 secondi");
  });

  it("non rivelano la forma della mappa finché non è mostrata", () => {
    const t = text({ sightSec: 8, messageMaxLength: 280, positionsPublic: true });
    expect(t).not.toMatch(/d+ stanze/);
    expect(t).toContain("La mappa la mostra il Game Master");
  });

  it("dicono se le posizioni sono pubbliche", () => {
    expect(text()).toContain("mostra in quale stanza");
    expect(text({ ...rules, positionsPublic: false })).toContain("non mostra dove");
  });

  it("spiegano tutte le parti del gioco", () => {
    expect(rulesSections(rules).map((s) => s.title)).toEqual(["L'idea", "Cosa puoi fare", "Muoversi e sbirciare", "Le lettere", "Oggetti", "Messaggi", "Eventi", "Posizioni e punti"]);
  });
});
