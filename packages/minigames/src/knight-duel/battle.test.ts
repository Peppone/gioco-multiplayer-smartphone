import { describe, expect, it } from "vitest";
import { type BattleEvent, type BattleInput, type Knight, newKnight, redactEvent, resolveBattle } from "./battle.js";
import { type Card, type EffectKind, type HandCard, cardSchema } from "./cards.js";

// ---- Costruttori di prova ----
const mk = (id: string, initiative: number, ...effects: [EffectKind, number?, number?][]): Card =>
  cardSchema.parse({
    id,
    name: id,
    initiative,
    effects: effects.map(([kind, amount = 0, turns = 2]) => ({ kind, amount, turns })),
  });

const CARDS: Record<string, Card> = Object.fromEntries(
  [
    mk("atk5", 5, ["attack", 5]),
    mk("atk5-fast", 9, ["attack", 5]),
    mk("atk20", 5, ["attack", 20]),
    mk("heavy20", 5, ["heavy", 20]),
    mk("heavy11", 3, ["heavy", 11]),
    mk("shield6", 5, ["shield", 6]),
    mk("counter5", 5, ["counter", 5]),
    mk("heal8", 5, ["heal", 8]),
    mk("poison3", 5, ["poison", 3, 2]),
    mk("steal", 5, ["steal"]),
    mk("spy", 5, ["spy"]),
    mk("sab30", 5, ["sabotage", 30]),
    mk("charge", 7, ["attack", 6], ["shield", 3]),
  ].map((c) => [c.id, c]),
);

const hand = (...ids: string[]): HandCard[] => ids.map((id, i) => ({ uid: `${id}#${i}`, cardId: id }));
const knight = (hp: number, ...ids: string[]): Knight => ({ ...newKnight(30, hand(...ids)), hp });
const uid = (k: Knight, cardId: string) => k.hand.find((c) => c.cardId === cardId)!.uid;

/** Trasforma id di carta in uid di carte distinte della mano (due «atk5» = due carte fisiche diverse). */
const toUids = (k: Knight, ids: string[]): string[] => {
  const used = new Set<string>();
  return ids.map((id) => {
    const c = k.hand.find((h) => h.cardId === id && !used.has(h.uid))!;
    used.add(c.uid);
    return c.uid;
  });
};

function battle(a: Knight, b: Knight, playA: string[], playB: string[], opts: Partial<BattleInput> = {}) {
  return resolveBattle({
    knights: [a, b],
    plays: [toUids(a, playA), toUids(b, playB)],
    cards: CARDS,
    maxPlays: 2,
    seed: 1,
    ...opts,
  });
}

const dmg = (events: BattleEvent[]) => events.filter((e): e is Extract<BattleEvent, { type: "damage" }> => e.type === "damage");

describe("attacco, scudo e cura", () => {
  it("un attacco toglie PV all'avversario", () => {
    const r = battle(knight(30, "atk5"), knight(30, "shield6"), ["atk5"], []);
    expect(r.knights[1].hp).toBe(25);
    expect(r.winner).toBeNull();
  });

  it("lo scudo blocca fino al suo valore, anche se l'attaccante è più veloce", () => {
    const r = battle(knight(30, "atk5-fast"), knight(30, "shield6"), ["atk5-fast"], ["shield6"]);
    expect(r.knights[1].hp).toBe(30); // 5 danni, scudo 6: tutto bloccato
    expect(dmg(r.events)[0]).toMatchObject({ amount: 0, blocked: 5 });
  });

  it("lo scudo assorbe solo in parte un attacco più forte", () => {
    const r = battle(knight(30, "atk20"), knight(30, "shield6"), ["atk20"], ["shield6"]);
    expect(r.knights[1].hp).toBe(16); // 20 - 6 = 14 danni
  });

  it("lo scudo vale per tutta la battaglia e si consuma", () => {
    const r = battle(knight(30, "atk5", "atk5"), knight(30, "shield6"), ["atk5", "atk5"], ["shield6"]);
    expect(r.knights[1].hp).toBe(26); // 5 + 5 = 10 danni, 6 bloccati: ne passano 4
    expect(dmg(r.events).reduce((s, e) => s + e.blocked, 0)).toBe(6); // lo scudo si consuma: blocca 6 in tutto
  });

  it("la cura è limitata ai PV massimi e arriva prima degli attacchi", () => {
    const r = battle(knight(30, "atk5"), knight(28, "heal8"), ["atk5"], ["heal8"]);
    expect(r.events.find((e) => e.type === "heal")).toMatchObject({ amount: 2 }); // 28 → 30, non oltre
    expect(r.knights[1].hp).toBe(25);
  });

  it("una carta con più effetti li applica tutti (attacco + scudo)", () => {
    const r = battle(knight(30, "charge"), knight(30, "atk5"), ["charge"], ["atk5"]);
    expect(r.knights[1].hp).toBe(24); // il suo attacco 6 colpisce l'avversario
    expect(r.knights[0].hp).toBe(28); // lo scudo 3 (fase difesa) riduce l'attacco 5 a 2 danni
  });
});

describe("iniziativa e colpo pesante", () => {
  it("chi ha più iniziativa colpisce prima: se mette KO, l'altro non agisce", () => {
    const r = battle(knight(5, "atk5-fast"), knight(5, "atk5"), ["atk5-fast"], ["atk5"]);
    // Il lato 0 ha iniziativa 9 contro 5: colpisce per primo, mette KO e il lato 1 non agisce mai.
    expect(r.winner).toBe(0);
    expect(r.knights[0].hp).toBe(5);
    expect(dmg(r.events)).toHaveLength(1);
  });

  it("il colpo pesante si risolve per ultimo: un attacco normale lo anticipa", () => {
    // Entrambi a 20 PV: A colpo pesante 20, B attacco 20. B colpisce prima (fase attacchi) → A KO, il pesante non parte.
    const r = battle(knight(20, "heavy20"), knight(20, "atk20"), ["heavy20"], ["atk20"]);
    expect(r.winner).toBe(1);
    expect(r.knights[1].hp).toBe(20);
    expect(dmg(r.events)).toHaveLength(1);
  });

  it("a pari iniziativa il seme decide, in modo equo tra i due lati", () => {
    let aFirst = 0;
    const N = 400;
    for (let seed = 0; seed < N; seed++) {
      const r = battle(knight(5, "atk5"), knight(5, "atk5"), ["atk5"], ["atk5"], { seed });
      if (r.winner === 0) aFirst++;
    }
    expect(aFirst / N).toBeGreaterThan(0.4);
    expect(aFirst / N).toBeLessThan(0.6);
  });

  it("stesso seme = stesso risultato; i dati in ingresso non vengono modificati", () => {
    const a = knight(30, "atk5", "steal");
    const b = knight(30, "shield6", "heal8");
    const snapshot = JSON.stringify([a, b]);
    const r1 = battle(a, b, ["atk5", "steal"], ["shield6"], { seed: 77 });
    const r2 = battle(a, b, ["atk5", "steal"], ["shield6"], { seed: 77 });
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    expect(JSON.stringify([a, b])).toBe(snapshot);
  });
});

describe("contrattacco", () => {
  it("scatta quando vieni attaccato e ignora gli scudi dell'attaccante", () => {
    const r = battle(knight(30, "atk5", "shield6"), knight(30, "counter5"), ["atk5", "shield6"], ["counter5"]);
    expect(r.knights[1].hp).toBe(25); // subisce l'attacco
    expect(r.knights[0].hp).toBe(25); // contrattacco 5, scudo ignorato
  });

  it("scatta una sola volta per carta, anche con più attacchi", () => {
    const r = battle(knight(30, "atk5", "atk5"), knight(30, "counter5"), ["atk5", "atk5"], ["counter5"]);
    expect(r.knights[0].hp).toBe(25); // un solo contrattacco
    expect(r.knights[1].hp).toBe(20);
  });

  it("non scatta se l'attacco mette KO", () => {
    const r = battle(knight(30, "atk20"), knight(5, "counter5"), ["atk20"], ["counter5"]);
    expect(r.winner).toBe(0);
    expect(r.knights[0].hp).toBe(30);
  });
});

describe("veleno", () => {
  it("si applica in questa battaglia e infligge danni nelle successive, ignorando gli scudi", () => {
    let a = knight(30, "poison3");
    let b = knight(30, "shield6");
    let r = battle(a, b, ["poison3"], []);
    expect(r.knights[1].hp).toBe(30); // nessun danno subito
    expect(r.knights[1].poison).toEqual([{ damage: 3, turns: 2 }]);

    b = { ...r.knights[1], hand: hand("shield6") };
    a = r.knights[0];
    r = battle(a, b, [], ["shield6"]); // battaglia 2: veleno + scudo (non lo ferma)
    expect(r.knights[1].hp).toBe(27);
    r = battle(r.knights[0], { ...r.knights[1], hand: hand("shield6") }, [], ["shield6"]); // battaglia 3: ultimo tick
    expect(r.knights[1].hp).toBe(24);
    r = battle(r.knights[0], { ...r.knights[1], hand: hand("shield6") }, [], ["shield6"]); // battaglia 4: finito
    expect(r.knights[1].hp).toBe(24);
    expect(r.knights[1].poison).toEqual([]);
  });

  it("i veleni si sommano e possono mettere KO a inizio battaglia (le carte non vengono giocate)", () => {
    const b: Knight = { ...knight(5, "shield6"), poison: [{ damage: 3, turns: 2 }, { damage: 3, turns: 1 }] };
    const r = battle(knight(30, "atk5"), b, ["atk5"], ["shield6"]);
    expect(r.winner).toBe(0);
    expect(r.knights[1].hp).toBe(0);
    expect(r.played[0]).toEqual([]);
    expect(r.knights[0].hand).toHaveLength(1); // la carta non giocata resta in mano
  });

  it("doppio KO per veleno: sopravvive chi ha più PV, con 1 PV", () => {
    const a: Knight = { ...knight(4), poison: [{ damage: 5, turns: 1 }] }; // 4 - 5 = -1
    const b: Knight = { ...knight(3), poison: [{ damage: 5, turns: 1 }] }; // 3 - 5 = -2
    const r = resolveBattle({ knights: [a, b], plays: [[], []], cards: CARDS, maxPlays: 2, seed: 1 });
    expect(r.winner).toBe(0);
    expect(r.knights[0].hp).toBe(1);
    expect(r.knights[1].hp).toBe(0);
  });
});

describe("furto, spia e sabotaggio", () => {
  it("il furto sposta una carta casuale dalla mano rimasta dell'avversario", () => {
    const b = knight(30, "atk5", "heal8", "shield6");
    const r = battle(knight(30, "steal"), b, ["steal"], ["atk5"]);
    const stolen = r.events.find((e) => e.type === "steal");
    expect(stolen).toMatchObject({ side: 0 });
    expect(r.knights[0].hand).toHaveLength(1);
    expect(r.knights[1].hand).toHaveLength(1); // 3 - 1 giocata - 1 rubata
    // non può essere la carta appena giocata
    expect((stolen as { cardId: string }).cardId).not.toBe("atk5");
    expect(["heal8", "shield6"]).toContain(r.knights[0].hand[0]!.cardId);
  });

  it("il furto a mano vuota non fa nulla", () => {
    const r = battle(knight(30, "steal"), knight(30, "atk5"), ["steal"], ["atk5"]);
    expect(r.events.find((e) => e.type === "steal")).toMatchObject({ uid: null, cardId: null });
    expect(r.knights[0].hand).toHaveLength(0);
  });

  it("la spia svela una carta avversaria senza toglierla", () => {
    const r = battle(knight(30, "spy"), knight(30, "heal8", "shield6"), ["spy"], []);
    expect(r.spied[0]).not.toBeNull();
    expect(r.spied[1]).toBeNull();
    expect(r.knights[1].hand).toHaveLength(2);
  });

  it("la spia a mano vuota non svela nulla", () => {
    const r = battle(knight(30, "spy"), knight(30), ["spy"], []);
    expect(r.spied[0]).toBeNull();
  });

  it("il sabotaggio si somma per l'avversario, con tetto a 100%", () => {
    const r = battle(knight(30, "sab30", "sab30"), knight(30), ["sab30", "sab30"], []);
    expect(r.sabotage).toEqual([0, 60]);
    const four = battle(knight(30, "sab30", "sab30", "sab30", "sab30"), knight(30), ["sab30", "sab30", "sab30", "sab30"], [], { maxPlays: 4 });
    expect(four.sabotage[1]).toBe(100); // 4 × 30% = 120%, limitato a 100
  });
});

describe("giocate valide", () => {
  it("ignora carte non in mano, doppioni e oltre il massimo; le giocate escono dalla mano", () => {
    const a = knight(30, "atk5", "atk5-fast", "shield6");
    const ids = [uid(a, "atk5"), "inesistente#9", uid(a, "atk5"), uid(a, "atk5-fast"), uid(a, "shield6")];
    const r = resolveBattle({ knights: [a, knight(30)], plays: [ids, []], cards: CARDS, maxPlays: 2, seed: 1 });
    expect(r.played[0].map((c) => c.cardId)).toEqual(["atk5", "atk5-fast"]);
    expect(r.knights[0].hand.map((c) => c.cardId)).toEqual(["shield6"]);
  });

  it("il giocatore non può usare carte dell'avversario", () => {
    const a = knight(30, "atk5");
    const b = knight(30, "atk20");
    const r = resolveBattle({ knights: [a, b], plays: [[uid(b, "atk20")], []], cards: CARDS, maxPlays: 2, seed: 1 });
    expect(r.played[0]).toEqual([]);
    expect(r.knights[1].hp).toBe(30);
  });

  it("senza carte giocate non succede nulla", () => {
    const r = resolveBattle({ knights: [knight(30, "atk5"), knight(30, "atk5")], plays: [[], []], cards: CARDS, maxPlays: 2, seed: 1 });
    expect(r.events).toEqual([]);
    expect(r.winner).toBeNull();
  });
});

describe("informazioni private negli eventi", () => {
  it("furto e spia nascondono la carta allo schermo; la vede chi l'ha presa o spiata", () => {
    const steal: BattleEvent = { type: "steal", side: 0, uid: "x#1", cardId: "x" };
    const spy: BattleEvent = { type: "spy", side: 0, uid: "y#1", cardId: "y" };
    expect(redactEvent(steal, "screen")).toMatchObject({ uid: null, cardId: null });
    expect(redactEvent(steal, 0)).toMatchObject({ cardId: "x" });
    expect(redactEvent(steal, 1)).toMatchObject({ cardId: "x" }); // chi l'ha persa sa quale
    expect(redactEvent(spy, "screen")).toMatchObject({ cardId: null });
    expect(redactEvent(spy, 1)).toMatchObject({ cardId: null }); // l'avversario non sa quale è stata svelata
    expect(redactEvent(spy, 0)).toMatchObject({ cardId: "y" });
  });
});
