import { describe, expect, it } from "vitest";
import type { InputMeta, MinigameContext } from "@gioco/shared";
import { type ReazioneState, reazioneACatena as g, reazioneConfigSchema } from "./index.js";

const players = ["a", "b", "c", "d"].map((id) => ({ id, nickname: id.toUpperCase(), teamId: null }));
const ctx: MinigameContext = { players, teams: [], seed: 7 };
const config = reazioneConfigSchema.parse({ words: ["Pappagallo", "Lampione", "Zattera", "Orologio", "Violino", "Cactus"], turns: 2 });
const T0 = 1_000;
const meta = (receivedAt: number): InputMeta => ({ receivedAt, claimedTime: receivedAt, rtt: 0 });

function started(): ReazioneState {
  let s = g.init(config, ctx, T0);
  s = g.onHostCommand(s, { type: "pick", giverA: "a", giverB: "b", guesser: "c" }, T0);
  return g.onHostCommand(s, { type: "begin" }, T0);
}
const word = (s: ReazioneState) => (g.hostView(s).info as { word: string }).word;

describe("Reazione a catena", () => {
  it("la regia sceglie la terna (distinta e in serata) e il gioco parte solo dal suo via", () => {
    const s0 = g.init(config, ctx, T0);
    expect(s0.phase).toBe("setup");
    expect(new Set([s0.trio.giverA, s0.trio.giverB, s0.trio.guesser]).size).toBe(3);
    const dup = g.onHostCommand(s0, { type: "pick", giverA: "a", giverB: "a", guesser: "c" }, T0);
    expect(dup.trio).toEqual(s0.trio);
    const stranger = g.onHostCommand(s0, { type: "pick", giverA: "a", giverB: "x", guesser: "c" }, T0);
    expect(stranger.trio).toEqual(s0.trio);
    const s = started();
    expect(s.phase).toBe("playing");
    expect(s.deadline).toBe(T0 + 60_000);
  });

  it("il sorteggio è deterministico e al secondo turno preferisce chi non ha ancora giocato", () => {
    expect(JSON.stringify(g.init(config, ctx, T0))).toBe(JSON.stringify(g.init(config, ctx, T0)));
    let s = started();
    s = g.onHostCommand(s, { type: "endTurn" }, T0 + 1_000);
    s = g.onHostCommand(s, { type: "next" }, T0 + 1_000);
    expect(s.phase).toBe("setup");
    expect(s.turnIndex).toBe(1);
    expect(s.trio.giverA === "d" || s.trio.giverB === "d" || s.trio.guesser === "d").toBe(true);
  });

  it("solo il giocatore che indovina può premere il pulsante, e il tempo si ferma", () => {
    const s = started();
    expect(g.onInput(s, "a", { type: "buzz" }, meta(T0 + 5_000))).toBe(s);
    expect(g.onInput(s, "d", { type: "buzz" }, meta(T0 + 5_000))).toBe(s);
    const b = g.onInput(s, "c", { type: "buzz" }, meta(T0 + 5_000));
    expect(b.phase).toBe("paused");
    expect(b.pauseReason).toBe("answer");
    expect(b.timeLeftMs).toBe(55_000);
    expect(g.onTick(b, T0 + 500_000)).toBe(b); // fermo: il tempo non scorre
  });

  it("giusta: +1 e parola nuova, ma resta nascosta e ferma finché la regia non dà il via", () => {
    let s = g.onInput(started(), "c", { type: "buzz" }, meta(T0 + 5_000));
    const first = word(s);
    s = g.onHostCommand(s, { type: "correct" }, T0 + 9_000);
    expect(s.correct).toBe(1);
    expect(s.phase).toBe("paused");
    expect(s.wordShown).toBe(false);
    expect(word(s)).not.toBe(first);
    expect(s.timeLeftMs).toBe(55_000);
    expect(g.viewFor(s, "a", null)).toMatchObject({ word: null });
    s = g.onHostCommand(s, { type: "resume" }, T0 + 20_000);
    expect(s.phase).toBe("playing");
    expect(s.deadline).toBe(T0 + 20_000 + 55_000);
    expect(g.viewFor(s, "a", null)).toMatchObject({ word: word(s) });
  });

  it("errore: −1 punto; il netto va a tutti e tre a fine turno e può essere negativo", () => {
    let s = started();
    for (let i = 0; i < 2; i++) {
      s = g.onInput(s, "c", { type: "buzz" }, meta(T0 + 1_000 * (i + 1)));
      s = g.onHostCommand(s, { type: "wrong" }, T0 + 1_000 * (i + 1));
      s = g.onHostCommand(s, { type: "resume" }, T0 + 1_000 * (i + 1));
    }
    s = g.onHostCommand(s, { type: "endTurn" }, T0 + 5_000);
    expect(s.phase).toBe("turn-over");
    expect(g.scores(s).sort((x, y) => x.playerId!.localeCompare(y.playerId!)).map((d) => [d.playerId, d.points])).toEqual([
      ["a", -2],
      ["b", -2],
      ["c", -2],
    ]);
  });

  it("passare: massimo 3 per turno, solo chi dà gli indizi, ferma il tempo e non costa punti", () => {
    let s = started();
    expect(g.onInput(s, "c", { type: "pass" }, meta(T0 + 1_000))).toBe(s); // chi indovina non può passare
    for (let i = 1; i <= 3; i++) {
      s = g.onInput(s, i % 2 ? "a" : "b", { type: "pass" }, meta(T0 + 1_000 * i));
      expect(s.phase).toBe("paused");
      expect(s.pauseReason).toBe("pass");
      expect(s.passesLeft).toBe(3 - i);
      s = g.onHostCommand(s, { type: "resume" }, T0 + 1_000 * i);
    }
    const after = g.onInput(s, "a", { type: "pass" }, meta(T0 + 10_000));
    expect(after).toBe(s);
    expect(s.wrong).toBe(0);
  });

  it("scade il tempo: il turno finisce da solo; un tasto arrivato in ritardo non conta", () => {
    const s = started();
    const late = g.onInput(s, "c", { type: "buzz" }, meta(T0 + 60_000 + 400));
    expect(late.phase).toBe("playing"); // entro la tolleranza, ma dopo la scadenza equa: ignorato
    const over = g.onTick(s, T0 + 60_000 + 600);
    expect(over.phase).toBe("turn-over");
    expect(over.history).toHaveLength(1);
  });

  it("tasto premuto all'ultimo istante: dopo il giudizio il turno si chiude", () => {
    let s = g.onInput(started(), "c", { type: "buzz" }, meta(T0 + 60_000 - 1));
    expect(s.timeLeftMs).toBe(1);
    s = g.onHostCommand(s, { type: "correct" }, T0 + 62_000);
    expect(s.correct).toBe(1);
    expect(s.phase).toBe("paused"); // c'era 1 ms: la regia può ancora dare il via
    s = g.onInput(started(), "c", { type: "buzz" }, meta(T0 + 60_000));
    expect(s.timeLeftMs).toBe(0);
    s = g.onHostCommand(s, { type: "wrong" }, T0 + 62_000);
    expect(s.phase).toBe("turn-over");
  });

  it("la regia può fermare il tempo, saltare la parola, dare tempo extra e chiudere il turno", () => {
    let s = started();
    s = g.onHostCommand(s, { type: "pause" }, T0 + 10_000);
    expect(s.pauseReason).toBe("host");
    expect(s.timeLeftMs).toBe(50_000);
    s = g.onHostCommand(s, { type: "addTime" }, T0 + 10_000);
    expect(s.timeLeftMs).toBe(60_000);
    const w = word(s);
    s = g.onHostCommand(s, { type: "skip" }, T0 + 10_000);
    expect(word(s)).not.toBe(w);
    expect(s.wordShown).toBe(false);
    s = g.onHostCommand(s, { type: "resume" }, T0 + 12_000);
    s = g.onHostCommand(s, { type: "addTime", seconds: 30 }, T0 + 13_000);
    expect(s.deadline).toBe(T0 + 12_000 + 60_000 + 30_000);
    expect(g.onHostCommand(s, { type: "endTurn" }, T0 + 14_000).phase).toBe("turn-over");
  });

  it("le parole non si ripetono nel round, anche tra turni", () => {
    let s = started();
    const seen = [word(s)];
    for (let i = 0; i < 5; i++) {
      s = g.onHostCommand(s, { type: "skip" }, T0 + 1_000);
      seen.push(word(s));
      s = g.onHostCommand(s, { type: "resume" }, T0 + 1_000);
    }
    expect(new Set(seen).size).toBe(6);
  });

  it("anti-leak: la parola non è nello schermo se spenta, né ai telefoni di chi indovina e degli spettatori, né prima del via", () => {
    const hidden = g.init(reazioneConfigSchema.parse({ ...config, showWordOnScreen: false }), ctx, T0);
    let s = g.onHostCommand(g.onHostCommand(hidden, { type: "pick", giverA: "a", giverB: "b", guesser: "c" }, T0), { type: "begin" }, T0);
    const w = word(s);
    expect(JSON.stringify(g.screenView(s))).not.toContain(w);
    expect(JSON.stringify(g.viewFor(s, "c", null))).not.toContain(w);
    expect(JSON.stringify(g.viewFor(s, "d", null))).not.toContain(w);
    expect(JSON.stringify(g.viewFor(s, "a", null))).toContain(w);
    expect(JSON.stringify(g.viewFor(s, "b", null))).toContain(w);

    // parola nuova caricata ma non ancora data via: nascosta a tutti, regia esclusa
    s = g.onHostCommand(s, { type: "skip" }, T0 + 1_000);
    const next = word(s);
    for (const v of [g.screenView(s), g.viewFor(s, "a", null), g.viewFor(s, "c", null), g.viewFor(s, "d", null)]) {
      expect(JSON.stringify(v)).not.toContain(next);
    }
    expect(JSON.stringify(g.hostView(s).info)).toContain(next);
  });

  it("con lo schermo acceso la parola corrente è visibile solo mentre è data via", () => {
    let s = started();
    expect(g.screenView(s)).toMatchObject({ word: word(s) });
    s = g.onHostCommand(s, { type: "skip" }, T0 + 1_000);
    expect(g.screenView(s)).toMatchObject({ word: null, wordShown: false });
  });

  it("con meno di tre giocatori si può giocare in due o saltare il turno; a fine round tutti sono in classifica", () => {
    const two = g.init(config, { ...ctx, players: players.slice(0, 2) }, T0);
    expect(two.trio.giverB).toBeNull();
    let s = g.onHostCommand(two, { type: "begin" }, T0);
    expect(s.phase).toBe("playing");
    const one = g.init(config, { ...ctx, players: players.slice(0, 1) }, T0);
    expect(g.onHostCommand(one, { type: "begin" }, T0)).toBe(one);
    s = g.onHostCommand(g.onHostCommand(one, { type: "next" }, T0), { type: "next" }, T0);
    expect(g.isFinished(s)).toBe(true);
    expect(g.result(s).ranking).toHaveLength(1);
  });

  it("terminare il round a metà turno assegna comunque i punti già fatti", () => {
    let s = g.onInput(started(), "c", { type: "buzz" }, meta(T0 + 1_000));
    s = g.onHostCommand(s, { type: "correct" }, T0 + 2_000);
    expect(g.scores(s).map((d) => d.points)).toEqual([1, 1, 1]);
  });
});

describe("Reazione a catena: lista di parole condivisa e ordine", () => {
  const list = { typeId: "word-list", title: "Lista", theme: "gameshow" as const, config: { words: ["Alfa", "Beta", "Gamma", "Delta"] } };
  const lookup = (id: string) => (id === "lista" ? list : undefined);
  const build = (raw: unknown) => g.buildConfig!(raw, lookup, { players, teams: [] });
  const orderOf = (s: ReazioneState) => s.order.map((i) => s.cfg.words[i]);

  it("la configurazione riferisce la lista e all'avvio le parole vengono risolte (senza doppioni)", () => {
    const built = build({ wordList: "lista", words: ["gamma", "Epsilon"], order: "listed" });
    expect(built).toMatchObject({ ok: true });
    if (built.ok) expect(built.config.words).toEqual(["Alfa", "Beta", "Gamma", "Delta", "Epsilon"]);
  });

  it("senza lista né parole, o con una lista inesistente, l'avvio è rifiutato con un messaggio", () => {
    expect(g.configSchema).toBeDefined();
    expect(build({ words: [] })).toMatchObject({ ok: false });
    expect(build({ wordList: "boh" })).toMatchObject({ ok: false, error: expect.stringContaining("Lista di parole") });
  });

  it("la stessa lista dà ordini diversi in round diversi (seme) e può essere fissa, inversa o ripartire da un punto", () => {
    const cfg = (extra: object) => {
      const b = build({ wordList: "lista", ...extra });
      if (!b.ok) throw new Error(b.error);
      return b.config;
    };
    const at = (c: ReturnType<typeof cfg>, seed: number) => g.init(c, { ...ctx, seed }, T0);
    expect(orderOf(at(cfg({ order: "listed" }), 1))).toEqual(["Alfa", "Beta", "Gamma", "Delta"]);
    expect(orderOf(at(cfg({ order: "reverse" }), 1))).toEqual(["Delta", "Gamma", "Beta", "Alfa"]);
    expect(orderOf(at(cfg({ order: "listed", startFrom: 3 }), 1))).toEqual(["Gamma", "Delta", "Alfa", "Beta"]);
    expect(orderOf(at(cfg({ order: "listed", startFrom: 7 }), 1))).toEqual(["Gamma", "Delta", "Alfa", "Beta"]); // oltre la fine si riparte
    const seeds = new Set([1, 2, 3, 4, 5, 6].map((seed) => orderOf(at(cfg({}), seed)).join()));
    expect(seeds.size).toBeGreaterThan(1);
    expect(orderOf(at(cfg({}), 9)).sort()).toEqual(["Alfa", "Beta", "Delta", "Gamma"]);
  });
});

describe("Reazione a catena: niente parole già mostrate nei round dopo", () => {
  const cfg = reazioneConfigSchema.parse({ words: ["Alfa", "Beta", "Gamma", "Delta"], order: "listed" });
  const first = (s: ReazioneState) => s.cfg.words[s.order[0]!];

  it("shownItems elenca solo le parole date via davvero, non quella caricata e ancora nascosta", () => {
    let s = g.init(cfg, ctx, T0);
    s = g.onHostCommand(g.onHostCommand(s, { type: "pick", giverA: "a", giverB: "b", guesser: "c" }, T0), { type: "begin" }, T0);
    expect(g.shownItems!(s)).toEqual(["Alfa"]);
    s = g.onHostCommand(s, { type: "skip" }, T0 + 1_000); // Beta caricata, non ancora data via
    expect(g.shownItems!(s)).toEqual(["Alfa"]);
    s = g.onHostCommand(s, { type: "resume" }, T0 + 2_000);
    expect(g.shownItems!(s)).toEqual(["Alfa", "Beta"]);
    s = g.onHostCommand(s, { type: "pause" }, T0 + 3_000);
    s = g.onHostCommand(s, { type: "resume" }, T0 + 4_000); // pausa della regia: non è una parola nuova
    expect(g.shownItems!(s)).toEqual(["Alfa", "Beta"]);
  });

  it("il round dopo parte dalle parole non ancora viste, qualunque sia l'ordine", () => {
    const next = g.init(cfg, { ...ctx, seen: ["alfa", "Beta"] }, T0);
    expect(first(next)).toBe("Gamma");
    expect(next.order.map((i) => next.cfg.words[i])).toEqual(["Gamma", "Delta", "Alfa", "Beta"]);
    const random = g.init({ ...cfg, order: "random" }, { ...ctx, seen: ["Alfa", "Beta", "Gamma"] }, T0);
    expect(first(random)).toBe("Delta");
  });

  it("finite le parole nuove tornano quelle già viste (nessun blocco)", () => {
    const all = g.init(cfg, { ...ctx, seen: ["Alfa", "Beta", "Gamma", "Delta"] }, T0);
    expect(all.order.map((i) => all.cfg.words[i])).toEqual(["Alfa", "Beta", "Gamma", "Delta"]);
  });
});
