import { describe, expect, it } from "vitest";
import { type Rules, duration, num, rulesSections } from "./rulesText";

const rules: Rules = {
  zoneCount: 4,
  ghostCount: 3,
  durationSec: 300,
  headStartSec: 30,
  scanCooldownSec: 8,
  accuseCooldownSec: 10,
  jailSec: 40,
  stunSec: 20,
  holdPointsPerSec: 1,
  flipPoints: 20,
  catchPoints: 100,
  wrongPenalty: 30,
  winPoints: 200,
  zoneLockSec: 30,
  ghostWeight: 1.5,
};
const text = (role: "ghost" | "hunter", r: Rules = rules) => rulesSections(role, r).flatMap((s) => [s.title, ...s.lines]).join("\n");

describe("duration", () => {
  it("scrive i tempi in parole, con singolare e plurale", () => {
    expect(duration(1)).toBe("1 secondo");
    expect(duration(45)).toBe("45 secondi");
    expect(duration(60)).toBe("1 minuto");
    expect(duration(300)).toBe("5 minuti");
    expect(duration(90)).toBe("1 minuto e 30 secondi");
  });
});

describe("rulesSections", () => {
  it("riporta i numeri di questa partita", () => {
    const t = text("hunter");
    for (const expected of ["4 zone", "3 fantasmi", "5 minuti", "30 secondi", "8 secondi", "40 secondi", "20 secondi", "10 secondi", "100 punti", "30 punti", "200 punti", "20 punti"]) {
      expect(t, expected).toContain(expected);
    }
  });

  it("cambia con i valori: niente numeri fissi nel testo", () => {
    const t = text("hunter", { ...rules, durationSec: 120, jailSec: 15, zoneCount: 6, ghostCount: 1 });
    expect(t).toContain("2 minuti");
    expect(t).toContain("15 secondi");
    expect(t).toContain("6 zone");
    expect(t).toContain("1 fantasma");
    expect(t).not.toContain("5 minuti");
    expect(t).not.toContain("40 secondi");
  });

  it("la sezione «Per te» dipende dal ruolo, le altre sono uguali", () => {
    const g = rulesSections("ghost", rules);
    const h = rulesSections("hunter", rules);
    expect(g.map((s) => s.title)).toContain("Per te, che sei un FANTASMA");
    expect(h.map((s) => s.title)).toContain("Per te, che sei un ACCHIAPPAFANTASMI");
    expect(g.filter((s) => !s.title.startsWith("Per te"))).toEqual(h.filter((s) => !s.title.startsWith("Per te")));
    expect(text("ghost")).toContain("Infesta");
    expect(text("hunter")).toContain("Purifica");
  });

  it("senza vantaggio iniziale né pausa lo dice senza frasi vuote", () => {
    const t = text("ghost", { ...rules, headStartSec: 0, scanCooldownSec: 0 });
    expect(t).toContain("Non c'è vantaggio iniziale");
    expect(t).not.toMatch(/(^|\D)0 second/); // «40 secondi» non conta
    expect(t).not.toContain("Dopo una conquista aspetta");
  });

  it("concorda singolare e plurale dei fantasmi", () => {
    expect(text("hunter", { ...rules, ghostCount: 1 })).toContain("chi è il fantasma");
    expect(text("hunter", { ...rules, ghostCount: 1 })).not.toContain("i il fantasma");
    expect(text("hunter")).toContain("chi sono i fantasmi");
  });

  it("spiega il blocco delle zone e il peso dei fantasmi con i valori della partita", () => {
    const t = text("ghost");
    expect(t).toContain("bloccata per 30 secondi");
    expect(t).toContain("resta tua per 30 secondi");
    expect(t).toContain("1,5 per i fantasmi");
    expect(text("hunter")).toContain("aspetta la fine del blocco");
    const custom = text("hunter", { ...rules, zoneLockSec: 45, ghostWeight: 1.37 });
    expect(custom).toContain("45 secondi");
    expect(custom).toContain("1,37");
  });

  it("senza blocco né peso non ne parla", () => {
    const t = text("hunter", { ...rules, zoneLockSec: 0, ghostWeight: 1 });
    expect(t).not.toContain("bloccata");
    expect(t).not.toContain("blocco");
    expect(t).not.toContain("per i fantasmi, che sono pochi");
    expect(t).toContain("per più secondi in totale");
  });

  it("num scrive i decimali all'italiana", () => {
    expect(num(1.5)).toBe("1,5");
    expect(num(2)).toBe("2");
  });

  it("spiega il segreto sullo stato delle zone", () => {
    expect(text("hunter")).toContain("segreto");
    expect(text("hunter")).toContain("di persona");
  });
});
