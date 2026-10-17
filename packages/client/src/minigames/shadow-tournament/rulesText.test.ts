import { describe, expect, it } from "vitest";
import { type Rules, rulesSections } from "./rulesText";

const base: Rules = {
  startLives: 3,
  maxLives: 5,
  startTokens: 2,
  maxTokens: 6,
  allStartLoser: false,
  costs: { bet: 2, shield: 1, trap: 1, swap: 2, counter: 2, extraLife: 2 },
  decks: {
    normal: [
      { label: "+1 token", qty: 5, tokens: 1, nextLives: 0, either: false },
      { label: "Rischio lieve", qty: 2, tokens: -1, nextLives: 0, either: false },
    ],
    legendary: [{ label: "Rischio forte", qty: 3, tokens: -2, nextLives: -1, either: true }],
  },
  points: { placement: [1000, 700, 500], placementMin: 100, boutWin: 50, prediction: 30 },
};
const text = (r: Rules) =>
  rulesSections(r)
    .flatMap((s) => [s.title, ...s.lines])
    .join("\n");

describe("regole di Shadow Tournament", () => {
  it("riportano costi, token e vite della configurazione", () => {
    const t = text({ ...base, startLives: 2, startTokens: 4, maxTokens: 9, costs: { bet: 3, shield: 4, trap: 6, swap: 7, counter: 8, extraLife: 5 } });
    for (const needle of ["Scommessa (3 token", "Scudo (4 token", "Trappola (6 token", "Cambia carta (7 token", "pagare 8 token", "Vita extra (5 token", "Hai 4 token", "al massimo 9", "Si parte da 2 vite"]) {
      expect(t, needle).toContain(needle);
    }
  });

  it("spiegano il triangolo, il pareggio, W/L, Bye e NPC", () => {
    const t = text(base);
    for (const needle of ["Attacco batte Raggiro", "Raggiro batte Difesa", "Difesa batte Attacco", "pareggio", "stato W", "Bye", "NPC", "pronostic"]) {
      expect(t, needle).toContain(needle);
    }
  });

  it("elencano le carte dei due mazzi con quantità ed effetti", () => {
    const t = text(base);
    expect(t).toContain("Mazzo Normale (7 carte)");
    expect(t).toContain("+1 token ×5 (+1 token)");
    expect(t).toContain("Rischio lieve ×2 (-1 token)");
    expect(t).toContain("Rischio forte ×3 (-2 token oppure -1 vita nel prossimo scontro)");
  });

  it("riportano i punti e il caso «tutti partono da L»", () => {
    const t = text({ ...base, allStartLoser: true });
    expect(t).toContain("1° 1000, 2° 700, 3° 500");
    expect(t).toContain("50 punti per ogni scontro vinto");
    expect(t).toContain("alla prima sconfitta si è eliminati");
  });
});
