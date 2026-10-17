import { describe, expect, it } from "vitest";
import type { InputMeta, MinigameContext } from "@gioco/shared";
import { type ScalataState, scalata as g, scalataConfigSchema } from "./index.js";

const players = ["a", "b", "c", "d"].map((id) => ({ id, nickname: id.toUpperCase(), teamId: null }));
const ctx: MinigameContext = { players, teams: [], seed: 1 };
const q = (text: string, correctIndex = 0) => ({ text, options: ["giusta", "x", "y"], correctIndex });
const make = (extra: object = {}) =>
  scalataConfigSchema.parse({ questions: [q("Uno"), q("Due", 1), q("Tre")], prizePoints: 1000, basePoints: 100, afterOutPercent: 50, revealSec: 2, ...extra });
const T0 = 1_000;
const meta = (receivedAt: number): InputMeta => ({ receivedAt, claimedTime: receivedAt, rtt: 0 });
const answer = (s: ScalataState, id: string, choice: number, at = T0 + 1_000) => g.onInput(s, id, { type: "answer", choice }, meta(at));

/** Tutti rispondono come indicato, si rivela e si passa alla domanda dopo (o alla fine). */
function play(s: ScalataState, choices: Record<string, number>): ScalataState {
  const at = s.openedAt + 1_000;
  for (const [id, c] of Object.entries(choices)) s = answer(s, id, c, at);
  s = g.onTick(s, at);
  return g.onTick(s, at + 10_000);
}

describe("La scalata", () => {
  it("chi sbaglia o non risponde è eliminato alla rivelazione, non prima", () => {
    let s = g.init(make(), ctx, T0);
    s = answer(answer(s, "a", 0), "b", 1);
    expect(s.alive).toHaveLength(4);
    s = g.onHostCommand(s, { type: "next" }, T0 + 2_000);
    expect(s.phase).toBe("reveal");
    expect(s.alive).toEqual(["a"]);
    expect(s.out).toEqual({ b: 0, c: 0, d: 0 });
  });

  it("anche gli eliminati continuano a rispondere; la risposta giusta vale di meno, e il livello la fa crescere", () => {
    let s = g.init(make(), ctx, T0);
    s = play(s, { a: 0, b: 1, c: 1, d: 1 }); // livello 1 (100): solo a giusta
    expect(s.index).toBe(1);
    s = answer(s, "b", 1); // b era già fuori: può rispondere
    expect(s.answers.b).toBeDefined();
    s = play(s, { a: 1, c: 1, d: 0 }); // livello 2 (200): a pieno, b e c già fuori → metà, d sbaglia
    expect(s.points).toEqual({ a: 300, b: 100, c: 100 });
    expect(s.alive).toEqual(["a"]);
  });

  it("la prima risposta è definitiva e chi non è in serata non risponde", () => {
    const s = g.init(make(), ctx, T0);
    const first = answer(s, "a", 1);
    expect(answer(first, "a", 0)).toBe(first);
    expect(answer(s, "estraneo", 0)).toBe(s);
  });

  it("gioca tutte le domande anche se resta uno solo; i sopravvissuti dividono il montepremi", () => {
    let s = g.init(make(), ctx, T0);
    s = play(s, { a: 0, b: 1, c: 1, d: 1 });
    expect(g.isFinished(s)).toBe(false);
    s = play(s, { a: 1, b: 1, c: 1, d: 1 });
    s = play(s, { a: 0, b: 0, c: 0, d: 0 });
    expect(g.isFinished(s)).toBe(true);
    const pts = Object.fromEntries(g.scores(s).map((d) => [d.playerId, d.points]));
    // a: 100 + 200 + 300 + 1000 di montepremi; b: 200*0.5 + 300*0.5; c e d come b
    expect(pts).toEqual({ a: 1600, b: 100 + 150, c: 100 + 150, d: 100 + 150 });
    const rank = g.result(s).ranking;
    expect(rank[0]).toMatchObject({ playerId: "a", rank: 1 });
  });

  it("più sopravvissuti: il montepremi è in parti uguali, il resto va ai più veloci, nulla si perde", () => {
    let s = g.init(make({ questions: [q("Uno")], basePoints: 0 }), { ...ctx, players: players.slice(0, 3) }, T0);
    s = answer(s, "a", 0, T0 + 500);
    s = answer(s, "b", 0, T0 + 100);
    s = answer(s, "c", 0, T0 + 900);
    s = g.onTick(s, T0 + 900);
    s = g.onTick(s, T0 + 20_000);
    const pts = Object.fromEntries(g.scores(s).map((d) => [d.playerId, d.points]));
    expect(pts).toEqual({ b: 334, a: 333, c: 333 });
  });

  it("se tutti vengono eliminati vince chi ha il punteggio più alto e prende il montepremi", () => {
    let s = g.init(make(), ctx, T0);
    s = play(s, { a: 1, b: 0, c: 1, d: 1 }); // b giusta, gli altri sbagliano e a è fuori; b resta alive
    expect(s.alive).toEqual(["b"]);
    s = play(s, { a: 1, b: 0, c: 1, d: 0 }); // livello 2: b sbaglia → nessun sopravvissuto; c (giusta, fuori) 100, d fuori
    expect(s.alive).toEqual([]);
    s = play(s, { a: 0, b: 1, c: 0, d: 1 });
    expect(g.isFinished(s)).toBe(true);
    // risposte: a 100+150, b 100, c 100+150, d 0 → a e c a pari merito dividono il montepremi
    expect(s.points).toEqual({ a: 250, b: 100, c: 250 });
    const pts = Object.fromEntries(g.scores(s).map((d) => [d.playerId, d.points]));
    expect(pts).toEqual({ a: 750, b: 100, c: 750 });
    expect(g.screenView(s)).toMatchObject({ byScore: true });
  });

  it("a pari punteggio più alto, il montepremi si divide; con tutti a zero non vince nessuno", () => {
    let s = g.init(make({ questions: [q("Uno")], basePoints: 0 }), ctx, T0);
    s = play(s, { a: 1, b: 1, c: 1, d: 1 });
    expect(g.isFinished(s)).toBe(true);
    expect(g.scores(s)).toEqual([]);

    s = g.init(make({ questions: [q("Uno"), q("Due")], basePoints: 100 }), ctx, T0);
    s = play(s, { a: 0, b: 0, c: 1, d: 1 }); // a e b giuste; c e d fuori
    s = play(s, { a: 1, b: 1, c: 1, d: 1 }); // a e b sbagliano → nessun sopravvissuto
    expect(g.isFinished(s)).toBe(true);
    const pts = Object.fromEntries(g.scores(s).map((d) => [d.playerId, d.points]));
    expect(pts).toEqual({ a: 100 + 500, b: 100 + 500 });
  });

  it("interrompere il round a metà assegna le risposte già giuste ma non il montepremi", () => {
    let s = g.init(make(), ctx, T0);
    s = play(s, { a: 0, b: 1, c: 1, d: 1 });
    expect(g.scores(s)).toEqual([{ playerId: "a", teamId: null, points: 100, reason: "La scalata" }]);
  });

  it("un tasto arrivato dopo la scadenza non conta", () => {
    const s = g.init(make({ defaultTimeSec: 10 }), ctx, T0);
    expect(answer(s, "a", 0, T0 + 10_000 + 400)).toBe(s);
  });

  it("anti-leak: la risposta giusta non è in nessuna vista prima della rivelazione e non si vedono le scelte altrui", () => {
    let s = g.init(make({ questions: [{ text: "Domanda?", options: ["Mela", "Pera", "Uva"], correctIndex: 2 }, q("Altra")] }), ctx, T0);
    s = answer(answer(s, "a", 2), "b", 0);
    for (const v of [g.screenView(s), g.viewFor(s, "a", null), g.viewFor(s, "c", null)]) {
      expect(JSON.stringify(v)).not.toMatch(/correctIndex|"earned"/);
    }
    expect(g.viewFor(s, "c", null)).toMatchObject({ myChoice: null });
    expect(g.screenView(s)).toMatchObject({ answered: 2 });
    s = g.onHostCommand(s, { type: "next" }, T0 + 2_000);
    expect(g.viewFor(s, "a", null)).toMatchObject({ status: "alive", reveal: { correctIndex: 2, earned: 100 } });
    expect(g.viewFor(s, "b", null)).toMatchObject({ status: "falling", reveal: { earned: 0 } });
  });
});
