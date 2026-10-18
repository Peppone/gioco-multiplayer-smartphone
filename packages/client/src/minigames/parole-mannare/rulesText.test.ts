import { describe, expect, it } from "vitest";
import { rulesSections } from "./rulesText";
import type { Rules } from "./types";

const rules: Rules = { players: 9, werewolves: 2, questionSeconds: 240, yesNoPool: 36, maybePool: 12, closeTokens: 1, farTokens: 1, seerHuntSeconds: 30, voteSeconds: 60, runoffSeconds: 30 };
const all = (r: Rules, role: Parameters<typeof rulesSections>[0] = "villager", mayor = false) => rulesSections(role, mayor, r).flatMap((s) => [s.title, ...s.lines]).join("\n");

describe("regole di Parole Mannare", () => {
  it("riportano i numeri veri della partita", () => {
    const text = all(rules);
    expect(text).toContain("9 giocatori");
    expect(text).toContain("2 Lupi");
    expect(text).toContain("4 minuti");
    expect(text).toContain("riserva comune di 36");
    expect(text).toContain("12 in tutto");
    expect(text).toContain("30 secondi");
    expect(text).toContain("1 minuto");
  });

  it("si adattano a Forse illimitati o assenti e a un solo Lupo", () => {
    expect(all({ ...rules, maybePool: null })).toContain("illimitati");
    expect(all({ ...rules, maybePool: 0 })).toContain("non ci sono");
    expect(all({ ...rules, werewolves: 1 })).toContain("1 Lupo e");
  });

  it("«Per te» dipende dal ruolo e dal Sindaco, e non c'è prima della distribuzione", () => {
    expect(all(rules, "werewolf")).toContain("Sei un LUPO");
    expect(all(rules, "seer")).toContain("Sei il VEGGENTE");
    expect(all(rules, "villager")).toContain("Sei un PAESANO");
    expect(all(rules, "villager", true)).toContain("Sei il SINDACO");
    expect(rulesSections(null, false, rules).some((s) => s.title === "Per te")).toBe(false);
  });
});
