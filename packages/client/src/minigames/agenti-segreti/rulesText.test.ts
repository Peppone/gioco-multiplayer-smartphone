import { describe, expect, it } from "vitest";
import { rulesSections } from "./rulesText";
import type { Rules } from "./types";

const rules: Rules = { gridSize: "5x5", first: 9, second: 8, civilians: 7, assassins: 1, clueSeconds: 90, guessSeconds: 45, maxTurns: 0, allowZeroInfinity: true, win: 100, perAgent: 0 };
const all = (r: Rules, role: Parameters<typeof rulesSections>[0] = "agent") => rulesSections(role, r).flatMap((s) => [s.title, ...s.lines]).join("\n");

describe("regole di Agenti Segreti", () => {
  it("riportano i numeri veri della partita", () => {
    const text = all(rules);
    expect(text).toContain("25 parole");
    expect(text).toContain("ha 9 agenti da trovare, l'altra 8");
    expect(text).toContain("i civili sono 7 e c'è 1 assassino");
    expect(text).toContain("1 minuto e 30 secondi");
    expect(text).toContain("45 secondi per ogni voto");
    expect(text).toContain("100 punti a testa");
    expect(text).toContain("0 o ∞");
    expect(text).not.toContain("al massimo");
  });

  it("4×4, senza assassino, con limite di turni e punti per agente", () => {
    const text = all({ ...rules, gridSize: "4x4", first: 6, second: 5, civilians: 5, assassins: 0, maxTurns: 12, perAgent: 10, allowZeroInfinity: false, clueSeconds: 0 });
    expect(text).toContain("16 parole");
    expect(text).not.toContain("assassin");
    expect(text).toContain("al massimo 12 turni");
    expect(text).toContain("10 punti per ogni agente");
    expect(text).not.toContain("∞");
    expect(text).toContain("Non c'è limite di tempo per l'indizio");
  });

  it("più assassini al plurale", () => {
    expect(all({ ...rules, assassins: 3, civilians: 5 })).toContain("ci sono 3 assassini");
  });

  it("«Per te» dipende dal ruolo", () => {
    expect(all(rules, "spymaster")).toContain("Sei il CAPO-SPIA");
    expect(all(rules, "agent")).toContain("Sei un AGENTE");
    expect(rulesSections("spectator", rules).some((s) => s.title === "Per te")).toBe(false);
  });
});
