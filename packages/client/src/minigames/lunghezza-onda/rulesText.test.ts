import { describe, expect, it } from "vitest";
import { rulesSections } from "./rulesText";
import type { Rules } from "./types";

const rules: Rules = { mode: "tutti", turns: 6, targetScore: 10, zoneWidth: 5, unitPoints: 25, counterPoints: 1, catchUp: true, clueSeconds: 60, guessSeconds: 45, counterSeconds: 20 };
const all = (r: Rules, role: Parameters<typeof rulesSections>[0] = "guesser") => rulesSections(role, r).flatMap((s) => [s.title, ...s.lines]).join("\n");

describe("regole di Lunghezza d'Onda", () => {
  it("tutti contro tutti: riportano i numeri veri della partita", () => {
    const text = all(rules);
    expect(text).toContain("45 secondi per indovinare");
    expect(text).toContain("1 minuto per l'indizio");
    expect(text).toContain("100 punti al centro");
    expect(text).toContain("75 e 50");
    expect(text).toContain("6 turni");
    expect(text).not.toContain("scommett");
  });

  it("a squadre: punteggio da raggiungere, scommessa e recupero", () => {
    const text = all({ ...rules, mode: "squadre", targetScore: 12, counterPoints: 2 });
    expect(text).toContain("arriva a 12 punti");
    expect(text).toContain("prende 2 punti");
    expect(text).toContain("Recupero");
    expect(all({ ...rules, mode: "squadre", catchUp: false })).not.toContain("Recupero");
  });

  it("senza limite per l'indizio non si parla di turni saltati", () => {
    expect(all({ ...rules, clueSeconds: 0 })).not.toContain("salta");
  });

  it("«Per te» dipende dal ruolo nel turno", () => {
    expect(all(rules, "psychic")).toContain("Sei il SENSITIVO");
    expect(all({ ...rules, mode: "squadre" }, "counter")).toContain("scommetti con i tuoi compagni");
    expect(rulesSections("spectator", rules).some((s) => s.title === "Per te")).toBe(false);
  });
});
