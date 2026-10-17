import { describe, expect, it } from "vitest";
import { rulesSections } from "./rulesText";

describe("regole di Shadow Tournament", () => {
  const text = (costs: Parameters<typeof rulesSections>[0], max = 5) =>
    rulesSections(costs, max)
      .flatMap((s) => [s.title, ...s.lines])
      .join("\n");

  it("riportano i costi e il massimo di token della configurazione", () => {
    const t = text({ bet: 3, shield: 4, trap: 6, swap: 7, counter: 8 }, 9);
    for (const needle of ["Scommessa (3 token", "Scudo (4 token", "Trappola (6 token", "Cambia carta (7 token", "8 token per annullare", "al massimo 9"]) {
      expect(t, needle).toContain(needle);
    }
  });

  it("spiegano il triangolo, W/L, il pareggio e l'NPC", () => {
    const t = text({ bet: 1, shield: 2, trap: 2, swap: 5, counter: 5 });
    for (const needle of ["Attacco batte Raggiro", "Raggiro batte Difesa", "Difesa batte Attacco", "pareggio", "W", "NPC", "Bye"]) {
      expect(t, needle).toContain(needle);
    }
  });
});
