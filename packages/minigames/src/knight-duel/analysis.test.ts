import { describe, expect, it } from "vitest";
import { analyzeDeck } from "./analysis.js";
import { DEFAULT_DECK, type Deck, cardSchema } from "./cards.js";

describe("analisi del mazzo", () => {
  it("il mazzo base è equilibrato: nessun avviso", () => {
    const a = analyzeDeck(DEFAULT_DECK, { duels: 1500 });
    expect(a.warnings).toEqual([]);
    expect(a.cards).toHaveLength(15);
    expect(a.cards.every((c) => c.flag === "ok")).toBe(true);
    expect(a.side0WinRate).toBeGreaterThan(0.45);
    expect(a.side0WinRate).toBeLessThan(0.55);
    expect(a.koRate).toBeGreaterThan(0.6);
  });

  it("una carta esagerata viene segnalata come troppo forte", () => {
    const mega = cardSchema.parse({ id: "mega", name: "Mega colpo", initiative: 20, copies: 3, effects: [{ kind: "attack", amount: 40 }] });
    const deck: Deck = { cards: [...DEFAULT_DECK.cards, mega] };
    const a = analyzeDeck(deck, { duels: 1500 });
    const stat = a.cards.find((c) => c.id === "mega")!;
    expect(stat.flag).toBe("forte");
    expect(a.warnings.some((w) => w.includes("Mega colpo") && w.includes("troppo forte"))).toBe(true);
  });

  it("una carta inutile viene segnalata come troppo debole", () => {
    const dud = cardSchema.parse({ id: "dud", name: "Pennacchio", initiative: 0, copies: 4, effects: [{ kind: "shield", amount: 1 }] });
    const a = analyzeDeck({ cards: [...DEFAULT_DECK.cards, dud] }, { duels: 1500 });
    expect(a.cards.find((c) => c.id === "dud")!.winRate).toBeLessThan(0.5);
  });

  it("è deterministico: stesso mazzo e opzioni, stessi risultati", () => {
    expect(analyzeDeck(DEFAULT_DECK, { duels: 300 })).toEqual(analyzeDeck(DEFAULT_DECK, { duels: 300 }));
  });

  it("con molti PV i duelli si allungano e viene suggerito di ridurli", () => {
    const a = analyzeDeck(DEFAULT_DECK, { duels: 800, hp: 80 });
    expect(a.koRate).toBeLessThan(0.6);
    expect(a.warnings.some((w) => w.includes("PV"))).toBe(true);
  });
});
