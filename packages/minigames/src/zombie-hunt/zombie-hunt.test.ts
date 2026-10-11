import { describe, expect, it } from "vitest";
import type { MinigameContext } from "@gioco/shared";
import { type Card, type ZombieHuntState, autoRounds, autoShotguns, autoVaccines, legalCards, zombieHunt as z } from "./index.js";

const META = (t: number) => ({ receivedAt: t, claimedTime: t, rtt: 20 });
const ids = ["a", "b", "c", "d", "e", "f"];
const ctx: MinigameContext = {
  players: ids.map((id) => ({ id, nickname: id.toUpperCase(), teamId: null })),
  teams: [],
  seed: 7,
};
const config = z.configSchema.parse({ ...z.sampleConfig, rounds: 3, zombieCount: 2, vaccineCount: 1 });

/** Carta: seme (0 ♠, 1 ♥, 2 ♦, 3 ♣) e valore. */
const C = (suit: number, value: number): Card => ({ suit, value });
const play = (c: Card) => ({ type: "play" as const, suit: c.suit, value: c.value });
const DEFAULT_HAND = [C(0, 5), C(0, 6), C(0, 7)];

/** Stato con ruoli, mani, coppie e seme del turno (♠ se non indicato) decisi dal test. */
function setup(roles: Record<string, "human" | "zombie">, hands: Record<string, Card[]> = {}, pairs: [string, string][] = [["a", "b"]], extra: Partial<ZombieHuntState> = {}) {
  const s = z.init(config, ctx, 1_000);
  const heroes = { ...s.heroes };
  for (const id of ids) heroes[id] = { role: "human", cards: [...DEFAULT_HAND], shotgun: true, vaccine: false };
  for (const [id, role] of Object.entries(roles)) heroes[id] = { ...heroes[id]!, role };
  for (const [id, cards] of Object.entries(hands)) heroes[id] = { ...heroes[id]!, cards };
  return { ...s, heroes, pairs, bye: null, choices: {}, suits: [0, 1, 2, 3, 0, 1, 2, 3], ...extra };
}

describe("Zombie Hunt: preparazione", () => {
  it("assegna il numero richiesto di zombie, di vaccini (solo umani) e le carte con seme", () => {
    const s = z.init(config, ctx, 0);
    const heroes = Object.values(s.heroes);
    expect(heroes.filter((h) => h.role === "zombie")).toHaveLength(2);
    expect(heroes.filter((h) => h.vaccine)).toHaveLength(1);
    expect(heroes.filter((h) => h.vaccine && h.role === "zombie")).toHaveLength(0);
    for (const h of heroes) {
      expect(h.cards).toHaveLength(config.cardsPerPlayer);
      for (const c of h.cards) {
        expect(c.suit).toBeGreaterThanOrEqual(0);
        expect(c.suit).toBeLessThan(4);
        expect(c.value).toBeGreaterThanOrEqual(1);
        expect(c.value).toBeLessThanOrEqual(config.maxCard);
      }
    }
  });

  it("i fucili sono pochi, solo agli umani, e ne esistono tanti quanti previsti (auto: circa uno ogni 3 giocatori)", () => {
    expect(autoShotguns(2)).toBe(1);
    expect(autoShotguns(6)).toBe(2);
    expect(autoShotguns(20)).toBe(7);
    expect(autoShotguns(30)).toBe(10);
    expect(autoVaccines(6)).toBe(1);
    expect(autoVaccines(20)).toBe(4);
    const s = z.init(config, ctx, 0);
    const holders = Object.values(s.heroes).filter((h) => h.shotgun);
    expect(holders).toHaveLength(autoShotguns(6));
    expect(holders.every((h) => h.role === "human")).toBe(true);
    const many = z.init(z.configSchema.parse({ ...config, shotgunCount: 3 }), ctx, 0);
    expect(Object.values(many.heroes).filter((h) => h.shotgun)).toHaveLength(3);
  });

  it("nessuno vede i fucili degli altri: la vista mostra solo il proprio", () => {
    const s = z.init(z.configSchema.parse({ ...config, shotgunCount: 2 }), ctx, 0);
    for (const p of ids) {
      const v = z.viewFor(s, p, null) as { shotgun: boolean };
      expect(v.shotgun).toBe(s.heroes[p]!.shotgun && s.heroes[p]!.role === "human");
    }
    expect(JSON.stringify(z.screenView(s))).not.toMatch(/shotgun/);
  });

  it("le carte vengono da mazzi completi: nessun duplicato finché il mazzo non finisce", () => {
    const s = z.init(config, ctx, 0); // 6 × 7 = 42 carte, mazzo da 40: un solo duplicato possibile al rimescolamento
    const all = Object.values(s.heroes).flatMap((h) => h.cards.map((c) => `${c.suit}:${c.value}`));
    const counts = new Map<string, number>();
    for (const k of all) counts.set(k, (counts.get(k) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(2);
    expect([...counts.values()].filter((n) => n === 2).length).toBeLessThanOrEqual(2);
  });

  it("i semi dei turni sono pubblici, in blocchi mescolati: ogni 4 turni compaiono tutti", () => {
    const s = z.init(config, ctx, 0);
    for (let i = 0; i + 4 <= 12; i += 4) expect(new Set(s.suits.slice(i, i + 4)).size).toBe(4);
  });

  it("è deterministico con lo stesso seme e gli zombie non superano la metà dei giocatori", () => {
    expect(JSON.stringify(z.init(config, ctx, 0))).toBe(JSON.stringify(z.init(config, ctx, 0)));
    const two = { ...ctx, players: ctx.players.slice(0, 2) };
    const s = z.init(z.configSchema.parse({ ...config, zombieCount: 10 }), two, 0);
    expect(Object.values(s.heroes).filter((h) => h.role === "zombie")).toHaveLength(1);
  });

  it("con turni a 0 li sceglie in base a giocatori e zombie (tra 3 e 10); un valore esplicito vale sempre", () => {
    expect(autoRounds(2, 1)).toBe(3);
    expect(autoRounds(6, 2)).toBe(3);
    expect(autoRounds(20, 2)).toBe(4);
    expect(autoRounds(30, 2)).toBe(4);
    expect(autoRounds(30, 3)).toBe(4);
    expect(autoRounds(1000, 1)).toBe(10);
    expect(autoRounds(3, 5)).toBeGreaterThanOrEqual(3);
    const auto = z.init(z.configSchema.parse({ ...z.sampleConfig, rounds: 0 }), ctx, 0);
    expect(auto.cfg.rounds).toBe(autoRounds(6, 2));
    expect(z.init(config, ctx, 0).cfg.rounds).toBe(3);
  });

  it("accoppia tutti i vivi; con un numero dispari uno riposa", () => {
    const odd = { ...ctx, players: ctx.players.slice(0, 5) };
    const s = z.init(config, odd, 0);
    expect(s.pairs).toHaveLength(2);
    expect(s.bye).not.toBeNull();
    expect(new Set([...s.pairs.flat(), s.bye]).size).toBe(5);
  });
});

describe("Zombie Hunt: scelte e obbligo di seme", () => {
  it("accetta solo carte in mano, una sola scelta e solo dagli umani accoppiati", () => {
    const s = setup({ a: "human", b: "human" });
    expect(z.onInput(s, "a", play(C(0, 2)), META(1_100))).toBe(s); // carta che non ha
    const picked = z.onInput(s, "a", play(C(0, 5)), META(1_100));
    expect(picked.choices.a).toEqual({ kind: "card", suit: 0, value: 5 });
    expect(z.onInput(picked, "a", play(C(0, 6)), META(1_200))).toBe(picked); // definitiva
    expect(z.onInput(s, "c", play(C(0, 5)), META(1_100))).toBe(s); // non accoppiato
    expect(z.onInput(s, "zz", play(C(0, 5)), META(1_100))).toBe(s); // estraneo
    expect(z.onInput(s, "a", { type: "vaccine" }, META(1_100))).toBe(s); // senza vaccino
  });

  it("il valore giusto ma del seme sbagliato non vale come quella carta", () => {
    const s = setup({ a: "human", b: "human" });
    expect(z.onInput(s, "a", play(C(1, 5)), META(1_100))).toBe(s);
  });

  it("chi ha carte del seme del turno deve giocarne una; senza, gioca quel che vuole", () => {
    const hand = [C(0, 9), C(1, 2), C(1, 3)];
    const s = setup({ a: "human", b: "human" }, { a: hand }, [["a", "b"]], { suits: [1, 0, 0, 0] });
    expect(z.onInput(s, "a", play(C(0, 9)), META(1_100))).toBe(s); // ha ♥: deve giocare ♥
    expect(z.onInput(s, "a", play(C(1, 3)), META(1_100)).choices.a).toEqual({ kind: "card", suit: 1, value: 3 });
    const noSuit = setup({ a: "human", b: "human" }, { a: hand }, [["a", "b"]], { suits: [3, 0, 0, 0] });
    expect(z.onInput(noSuit, "a", play(C(0, 9)), META(1_100)).choices.a).toBeDefined(); // niente ♣: libera
    expect(legalCards(hand, 1)).toEqual([C(1, 2), C(1, 3)]);
    expect(legalCards(hand, 3)).toEqual(hand);
  });

  it("fucile e vaccino si possono giocare anche avendo carte del seme del turno", () => {
    const s = setup({ a: "human", b: "human" });
    s.heroes.a!.vaccine = true;
    expect(z.onInput(s, "a", { type: "shotgun" }, META(1_100)).choices.a).toEqual({ kind: "shotgun" });
    expect(z.onInput(s, "a", { type: "vaccine" }, META(1_100)).choices.a).toEqual({ kind: "vaccine" });
  });

  it("ignora le scelte dopo la scadenza", () => {
    const s = setup({ a: "zombie", b: "human" });
    expect(z.onInput(s, "b", play(C(0, 5)), META(s.deadline + 5_000))).toBe(s);
    expect(z.onInput(s, "a", { type: "bite" }, META(s.deadline + 5_000))).toBe(s);
  });

  it("lo zombie può mordere o mimetizzarsi con una carta; l'umano non può mordere; lo zombie non usa fucile e vaccino", () => {
    const s = setup({ a: "zombie", b: "human" });
    s.heroes.a!.vaccine = true;
    expect(z.onInput(s, "a", { type: "bite" }, META(1_100)).choices.a).toEqual({ kind: "bite" });
    expect(z.onInput(s, "a", play(C(0, 5)), META(1_100)).choices.a).toEqual({ kind: "card", suit: 0, value: 5 });
    expect(z.onInput(s, "a", { type: "shotgun" }, META(1_100))).toBe(s);
    expect(z.onInput(s, "a", { type: "vaccine" }, META(1_100))).toBe(s);
    expect(z.onInput(s, "b", { type: "bite" }, META(1_100))).toBe(s);
  });

  it("anche gli zombie devono scegliere perché il turno si riveli da solo (così non si distinguono dagli umani)", () => {
    let s = setup({ a: "zombie", b: "human" });
    s = z.onInput(s, "b", play(C(0, 5)), META(1_100));
    expect(z.onTick(s, 1_500)).toBe(s); // manca lo zombie
    s = z.onInput(s, "a", { type: "bite" }, META(1_100));
    expect(z.onTick(s, 1_500).phase).toBe("reveal");
  });

  it("uno zombie senza carte può solo mordere: non si aspetta", () => {
    let s = setup({ a: "zombie", b: "human" }, { a: [] });
    s = z.onInput(s, "b", play(C(0, 5)), META(1_100));
    expect(z.onInput(s, "a", play(C(0, 5)), META(1_100))).toBe(s);
    expect(z.onTick(s, 1_500).phase).toBe("reveal");
  });

  it("il turno si rivela da solo quando tutti gli umani hanno scelto, o alla scadenza", () => {
    let s = setup({ a: "human", b: "human" });
    expect(z.onTick(s, 1_500)).toBe(s);
    s = z.onInput(s, "a", play(C(0, 5)), META(1_100));
    expect(z.onTick(s, 1_500)).toBe(s);
    s = z.onInput(s, "b", play(C(0, 6)), META(1_100));
    expect(z.onTick(s, 1_500).phase).toBe("reveal");
    expect(z.onTick(setup({ a: "human", b: "human" }), 1_000 + 25_000 + 600).phase).toBe("reveal");
  });
});

describe("Zombie Hunt: duelli", () => {
  const run = (s: ZombieHuntState, picks: Record<string, Parameters<typeof z.onInput>[2]>) => {
    let cur = s;
    for (const [id, input] of Object.entries(picks)) cur = z.onInput(cur, id, input, META(1_100));
    return z.onHostCommand(cur, { type: "next" }, 2_000);
  };

  it("nello stesso seme vince il valore più alto e il vincitore prende la carta del perdente", () => {
    const r = run(setup({ a: "human", b: "human" }, { a: [C(0, 3), C(0, 9)], b: [C(0, 4), C(0, 5)] }), { a: play(C(0, 9)), b: play(C(0, 5)) });
    expect(r.heroes.a!.cards).toHaveLength(3);
    expect(r.heroes.a!.cards).toContainEqual(C(0, 5));
    expect(r.heroes.b!.cards).toEqual([C(0, 4)]);
    expect(r.totals.a).toBe(config.duelPoints);
    expect(r.events.a!.outcome).toBe("win");
    expect(r.events.a!.card).toEqual(C(0, 5));
    expect(r.events.b!.outcome).toBe("lose");
  });

  it("una carta del seme del turno batte qualunque carta di un altro seme, anche più alta", () => {
    // seme del turno ♠: a gioca ♠2, b non ha ♠ e scarta ♥10
    const r = run(setup({ a: "human", b: "human" }, { a: [C(0, 2), C(1, 1)], b: [C(1, 10), C(2, 4)] }), { a: play(C(0, 2)), b: play(C(1, 10)) });
    expect(r.events.a!.outcome).toBe("win");
    expect(r.heroes.a!.cards).toContainEqual(C(1, 10));
    expect(r.heroes.b!.cards).toEqual([C(2, 4)]);
  });

  it("senza il seme del turno, fuori seme decide il valore", () => {
    const r = run(setup({ a: "human", b: "human" }, { a: [C(1, 8), C(2, 1)], b: [C(2, 6), C(3, 1)] }, [["a", "b"]], { suits: [0] }), { a: play(C(1, 8)), b: play(C(2, 6)) });
    expect(r.events.a!.outcome).toBe("win");
  });

  it("il pareggio non cambia le mani", () => {
    const r = run(setup({ a: "human", b: "human" }, { a: [C(0, 5), C(1, 1)], b: [C(0, 5), C(1, 1)] }), { a: play(C(0, 5)), b: play(C(0, 5)) });
    expect(r.heroes.a!.cards).toEqual([C(0, 5), C(1, 1)]);
    expect(r.events.a!.outcome).toBe("draw");
  });

  it("chi resta senza carte è eliminato", () => {
    const r = run(setup({ a: "human", b: "human" }, { a: [C(0, 9)], b: [C(0, 2)] }), { a: play(C(0, 9)), b: play(C(0, 2)) });
    expect(r.heroes.b!.role).toBe("out");
    expect(r.summary.eliminated).toBe(1);
  });

  it("senza scelta l'umano gioca la carta più bassa che può giocare (seguendo il seme)", () => {
    const hand = [C(1, 1), C(0, 8), C(0, 9)];
    const r = run(setup({ a: "human", b: "human" }, { a: [C(0, 7)], b: hand }), { a: play(C(0, 7)) });
    expect(r.events.b!.mine).toEqual({ kind: "card", suit: 0, value: 8 }); // ♠ è il seme del turno: non scarta ♥1
  });

  const BIG = [C(0, 9), C(0, 8), C(0, 7), C(0, 3), C(0, 2), C(0, 1)];

  it("il fucile contro un umano è a vuoto: perdi il duello, cedi le tue carte più forti e perdi punti", () => {
    const r = run(setup({ a: "human", b: "human" }, { a: BIG, b: [C(0, 4), C(0, 5)] }), { a: { type: "shotgun" }, b: play(C(0, 5)) });
    expect(r.heroes.a!.shotgun).toBe(false);
    expect(r.events.b!.outcome).toBe("win");
    expect(r.events.a!.outcome).toBe("lose");
    expect(r.heroes.a!.cards).toEqual([C(0, 3), C(0, 2), C(0, 1)]); // cede le 3 più forti
    expect(r.heroes.b!.cards).toHaveLength(2 + config.missCards);
    expect(r.events.a!.count).toBe(config.missCards);
    expect(r.totals.a).toBe(-config.missPoints);
    expect(r.totals.b).toBe(config.duelPoints);
  });

  it("anche il vaccino a vuoto costa caro", () => {
    const s = setup({ a: "human", b: "human" }, { a: BIG, b: [C(0, 4)] });
    s.heroes.a!.vaccine = true;
    const r = run(s, { a: { type: "vaccine" }, b: play(C(0, 4)) });
    expect(r.heroes.a!.vaccine).toBe(false);
    expect(r.heroes.a!.cards).toHaveLength(BIG.length - config.missCards);
    expect(r.totals.a).toBe(-config.missPoints);
  });

  it("se entrambi sparano a vuoto si scambiano le carte e pagano tutti e due", () => {
    const r = run(setup({ a: "human", b: "human" }, { a: BIG, b: [C(0, 6), C(0, 5), C(0, 4), C(0, 2)] }), { a: { type: "shotgun" }, b: { type: "shotgun" } });
    expect(r.events.a!.outcome).toBe("draw");
    expect(r.heroes.a!.cards).toHaveLength(BIG.length - 3 + 3);
    expect(r.heroes.a!.cards).toContainEqual(C(0, 6));
    expect(r.heroes.b!.cards).toContainEqual(C(0, 9));
    expect(r.totals.a).toBe(-config.missPoints);
    expect(r.totals.b).toBe(-config.missPoints);
  });

  it("chi spara a vuoto con poche carte le cede tutte e viene eliminato", () => {
    const r = run(setup({ a: "human", b: "human" }, { a: [C(0, 3), C(0, 2)], b: [C(0, 5)] }), { a: { type: "shotgun" }, b: play(C(0, 5)) });
    expect(r.heroes.a!.cards).toHaveLength(0);
    expect(r.heroes.a!.role).toBe("out");
  });
});

describe("Zombie Hunt: zombie", () => {
  const run = (s: ZombieHuntState, input: Parameters<typeof z.onInput>[2]) =>
    z.onHostCommand(z.onInput(s, "b", input, META(1_100)), { type: "next" }, 2_000);

  it("lo zombie infetta l'umano che gioca una carta, anche del seme del turno e altissima", () => {
    const r = run(setup({ a: "zombie", b: "human" }, { b: [C(0, 10)] }), play(C(0, 10)));
    expect(r.heroes.b!.role).toBe("zombie");
    expect(r.totals.a).toBe(config.infectionPoints);
    expect(r.events.a!.outcome).toBe("bit");
    expect(r.events.b!.outcome).toBe("bitten");
    expect(r.summary.infected).toBe(1);
  });

  it("lo zombie che si mimetizza con una carta fa un duello normale: l'umano non vede un morso", () => {
    const s = setup({ a: "zombie", b: "human" }, { a: [C(0, 9), C(0, 1)], b: [C(0, 4), C(0, 3)] });
    const r = z.onHostCommand(z.onInput(z.onInput(s, "a", play(C(0, 9)), META(1_100)), "b", play(C(0, 4)), META(1_100)), { type: "next" }, 2_000);
    expect(r.heroes.b!.role).toBe("human");
    expect(r.summary.infected).toBe(0);
    expect(r.events.a!.outcome).toBe("win");
    expect(r.events.b!.outcome).toBe("lose");
    expect(r.heroes.a!.cards).toContainEqual(C(0, 4));
    expect(r.totals.a).toBe(config.duelPoints); // niente punti da infezione
  });

  it("un umano più forte batte lo zombie mimetizzato e gli prende la carta, senza scoprirlo", () => {
    const s = setup({ a: "zombie", b: "human" }, { a: [C(0, 2), C(0, 1)], b: [C(0, 8)] });
    const r = z.onHostCommand(z.onInput(z.onInput(s, "a", play(C(0, 2)), META(1_100)), "b", play(C(0, 8)), META(1_100)), { type: "next" }, 2_000);
    expect(r.events.b!.outcome).toBe("win");
    expect(r.heroes.a!.role).toBe("zombie"); // resta zombie anche se perde carte
    expect(r.heroes.a!.cards).toEqual([C(0, 1)]);
  });

  it("il fucile abbatte anche uno zombie mimetizzato", () => {
    const s = setup({ a: "zombie", b: "human" });
    const r = z.onHostCommand(z.onInput(z.onInput(s, "a", play(C(0, 5)), META(1_100)), "b", { type: "shotgun" }, META(1_100)), { type: "next" }, 2_000);
    expect(r.heroes.a!.role).toBe("out");
    expect(r.events.b!.outcome).toBe("shot");
  });

  it("il fucile abbatte lo zombie e si consuma", () => {
    const r = run(setup({ a: "zombie", b: "human" }), { type: "shotgun" });
    expect(r.heroes.a!.role).toBe("out");
    expect(r.heroes.b!.role).toBe("human");
    expect(r.heroes.b!.shotgun).toBe(false);
    expect(r.totals.b).toBe(config.shotPoints);
  });

  it("il vaccino cura lo zombie e si consuma", () => {
    const s = setup({ a: "zombie", b: "human" });
    s.heroes.b!.vaccine = true;
    const r = run(s, { type: "vaccine" });
    expect(r.heroes.a!.role).toBe("human");
    expect(r.heroes.b!.vaccine).toBe(false);
    expect(r.totals.b).toBe(config.curePoints);
    expect(r.events.a!.outcome).toBe("healed");
  });

  it("due zombie non si fanno nulla", () => {
    const r = z.onHostCommand(setup({ a: "zombie", b: "zombie" }), { type: "next" }, 2_000);
    expect(r.heroes.a!.role).toBe("zombie");
    expect(r.heroes.b!.role).toBe("zombie");
    expect(r.events.a!.outcome).toBe("quiet");
  });
});

describe("Zombie Hunt: fine partita", () => {
  it("vince la fazione con più sopravvissuti e i suoi superstiti prendono il bonus", () => {
    const s = setup({ a: "zombie", b: "zombie", c: "zombie", d: "human", e: "human", f: "human" }, {}, [["a", "d"]], { round: 2 });
    const r = z.onHostCommand(z.onHostCommand(s, { type: "next" }, 2_000), { type: "next" }, 3_000);
    expect(r.phase).toBe("done");
    expect(z.isFinished(r)).toBe(true);
    expect(r.winner).toBe("zombies");
    expect(r.totals.b).toBe(config.winPoints);
    expect(r.totals.e ?? 0).toBe(0);
  });

  it("finisce prima se non restano zombie", () => {
    const s = setup({ a: "zombie" }, {}, [["a", "b"]]);
    const r1 = z.onInput(s, "b", { type: "shotgun" }, META(1_100));
    const done = z.onHostCommand(z.onHostCommand(r1, { type: "next" }, 2_000), { type: "next" }, 3_000);
    expect(done.phase).toBe("done");
    expect(done.winner).toBe("humans");
  });

  it("la classifica include tutti", () => {
    const r = z.result(z.init(config, ctx, 0));
    expect(r.ranking.map((x) => x.playerId).sort()).toEqual(ids);
  });
});

describe("Zombie Hunt: anti-leak", () => {
  const s = z.init(config, ctx, 0);
  const zombie = Object.keys(s.heroes).find((id) => s.heroes[id]!.role === "zombie")!;
  const human = Object.keys(s.heroes).find((id) => s.heroes[id]!.role === "human")!;

  it("lo schermo mostra seme del turno e prossimo, ma non ruoli, mani, scelte né nomi in corso di partita", () => {
    const first = s.heroes[human]!.cards.find((c) => c.suit === s.suits[0]) ?? s.heroes[human]!.cards[0]!;
    const picked = z.onInput(s, human, play(first), META(100));
    for (const state of [picked, z.onHostCommand(picked, { type: "next" }, 500)]) {
      const view = z.screenView(state) as Record<string, unknown>;
      expect(view).toHaveProperty("suit");
      expect(view).toHaveProperty("nextSuit");
      expect(JSON.stringify(view)).not.toMatch(/"role"|"cards"|"heroes"|"choice"|"zombieNames"|"nickname"/);
    }
  });

  it("il telefono dell'umano non rivela il ruolo dello sfidante né le sue carte", () => {
    const pair = s.pairs.find((p) => p.includes(human));
    if (pair) {
      const other = pair[0] === human ? pair[1] : pair[0];
      const v = z.viewFor(s, human, null) as Record<string, unknown>;
      expect(v).not.toHaveProperty("opponentRole");
      for (const c of s.heroes[other]!.cards) {
        const mine = s.heroes[human]!.cards.some((x) => x.suit === c.suit && x.value === c.value);
        if (!mine) expect(JSON.stringify(v)).not.toContain(JSON.stringify(c));
      }
    }
  });

  it("l'umano scopre l'esito ma non il ruolo di chi non ha incontrato", () => {
    const mine = z.viewFor(s, zombie, null) as { role: string };
    expect(mine.role).toBe("zombie");
    const partner = s.pairs.find((p) => p.includes(zombie))?.find((i) => i !== zombie);
    for (const o of ids.filter((i) => i !== zombie && i !== partner)) {
      expect(JSON.stringify(z.viewFor(s, o, null))).not.toContain(zombie.toUpperCase());
    }
  });

  it("a fine partita lo schermo svela i ruoli", () => {
    const done = { ...s, phase: "done" as const, winner: "humans" as const };
    const view = z.screenView(done) as { players: { role: string }[] };
    expect(view.players.some((p) => p.role === "zombie")).toBe(true);
  });
});

describe("Zombie Hunt: sparare a tappeto non è una strategia", () => {
  it("con 30 giocatori, se tutti i possessori di fucile sparano al primo turno, gli zombie sopravvivono quasi tutti e i tiratori ci rimettono", () => {
    const players = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, nickname: `P${i}`, teamId: null }));
    const cfg = z.configSchema.parse({ ...z.sampleConfig, zombieCount: 3, rounds: 6 });
    let killed = 0;
    let shooterPoints = 0;
    let shooters = 0;
    const RUNS = 60;
    for (let seed = 1; seed <= RUNS; seed++) {
      let s = z.init(cfg, { players, teams: [], seed }, 0);
      for (const [id, h] of Object.entries(s.heroes)) {
        if (h.role === "human" && h.shotgun) {
          shooters++;
          s = z.onInput(s, id, { type: "shotgun" }, META(10));
        }
      }
      const r = z.onHostCommand(s, { type: "next" }, 1_000);
      killed += r.summary.shot;
      for (const [id, h] of Object.entries(s.heroes)) if (h.role === "human" && h.shotgun) shooterPoints += r.totals[id] ?? 0;
    }
    expect(shooters / RUNS).toBe(autoShotguns(30));
    // al massimo ~6 fucili su 29 avversari possibili, di cui 3 zombie: ne abbattono meno di 1 a partita in media
    expect(killed / RUNS).toBeLessThan(1);
    // e chi spara perde punti in media (i colpi a vuoto costano più di quanto rendano quelli a segno)
    expect(shooterPoints / shooters).toBeLessThan(0);
  });
});
