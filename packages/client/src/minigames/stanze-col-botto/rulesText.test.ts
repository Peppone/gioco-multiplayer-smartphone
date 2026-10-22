import { describe, expect, it } from "vitest";
import { rulesSections } from "./rulesText";
import type { Card, Rules } from "./types";

const rules: Rules = {
  players: 12,
  rounds: [{ seconds: 180, hostages: 2 }, { seconds: 120, hostages: 1 }, { seconds: 60, hostages: 1 }],
  colorAllowed: true,
  shareMethod: "app",
  startAfterFirstSeconds: 5,
  startAfterExchangeSeconds: 15,
};
const all = (r: Rules, card: Card | null = null) => rulesSections(card, r).flatMap((s) => [s.title, ...s.lines]).join("\n");

describe("regole di Stanze col botto", () => {
  it("riportano i numeri veri della partita", () => {
    const text = all(rules);
    expect(text).toContain("12 giocatori");
    expect(text).toContain("Round 1: 3 minuti, 2 ostaggi");
    expect(text).toContain("Round 2: 2 minuti, 1 ostaggio");
    expect(text).toContain("Round 3: 1 minuto, 1 ostaggio");
    expect(text).toContain("5 secondi dopo il primo");
    expect(text).toContain("15 secondi dopo lo scambio");
  });

  it("dicono se il colore si può mostrare", () => {
    expect(all(rules)).toContain("solo il colore");
    expect(all({ ...rules, colorAllowed: false })).toContain("solo la carta intera");
  });

  it("spiegano come si scambia: dall'app, di persona con i QR o in entrambi i modi", () => {
    expect(all(rules)).toContain("tocca un nome");
    expect(all(rules)).not.toContain("Scambia di persona");
    expect(all({ ...rules, shareMethod: "qr" })).toContain("solo di persona");
    expect(all({ ...rules, shareMethod: "qr" })).not.toContain("tocca un nome");
    expect(all({ ...rules, shareMethod: "both" })).toContain("anche di persona");
  });

  it("«Per te» dipende dalla carta e non c'è prima della distribuzione", () => {
    expect(all(rules, { team: "blue", character: "president" })).toContain("Sei il PRESIDENTE");
    expect(all(rules, { team: "red", character: "bomber" })).toContain("Sei il BOMBAROLO");
    expect(all(rules, { team: "blue", character: "blue-member" })).toContain("squadra BLU");
    expect(all(rules, { team: "red", character: "red-member" })).toContain("squadra ROSSA");
    expect(all(rules, { team: "grey", character: "gambler" })).toContain("GIOCATORE D'AZZARDO");
    expect(rulesSections(null, rules).some((s) => s.title === "Per te")).toBe(false);
  });
});
