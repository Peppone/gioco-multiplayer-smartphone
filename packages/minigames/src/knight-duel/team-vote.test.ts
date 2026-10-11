import { describe, expect, it } from "vitest";
import { makeRng } from "./rng.js";
import { castVote, confirmVote, createVote, isVoteDone, memberView, publicVoteView, resolveVote, tally } from "./team-vote.js";

const rng = () => makeRng(1);
const vote = (max = 1) => createVote({ options: ["a", "b", "c", "d"], max, members: ["p1", "p2", "p3"], deadline: 1_000 });
const ids = (v: ReturnType<typeof vote>) => resolveVote(v, { mode: "random" }, rng());

describe("scelte dei membri", () => {
  it("selezionare di nuovo la stessa opzione la toglie", () => {
    let v = castVote(vote(), "p1", "a");
    expect(memberView(v, "p1").mine).toEqual(["a"]);
    v = castVote(v, "p1", "a");
    expect(memberView(v, "p1").mine).toEqual([]);
  });

  it("con max=1 una nuova scelta sostituisce la precedente", () => {
    const v = castVote(castVote(vote(1), "p1", "a"), "p1", "b");
    expect(memberView(v, "p1").mine).toEqual(["b"]);
  });

  it("con max=2 si tengono due scelte e la più vecchia lascia il posto alla terza", () => {
    let v = vote(2);
    for (const o of ["a", "b", "c"]) v = castVote(v, "p1", o);
    expect(memberView(v, "p1").mine).toEqual(["b", "c"]);
  });

  it("ignora estranei e opzioni inesistenti (stesso oggetto: nessun cambiamento)", () => {
    const v = vote();
    expect(castVote(v, "intruso", "a")).toBe(v);
    expect(castVote(v, "p1", "zzz")).toBe(v);
    expect(confirmVote(v, "intruso")).toBe(v);
  });

  it("modificare la scelta dopo aver confermato annulla la conferma", () => {
    let v = confirmVote(castVote(vote(), "p1", "a"), "p1");
    expect(memberView(v, "p1").confirmed).toBe(true);
    v = castVote(v, "p1", "b");
    expect(memberView(v, "p1").confirmed).toBe(false);
  });
});

describe("chiusura del voto", () => {
  it("si chiude alla scadenza o quando tutti hanno confermato", () => {
    let v = vote();
    expect(isVoteDone(v, 999)).toBe(false);
    expect(isVoteDone(v, 1_000)).toBe(true);
    for (const m of ["p1", "p2"]) v = confirmVote(v, m);
    expect(isVoteDone(v, 500)).toBe(false);
    v = confirmVote(v, "p3");
    expect(isVoteDone(v, 500)).toBe(true);
  });
});

describe("esito: maggioranza, parità, nessun voto", () => {
  it("vince la maggioranza", () => {
    let v = vote();
    v = castVote(v, "p1", "b");
    v = castVote(v, "p2", "a");
    v = castVote(v, "p3", "a");
    expect(ids(v)).toMatchObject({ picked: ["a"], source: "votes", tieBroken: false });
  });

  it("in parità prevale l'opzione votata per prima", () => {
    let v = vote();
    v = castVote(v, "p1", "c"); // prima
    v = castVote(v, "p2", "a");
    const out = ids(v);
    expect(out.picked).toEqual(["c"]);
    expect(out.tieBroken).toBe(true);
  });

  it("se il primo votante cambia idea, conta l'ordine dei voti ancora attivi", () => {
    let v = vote();
    v = castVote(v, "p1", "c");
    v = castVote(v, "p2", "a");
    v = castVote(v, "p1", "c"); // toglie c
    v = castVote(v, "p1", "b"); // ora b è l'ultimo arrivato
    expect(ids(v).picked).toEqual(["a"]);
  });

  it("con max=2 escono le due più votate", () => {
    let v = vote(2);
    v = castVote(castVote(v, "p1", "a"), "p1", "b");
    v = castVote(castVote(v, "p2", "a"), "p2", "c");
    v = castVote(v, "p3", "a");
    expect(tally(v).map((t) => [t.option, t.count])).toEqual([["a", 3], ["b", 1], ["c", 1]]);
    expect(ids(v).picked).toEqual(["a", "b"]); // b votata prima di c
  });

  it("senza voti: casuale deterministico, prudente se configurato, oppure nulla", () => {
    const v = vote();
    const a = resolveVote(v, { mode: "random" }, makeRng(5));
    const b = resolveVote(v, { mode: "random" }, makeRng(5));
    expect(a).toEqual(b);
    expect(a).toMatchObject({ source: "fallback" });
    expect(v.options).toContain(a.picked[0]);
    expect(resolveVote(v, { mode: "prudent", prudent: ["zzz", "c", "a"] }, rng()).picked).toEqual(["c"]);
    expect(resolveVote(v, { mode: "prudent", prudent: ["zzz"] }, rng()).picked).toHaveLength(1); // nessuna prudente disponibile: a caso
    expect(resolveVote(v, { mode: "none" }, rng()).picked).toEqual([]);
  });

  it("nessuna opzione = niente da scegliere", () => {
    const v = createVote({ options: [], max: 1, members: ["p1"], deadline: 1 });
    expect(resolveVote(v, { mode: "random" }, rng()).picked).toEqual([]);
  });
});

describe("chi vede cosa", () => {
  it("i compagni vedono le scelte degli altri in tempo reale", () => {
    let v = vote();
    v = castVote(v, "p2", "b");
    v = confirmVote(castVote(v, "p3", "c"), "p3");
    const view = memberView(v, "p1");
    expect(view.mine).toEqual([]);
    expect(view.mates).toEqual([
      { playerId: "p2", picks: ["b"], confirmed: false },
      { playerId: "p3", picks: ["c"], confirmed: true },
    ]);
  });

  it("la vista pubblica dice solo quanti hanno deciso, mai cosa", () => {
    let v = castVote(vote(), "p1", "a");
    v = confirmVote(v, "p1");
    const pub = publicVoteView(v);
    expect(pub).toEqual({ members: 3, decided: 1, deadline: 1_000 });
    expect(JSON.stringify(pub)).not.toMatch(/"a"|picks|options/);
  });
});
