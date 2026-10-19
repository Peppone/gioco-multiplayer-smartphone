import { describe, expect, it } from "vitest";
import { rulesSections } from "./rulesText";
import type { Settings } from "./types";

const settings: Settings = { difficulty: "media", modules: 4, seconds: 300, maxStrikes: 3, speedUpOnStrike: true, bombsPerTeam: 1, betSeconds: 15, modulePoints: 50, defusePoints: 200, timeBonus: 1, betPoints: 50 };
const all = (r: Settings, role: Parameters<typeof rulesSections>[0] = "expert") => rulesSections(role, r).flatMap((s) => [s.title, ...s.lines]).join("\n");

describe("regole di Artificieri", () => {
  it("riportano i numeri veri della partita", () => {
    const text = all(settings);
    expect(text).toContain("4 moduli");
    expect(text).toContain("timer di 5 minuti");
    expect(text).toContain("Con 3 errori la bomba esplode");
    expect(text).toContain("25% in più");
    expect(text).toContain("1 bomba a testa");
    expect(text).toContain("50 punti per ogni modulo");
    expect(text).toContain("200 punti, più 1 punto per ogni secondo");
    expect(text).toContain("Chi scommette giusto prende 50 punti");
  });

  it("segue le impostazioni: senza accelerazione, scommesse, bonus; al singolare e al plurale", () => {
    const text = all({ ...settings, speedUpOnStrike: false, betSeconds: 0, betPoints: 0, timeBonus: 0, maxStrikes: 1, bombsPerTeam: 3, seconds: 90, modulePoints: 1 }, "bettor");
    expect(text).toContain("Con 1 errore la bomba esplode.");
    expect(text).not.toContain("più veloce");
    expect(text).toContain("3 bombe a testa");
    expect(text).toContain("timer di 1 minuto e 30 secondi");
    expect(text).toContain("1 punto per ogni modulo");
    expect(text).not.toContain("per ogni secondo rimasto");
    expect(text).toContain("Le scommesse non danno punti");
    expect(text).toContain("guarda la TV e fai il tifo");
  });

  it("«Per te» dipende dal ruolo e per gli scommettitori dice il tempo", () => {
    expect(all(settings, "defuser")).toContain("Sei l'ARTIFICIERE");
    expect(all(settings, "expert")).toContain("Sei un ESPERTO");
    expect(all(settings, "bettor")).toContain("hai 15 secondi per scommettere");
    expect(rulesSections(null, settings).some((s) => s.title === "Per te")).toBe(false);
  });
});
