import { describe, expect, it } from "vitest";
import type { MinigameContext } from "@gioco/shared";
import { type SondaggioState, sondaggio as poll } from "./index.js";

const ctx: MinigameContext = {
  players: ["a", "b", "c", "d"].map((id) => ({ id, nickname: `Nick${id.toUpperCase()}`, teamId: null })),
  teams: [],
  seed: 1,
};

const config = poll.configSchema.parse({
  questions: [
    { text: "Ananas?", kind: "options", options: ["Sì", "No", "Boh"] },
    { text: "Chi fa tardi?", kind: "players" },
  ],
  timeSec: 20,
  crowdPoints: 50,
  winnerPoints: 100,
});

const vote = (s: SondaggioState, id: string, v: { option: number } | { target: string }, at = 1_000) =>
  poll.onInput(s, id, { type: "vote", ...v }, { receivedAt: at, claimedTime: at - 10, rtt: 20 });
const next = (s: SondaggioState, now = 25_000) => poll.onHostCommand(s, { type: "next" }, now);

describe("sondaggio", () => {
  it("applica i valori predefiniti: «options» e opzioni Sì/No", () => {
    const c = poll.configSchema.parse({ questions: [{ text: "x" }] });
    expect(c.questions[0]).toMatchObject({ kind: "options", options: ["Sì", "No"] });
  });

  it("scelta tra opzioni: chi vota come la maggioranza prende i punti", () => {
    let s = poll.init(config, ctx, 0);
    s = vote(s, "a", { option: 0 });
    s = vote(s, "b", { option: 0 });
    s = vote(s, "c", { option: 1 });
    s = next(s);
    expect(s.tally?.top).toEqual(["0"]);
    expect(s.earned).toEqual({ a: 50, b: 50 });
  });

  it("in parità di voti sono tutte «maggioranza»; senza voti nessun punto", () => {
    let s = poll.init(config, ctx, 0);
    s = vote(s, "a", { option: 0 });
    s = vote(s, "b", { option: 1 });
    expect(next(s).earned).toEqual({ a: 50, b: 50 });
    expect(next(poll.init(config, ctx, 0)).earned).toEqual({});
  });

  it("voto a un giocatore: non ci si può votare, vince il più votato (anche a pari merito)", () => {
    let s = poll.init(config, ctx, 0);
    s = next(s);
    s = next(s, 26_000); // seconda domanda (kind players)
    expect(s.index).toBe(1);
    s = vote(s, "a", { target: "a" }); // auto-voto: ignorato
    expect(s.votes.a).toBeUndefined();
    s = vote(s, "a", { target: "c" });
    s = vote(s, "b", { target: "c" });
    s = vote(s, "d", { target: "b" });
    s = next(s, 60_000);
    expect(s.earned).toEqual({ c: 100 });
    s = poll.init(config, ctx, 0);
    s = next(next(s), 26_000);
    s = vote(s, "a", { target: "b" });
    s = vote(s, "b", { target: "a" });
    expect(next(s, 60_000).earned).toEqual({ a: 100, b: 100 });
  });

  it("ignora voti del tipo sbagliato, opzioni inesistenti, bersagli sconosciuti e votanti esterni", () => {
    let s = poll.init(config, ctx, 0);
    expect(vote(s, "a", { target: "b" }).votes).toEqual({}); // domanda a opzioni
    expect(vote(s, "a", { option: 5 }).votes).toEqual({});
    expect(vote(s, "intruso", { option: 0 }).votes).toEqual({});
    s = next(next(s), 26_000);
    expect(vote(s, "a", { option: 0 }).votes).toEqual({}); // domanda a giocatori
    expect(vote(s, "a", { target: "sconosciuto" }).votes).toEqual({});
  });

  it("il voto si può cambiare finché c'è tempo", () => {
    let s = poll.init(config, ctx, 0);
    s = vote(s, "a", { option: 0 }, 1_000);
    s = vote(s, "a", { option: 2 }, 3_000);
    expect(s.votes.a?.vote).toBe(2);
    expect(vote(s, "a", { option: 1 }, 21_000).votes.a?.vote).toBe(2); // oltre la tolleranza
  });

  it("i voti sono anonimi: nessuna vista mostra chi ha votato cosa (a parte il proprio voto)", () => {
    let s = poll.init(config, ctx, 0);
    s = vote(s, "a", { option: 0 });
    s = vote(s, "b", { option: 1 });
    const text = (v: unknown) => JSON.stringify(v);
    for (const phase of ["voting", "reveal"] as const) {
      const st = phase === "reveal" ? next(s) : s;
      const screen = text(poll.screenView(st));
      expect(screen).not.toMatch(/"votes"|"voter"|"a"|"b"/);
      expect(text(poll.hostView(st).info)).not.toMatch(/"votes"|"voter"/);
      expect(text(poll.viewFor(st, "c", null))).not.toMatch(/"votes"|"voter"/);
    }
    expect(poll.viewFor(s, "a", null)).toMatchObject({ myVote: 0 });
    expect(poll.viewFor(s, "b", null)).toMatchObject({ myVote: 1 });
    expect(poll.viewFor(s, "c", null)).toMatchObject({ myVote: null });
    // prima della rivelazione i totali non si vedono
    expect(poll.screenView(s)).toMatchObject({ voted: 2 });
    expect(poll.screenView(s)).not.toHaveProperty("reveal");
  });

  it("per il voto a un giocatore l'elenco dei candidati esclude il votante", () => {
    const s = next(poll.init(config, ctx, 0));
    const s2 = next(s, 26_000);
    const v = poll.viewFor(s2, "a", null) as { candidates: { id: string }[] };
    expect(v.candidates.map((c) => c.id)).toEqual(["b", "c", "d"]);
  });

  it("la rivelazione mostra i totali per opzione (nessun nome) e ordina i giocatori per voti", () => {
    let s = poll.init(config, ctx, 0);
    s = vote(s, "a", { option: 1 });
    s = vote(s, "b", { option: 1 });
    const r = next(s) as SondaggioState;
    expect(poll.screenView(r)).toMatchObject({
      reveal: { bars: [{ label: "Sì", count: 0, top: false }, { label: "No", count: 2, top: true }, { label: "Boh", count: 0, top: false }] },
    });
  });
});
