import { describe, expect, it } from "vitest";
import { applyEvent, initialHp, narrate, stepEvents } from "./narration";
import type { BattleEventV, CardV } from "./types";

const events: BattleEventV[] = [
  { type: "play", side: 0, uid: "a#1", cardId: "fendente" },
  { type: "play", side: 1, uid: "b#1", cardId: "pozione" },
  { type: "heal", side: 1, amount: 4 },
  { type: "damage", source: 0, target: 1, kind: "attack", amount: 5, blocked: 1 },
  { type: "poison-tick", side: 0, damage: 2 },
];
const max: [number, number] = [20, 20];

describe("replay della battaglia", () => {
  it("risalendo dai PV finali si ricostruiscono quelli iniziali, e riapplicando gli eventi si torna ai finali", () => {
    // Lato 0: 20 PV, -2 di veleno → 18. Lato 1: 16 PV, +4 di cura → 20, poi -5 di danno → 15.
    const final: [number, number] = [18, 15];
    const start = initialHp(final, max, events);
    expect(start).toEqual([20, 16]);
    const replayed = events.reduce((hp, e) => applyEvent(hp, e, max), start);
    expect(replayed).toEqual(final);
  });

  it("i PV non superano il massimo né scendono sotto zero", () => {
    expect(applyEvent([19, 5], { type: "heal", side: 0, amount: 4 }, max)).toEqual([20, 5]);
    expect(applyEvent([19, 3], { type: "damage", source: 0, target: 1, kind: "heavy", amount: 8, blocked: 0 }, max)).toEqual([19, 0]);
    expect(initialHp([0, 10], max, [{ type: "damage", source: 1, target: 0, kind: "attack", amount: 50, blocked: 0 }])[0]).toBe(20); // tetto ai PV massimi
  });

  it("le carte giocate compaiono subito: nei passi restano solo gli eventi da raccontare", () => {
    expect(stepEvents(events).map((e) => e.type)).toEqual(["heal", "damage", "poison-tick"]);
  });
});

describe("cronaca in italiano", () => {
  const names: [string, string] = ["Rossi", "Blu"];
  const cards: Record<string, CardV> = { ascia: { id: "ascia", name: "Ascia", icon: "axe", rarity: "rare", initiative: 4, text: "" } };

  it("racconta danni, scudi bloccati, contrattacchi e KO", () => {
    expect(narrate({ type: "damage", source: 0, target: 1, kind: "attack", amount: 5, blocked: 3 }, names, cards)).toBe("Rossi colpisce Blu: -5 (3 bloccati)");
    expect(narrate({ type: "damage", source: 1, target: 0, kind: "counter", amount: 4, blocked: 0 }, names, cards)).toBe("Contrattacco di Blu! -4");
    expect(narrate({ type: "damage", source: 0, target: 1, kind: "heavy", amount: 8, blocked: 0 }, names, cards)).toContain("Colpo pesante");
    expect(narrate({ type: "ko", side: 1 }, names, cards)).toBe("Blu è KO!");
  });

  it("furto e spia nominano la carta solo se l'evento la rivela (vista redatta: altrimenti generica)", () => {
    expect(narrate({ type: "steal", side: 0, uid: "x#1", cardId: "ascia" }, names, cards)).toBe("Rossi ruba «Ascia»!");
    expect(narrate({ type: "steal", side: 0, uid: "x#1", cardId: null }, names, cards)).toBe("Rossi ruba una carta!");
    expect(narrate({ type: "steal", side: 0, uid: null, cardId: null }, names, cards)).toContain("la mano è vuota");
    expect(narrate({ type: "spy", side: 0, uid: "x#1", cardId: null }, names, cards)).toBe("Rossi spia la mano avversaria");
  });

  it("la rivelazione delle carte non è un evento da raccontare", () => {
    expect(narrate({ type: "play", side: 0, uid: "a", cardId: "b" }, names, cards)).toBeNull();
  });
});
