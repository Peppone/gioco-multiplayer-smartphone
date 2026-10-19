import { describe, expect, it } from "vitest";
import { rulesSections } from "./rulesText";
import type { Settings } from "./types";

const settings: Settings = { mode: "squadre", sectors: 5, sectorSeconds: 60, orderSeconds: 12, minOrderSeconds: 6, damagePerMiss: 5, events: true, stepPoints: 10, hullBonus: 100, podiumPoints: [150, 100, 50] };
const all = (r: Settings, inactive = false) => rulesSections(r, inactive).flatMap((s) => [s.title, ...s.lines]).join("\n");

describe("regole di Plancia di Comando", () => {
  it("riportano i numeri veri della partita", () => {
    const text = all(settings);
    expect(text).toContain("5 settori da 1 minuto");
    expect(text).toContain("Ogni squadra è l'equipaggio");
    expect(text).toContain("dura 12 secondi");
    expect(text).toContain("fino a 6 secondi");
    expect(text).toContain("danneggia lo scafo del 5%");
    expect(text).toContain("ALLARME GENERALE");
    expect(text).toContain("10 punti per ogni ordine");
    expect(text).toContain("fino a 100 in proporzione allo scafo");
    expect(text).toContain("150, 100, 50 punti");
  });

  it("segue le impostazioni: equipaggio unico, nessun evento, un settore, un solo punto", () => {
    const text = all({ ...settings, mode: "unico", events: false, sectors: 1, stepPoints: 1, orderSeconds: 90, damagePerMiss: 25 });
    expect(text).toContain("tutti nello stesso equipaggio");
    expect(text).toContain("1 settore da");
    expect(text).toContain("Niente eventi");
    expect(text).not.toContain("ALLARME");
    expect(text).toContain("1 punto per ogni ordine");
    expect(text).toContain("dura 1 minuto e 30 secondi");
    expect(text).toContain("del 25%");
    expect(text).toContain("Non c'è podio");
  });

  it("chi ha il telefono fuori uso lo legge", () => {
    expect(all(settings, true)).toContain("fuori uso");
    expect(rulesSections(settings).some((s) => s.title === "Per te")).toBe(false);
  });
});
