import { describe, expect, it } from "vitest";
import { rulesSections } from "./rulesText";
import type { Settings } from "./types";

const settings: Settings = { mode: "insieme", levels: 3, stepMs: 350, penaltyMs: 3000, levelSeconds: 150, keys: 1, finishPoints: [150, 100, 75, 50], distancePoints: 50, strikePenalty: 10 };
const all = (r: Settings, role: Parameters<typeof rulesSections>[0] = "pilot", layers: Parameters<typeof rulesSections>[2] = []) => rulesSections(role, r, layers).flatMap((s) => [s.title, ...s.lines]).join("\n");

describe("regole di Pilota alla cieca", () => {
  it("riportano i numeri veri della partita", () => {
    const text = all(settings);
    expect(text).toContain("3 livelli da 2 minuti e 30 secondi");
    expect(text).toContain("corrono insieme");
    expect(text).toContain("serve la chiave");
    expect(text).toContain("lo ferma 3 secondi");
    expect(text).toContain("almeno 350 millisecondi");
    expect(text).toContain("150, 100, 75, 50 punti");
    expect(text).toContain("fino a 50 punti");
    expect(text).toContain("costa 10 punti");
  });

  it("segue le impostazioni: a turno, più chiavi, nessuna chiave, nessuna penalità, un livello", () => {
    const text = all({ ...settings, mode: "a-turno", keys: 3, strikePenalty: 0, levels: 1, distancePoints: 1, penaltyMs: 1000 });
    expect(text).toContain("una alla volta");
    expect(text).toContain("tutte le 3 chiavi");
    expect(text).toContain("Mine e pattuglie non tolgono punti");
    expect(text).toContain("1 livello da");
    expect(text).toContain("fino a 1 punto,");
    expect(text).toContain("lo ferma 1 secondo");
    expect(all({ ...settings, keys: 0 })).toContain("sempre aperta");
  });

  it("«Per te» dipende dal ruolo e, per i navigatori, dagli strati", () => {
    expect(all(settings, "pilot")).toContain("Sei il PILOTA");
    const nav = all(settings, "navigator", ["mines", "doors"]);
    expect(nav).toContain("Sei un NAVIGATORE");
    expect(nav).toContain("MINE (dove sono le mine");
    expect(nav).toContain("PORTE (quando le porte sono aperte");
    expect(nav).not.toContain("CHIAVI (");
    expect(all(settings, "navigator", [])).toContain("non hai uno strato");
    expect(all(settings, "spectator")).toContain("Non corre la tua squadra");
    expect(rulesSections(null, settings).some((s) => s.title === "Per te")).toBe(false);
  });
});
