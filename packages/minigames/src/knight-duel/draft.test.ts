import { describe, expect, it } from "vitest";
import type { HandCard } from "./cards.js";
import { draftCast, draftConfirm, draftPublicView, draftResult, draftTick, draftViewFor, startDraft } from "./draft.js";
import { makeRng } from "./rng.js";

const card = (id: string): HandCard => ({ uid: `${id}#1`, cardId: id });
const OFFER = [card("fendente"), card("scudo"), card("martello")];
const members: [string[], string[]] = [["r1", "r2"], ["b1", "b2"]]; // lato 0 = Rossi, lato 1 = Blu
const rng = () => makeRng(7);
const start = (winner: 0 | 1 = 0) => startDraft({ offered: OFFER, winner, members, now: 0, voteMs: 10_000 });

describe("priorità: il vincitore sceglie per primo", () => {
  it("il vincitore sceglie, poi lo sconfitto sceglie tra le carte rimaste", () => {
    let d = start(0);
    d = draftCast(d, "r1", "scudo#1");
    d = draftCast(d, "r2", "scudo#1");
    d = draftTick(d, 10_000, rng()); // scade il voto dei Rossi
    expect(d.picks[0]?.cardId).toBe("scudo");
    expect(d.step).toBe(1);
    expect(d.offered.map((c) => c.cardId)).toEqual(["fendente", "martello"]);

    d = draftCast(d, "b1", "martello#1");
    d = draftConfirm(d, "b1");
    d = draftConfirm(d, "b2"); // conferma anche b2 (astenuto): si chiude prima della scadenza
    d = draftTick(d, 11_000, rng());
    expect(d.phase).toBe("done");
    const r = draftResult(d);
    expect(r.picks.map((c) => c?.cardId)).toEqual(["scudo", "martello"]);
    expect(r.leftover.map((c) => c.cardId)).toEqual(["fendente"]); // torna al mazzo
  });

  it("se vince il lato 1, scelgono prima i Blu", () => {
    let d = start(1);
    expect(draftPublicView(d).picker).toBe(1);
    d = draftCast(d, "b1", "fendente#1");
    d = draftTick(d, 10_000, rng());
    expect(d.picks[1]?.cardId).toBe("fendente");
    expect(draftPublicView(d).picker).toBe(0);
  });

  it("vota solo il team di turno: i membri dell'altro team vengono ignorati", () => {
    const d = start(0);
    expect(draftCast(d, "b1", "scudo#1")).toBe(d);
    expect(draftConfirm(d, "b1")).toBe(d);
  });

  it("parità: prevale la carta votata per prima; nessun voto: carta casuale", () => {
    let d = start(0);
    d = draftCast(d, "r1", "martello#1");
    d = draftCast(d, "r2", "fendente#1");
    d = draftTick(d, 10_000, rng());
    expect(d.picks[0]?.cardId).toBe("martello");

    const silent = draftTick(draftTick(start(0), 10_000, rng()), 20_000, rng());
    expect(silent.phase).toBe("done");
    expect(silent.picks[0]).not.toBeNull();
    expect(silent.picks[1]).not.toBeNull();
    expect(silent.picks[0]!.uid).not.toBe(silent.picks[1]!.uid);
  });

  it("è deterministico: stesso seme = stessa scelta casuale", () => {
    const a = draftTick(draftTick(start(0), 10_000, makeRng(3)), 20_000, makeRng(3));
    const b = draftTick(draftTick(start(0), 10_000, makeRng(3)), 20_000, makeRng(3));
    expect(a.picks).toEqual(b.picks);
  });

  it("tick senza novità restituisce lo stesso oggetto", () => {
    const d = start(0);
    expect(draftTick(d, 5_000, rng())).toBe(d);
  });

  it("un lato senza membri (nessun giocatore connesso) sceglie a caso subito", () => {
    const d = draftTick(startDraft({ offered: OFFER, winner: 0, members: [[], ["b1"]], now: 0, voteMs: 10_000 }), 0, rng());
    expect(d.picks[0]).not.toBeNull();
    expect(d.step).toBe(1);
  });

  it("con una sola carta offerta sceglie solo il vincitore; senza carte il draft è già finito", () => {
    const one = draftTick(draftCast(startDraft({ offered: [card("a")], winner: 0, members, now: 0, voteMs: 5_000 }), "r1", "a#1"), 5_000, rng());
    expect(one.phase).toBe("done");
    expect(one.picks).toEqual([card("a"), null]);
    expect(startDraft({ offered: [], winner: 0, members, now: 0, voteMs: 5_000 }).phase).toBe("done");
  });
});

describe("segretezza", () => {
  const ids = (v: unknown) => JSON.stringify(v);

  it("vede le carte solo il team che sta scegliendo", () => {
    const d = start(0);
    expect(draftViewFor(d, 0, "r1")).toMatchObject({ role: "picker", cards: OFFER, first: true });
    const other = draftViewFor(d, 1, "b1");
    expect(other).toEqual({ phase: "picking", role: "waiting", offeredCount: 3, picker: 0 });
    expect(ids(other)).not.toMatch(/fendente|scudo|martello/);
  });

  it("chi sceglie per secondo vede solo le carte rimaste, non quale è stata presa", () => {
    let d = start(0);
    d = draftCast(d, "r1", "scudo#1");
    d = draftTick(d, 10_000, rng());
    const second = draftViewFor(d, 1, "b1");
    expect(second).toMatchObject({ role: "picker", first: false });
    expect(ids(second)).not.toContain("scudo"); // la carta presa dai Rossi non compare
    // i Rossi, ora in attesa, non ricevono le carte rimaste
    expect(ids(draftViewFor(d, 0, "r1"))).not.toMatch(/fendente|martello/);
  });

  it("i compagni vedono le preferenze degli altri, gli avversari no", () => {
    let d = start(0);
    d = draftCast(d, "r2", "martello#1");
    expect(draftViewFor(d, 0, "r1")).toMatchObject({ vote: { mates: [{ playerId: "r2", picks: ["martello#1"] }] } });
    expect(ids(draftViewFor(d, 1, "b1"))).not.toContain("martello");
  });

  it("la vista pubblica (schermo) non contiene mai carte né preferenze", () => {
    let d = start(0);
    d = draftConfirm(draftCast(d, "r1", "scudo#1"), "r1");
    const pub = draftPublicView(d);
    expect(pub).toEqual({ phase: "picking", picker: 0, offeredCount: 3, progress: { members: 2, decided: 1, deadline: 10_000 } });
    expect(ids(pub)).not.toMatch(/fendente|scudo|martello|uid|cardId/);
  });

  it("a draft concluso nessuno vede più le carte in offerta", () => {
    const d = draftTick(draftTick(start(0), 10_000, rng()), 20_000, rng());
    expect(draftViewFor(d, 0, "r1")).toEqual({ phase: "done" });
    expect(draftPublicView(d)).toMatchObject({ phase: "done", offeredCount: 0 });
  });
});
