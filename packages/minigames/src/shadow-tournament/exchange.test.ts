import { describe, expect, it } from "vitest";
import { CARDS, type Card, type Costs, type Reaction, availableReactions, beats, canCounter, outcome, resolveExchange } from "./exchange.js";

const costs: Costs = { bet: 1, shield: 2, trap: 2, swap: 5, counter: 5 };
const pass: Reaction = { action: "pass" };

const run = (cards: [Card, Card], o: { bets?: [boolean, boolean]; reactions?: [Reaction, Reaction]; counter?: 0 | 1 | null } = {}) =>
  resolveExchange({ cards, bets: o.bets ?? [false, false], reactions: o.reactions ?? [pass, pass], counter: o.counter ?? null, costs });

describe("triangolo delle carte", () => {
  it("Attacco > Raggiro > Difesa > Attacco e stessa carta = pareggio (tutte le 9 combinazioni)", () => {
    const expected: Record<string, 0 | 1 | null> = {
      "attack,attack": null, "attack,defense": 1, "attack,trick": 0,
      "defense,attack": 0, "defense,defense": null, "defense,trick": 1,
      "trick,attack": 1, "trick,defense": 0, "trick,trick": null,
    };
    for (const a of CARDS) for (const b of CARDS) expect(outcome(a, b), `${a} vs ${b}`).toBe(expected[`${a},${b}`]);
    expect(beats("attack", "trick") && beats("trick", "defense") && beats("defense", "attack")).toBe(true);
  });
});

describe("scambio", () => {
  it("chi perde lo scambio perde 1 vita; il pareggio non fa nulla", () => {
    expect(run(["attack", "trick"])).toMatchObject({ winner: 0, loss: 1, replay: false });
    expect(run(["attack", "defense"])).toMatchObject({ winner: 1, loss: 1 });
    expect(run(["trick", "trick"])).toMatchObject({ winner: null, loss: 0 });
  });

  it("la Scommessa vinta toglie una vita in più; persa o in pareggio non fa nulla", () => {
    expect(run(["attack", "trick"], { bets: [true, false] }).loss).toBe(2);
    expect(run(["attack", "trick"], { bets: [false, true] }).loss).toBe(1);
    expect(run(["attack", "attack"], { bets: [true, false] }).loss).toBe(0);
  });

  it("Scudo: chi ha perso non perde nessuna vita (nemmeno quella della Scommessa) e paga", () => {
    const r = run(["attack", "trick"], { bets: [true, false], reactions: [pass, { action: "shield" }] });
    expect(r).toMatchObject({ loss: 0, shielded: true, spent: [0, 2] });
  });

  it("Trappola: l'avversario non può usare la carta appena giocata, da chiunque sia lanciata", () => {
    expect(run(["attack", "trick"], { reactions: [{ action: "trap" }, pass] })).toMatchObject({ blocked: [null, "trick"], spent: [2, 0] });
    expect(run(["attack", "trick"], { reactions: [pass, { action: "trap" }] }).blocked).toEqual(["attack", null]);
    expect(run(["defense", "defense"], { reactions: [{ action: "trap" }, pass] }).blocked).toEqual([null, "defense"]);
  });

  it("Cambia carta: ricalcola l'esito con la nuova carta; la Trappola colpisce la carta finale", () => {
    const r = run(["attack", "defense"], { reactions: [{ action: "swap", card: "trick" }, pass] });
    // 0 aveva perso (attacco contro difesa), cambia in raggiro che batte difesa
    expect(r).toMatchObject({ cards: ["trick", "defense"], winner: 0, loss: 1, spent: [5, 0] });
    const t = run(["attack", "defense"], { reactions: [{ action: "swap", card: "trick" }, { action: "trap" }] });
    expect(t.blocked).toEqual([("trick" satisfies Card), null]);
  });

  it("la contromossa annulla il Cambia carta: scambio da rigiocare, nessuna vita persa, entrambi pagano", () => {
    const r = run(["attack", "defense"], { reactions: [{ action: "swap", card: "trick" }, pass], counter: 1 });
    expect(r).toMatchObject({ replay: true, loss: 0, winner: null, spent: [5, 5], cards: ["attack", "defense"] });
  });

  it("la Scommessa vale solo se alla fine vince chi l'ha pagata", () => {
    // 0 perde, cambia carta e vince: la scommessa di 1 (che ora ha perso) non conta
    const r = run(["attack", "defense"], { bets: [false, true], reactions: [{ action: "swap", card: "trick" }, pass] });
    expect(r).toMatchObject({ winner: 0, loss: 1 });
  });
});

describe("reazioni disponibili", () => {
  const base = { tokens: 5, bet: false, costs };
  it("Scudo solo a chi ha perso; Cambia carta a chi ha perso o pareggiato; Trappola a tutti", () => {
    expect(availableReactions({ ...base, result: "lose" })).toEqual(["shield", "swap", "trap"]);
    expect(availableReactions({ ...base, result: "draw" })).toEqual(["swap", "trap"]);
    expect(availableReactions({ ...base, result: "win" })).toEqual(["trap"]);
  });
  it("una sola azione per scambio: dopo la Scommessa non si reagisce", () => {
    expect(availableReactions({ ...base, bet: true, result: "lose" })).toEqual([]);
  });
  it("servono i token necessari", () => {
    expect(availableReactions({ ...base, tokens: 1, result: "lose" })).toEqual([]);
    expect(availableReactions({ ...base, tokens: 2, result: "lose" })).toEqual(["shield", "trap"]);
    expect(availableReactions({ ...base, tokens: 4, result: "lose" })).toEqual(["shield", "trap"]);
  });
  it("la contromossa richiede 5 token, nessuna azione già fatta e nessuna Scommessa", () => {
    expect(canCounter({ tokens: 5, bet: false, acted: false, costs })).toBe(true);
    expect(canCounter({ tokens: 4, bet: false, acted: false, costs })).toBe(false);
    expect(canCounter({ tokens: 5, bet: true, acted: false, costs })).toBe(false);
    expect(canCounter({ tokens: 5, bet: false, acted: true, costs })).toBe(false);
  });
});
