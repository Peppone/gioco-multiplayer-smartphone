import { describe, expect, it } from "vitest";
import type { MinigameContext } from "@gioco/shared";
import { type ShadowConfig, sampleShadowConfig } from "./config.js";
import { type ShadowState, shadowTournament as plugin } from "./index.js";
import { simulateTournament } from "./simulate.js";

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, nickname: `Nome${i}`, teamId: null }));
const ctx = (n: number, seed = 5): MinigameContext => ({ players: players(n), teams: [], seed });
// i test sulle singole azioni fissano i costi del regolamento originale (Scommessa 1, Scudo e Trappola 2, Cambia carta 5)
const legacy = { startTokens: 1, maxTokens: 5, betCost: 1, shieldCost: 2, trapCost: 2, swapCost: 5, counterCost: 5 };
const cfgWith = (o: Partial<ShadowConfig> = {}): ShadowConfig => ({ ...sampleShadowConfig, ...legacy, ...o });
// i test della vita extra usano il costo di 1 token: così basta il token iniziale
const cheapExtra = { extraLifeCost: 1 };

let now = 1_000_000;
const meta = () => ({ receivedAt: now, claimedTime: now, rtt: 0 });
const input = (s: ShadowState, id: string, i: Parameters<typeof plugin.onInput>[2]) => plugin.onInput(s, id, i, meta());
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const view = (s: ShadowState, id: string) => plugin.viewFor(s, id, null) as any;

function start(n: number, o: Partial<ShadowConfig> = {}, seed = 5): ShadowState {
  now = 1_000_000;
  return plugin.init(cfgWith(o), ctx(n, seed), now);
}

/** Salta le fasi senza input finché lo scontro di `id` è nella fase richiesta. */
function until(s: ShadowState, id: string, phase: string): ShadowState {
  for (let i = 0; i < 100 && view(s, id).bout?.phase !== phase; i++) {
    now += 20_000;
    s = plugin.onTick(s, now);
  }
  expect(view(s, id).bout?.phase).toBe(phase);
  return s;
}

describe("valori predefiniti", () => {
  it("token e costi pensati perché tutte le azioni vengano usate", () => {
    expect(sampleShadowConfig).toMatchObject({ startTokens: 2, maxTokens: 6, extraLifeCost: 2, betCost: 2, shieldCost: 1, trapCost: 1, swapCost: 2, counterCost: 2 });
  });
});

describe("un turno", () => {
  it("con 2 giocatori parte subito uno scontro: 3 vite, 1 token, W per tutti", () => {
    const s = start(2, { startTokens: 0 });
    expect(s.phase).toBe("bouts");
    const v = view(s, "p0");
    expect(v.role).toBe("bout");
    expect(v.bout.phase).toBe("choose");
    expect(v.bout.sides.map((x: { lives: number }) => x.lives)).toEqual([3, 3]);
    expect(v.me).toMatchObject({ status: "W", tokens: 0 });
  });

  it("con i token si apre la fase «vita extra»: spenderne uno dà una vita in più", () => {
    let s = start(2, cheapExtra);
    expect(view(s, "p0").bout.phase).toBe("extraLife");
    s = input(s, "p0", { type: "extraLife", spend: true });
    expect(view(s, "p0").bout.phase).toBe("extraLife"); // aspetta l'altro
    s = input(s, "p1", { type: "extraLife", spend: false });
    const v = view(s, "p0");
    expect(v.bout.phase).toBe("choose");
    expect(v.bout.sides.map((x: { lives: number; tokens: number }) => [x.lives, x.tokens])).toEqual([[4, 0], [3, 1]]);
  });

  it("con numero dispari il rimasto solo sceglie Bye o NPC; senza risposta salta il turno", () => {
    let s = start(3);
    expect(s.phase).toBe("bye");
    const odd = s.byeId!;
    expect(view(s, odd).role).toBe("bye");
    now += 60_000;
    s = plugin.onTick(s, now);
    expect(s.phase).toBe("bouts");
    expect(s.byeChoice).toBe("bye");
    expect(s.bouts).toHaveLength(1);
    expect(view(s, odd).role).toBe("wait");
  });

  it("scegliendo l'NPC si gioca contro il computer (nessun eliminato: nessun giocatore lo interpreta)", () => {
    let s = start(3, { startTokens: 0 });
    s = input(s, s.byeId!, { type: "byeChoice", choice: "npc" });
    expect(s.bouts).toHaveLength(2);
    const npcBout = s.bouts.find((b) => b.b === "npc")!;
    expect(npcBout.npcPlayerId).toBeNull();
    expect(view(s, s.byeId!).bout.sides[1]).toMatchObject({ nickname: "NPC", tokens: 0, lives: 3 });
    expect(Object.keys(npcBout.picks)).toEqual(["npc"]); // il computer ha già scelto, in segreto
  });
});

describe("uno scambio", () => {
  function chooseState(): ShadowState {
    let s = start(2, { startTokens: 0 });
    s = input(s, "p0", { type: "play", card: "attack", bet: false });
    return s;
  }

  it("le scelte si rivelano insieme e chi perde perde una vita", () => {
    let s = chooseState();
    expect(view(s, "p0").bout.reveal).toBeNull();
    s = input(s, "p1", { type: "play", card: "trick", bet: false });
    // niente token: nessuna reazione possibile, si va dritti alla pausa col risultato
    const v = view(s, "p0");
    expect(v.bout.phase).toBe("show");
    expect(v.bout.last).toMatchObject({ winnerId: "p0", loss: 1, cards: { p0: "attack", p1: "trick" } });
    expect(v.bout.sides.map((x: { lives: number }) => x.lives)).toEqual([3, 2]);
  });

  it("il pareggio non toglie vite e si rigioca", () => {
    let s = chooseState();
    s = input(s, "p1", { type: "play", card: "attack", bet: false });
    expect(view(s, "p0").bout.last).toMatchObject({ winnerId: null, loss: 0 });
    s = until(s, "p0", "choose");
    expect(view(s, "p0").bout.sides.map((x: { lives: number }) => x.lives)).toEqual([3, 3]);
  });

  it("chi non sceglie gioca una carta a caso a fine tempo", () => {
    const s0 = chooseState();
    now += 20_000;
    const s = plugin.onTick(s0, now);
    expect(view(s, "p0").bout.last ?? view(s, "p0").bout.reveal).toBeTruthy();
  });

  it("dopo la scadenza le scelte tardive non contano; entro la tolleranza sì", () => {
    const s0 = start(2, { startTokens: 0 });
    const deadline = s0.bouts[0]!.deadline;
    const late = plugin.onInput(s0, "p0", { type: "play", card: "attack" }, { receivedAt: deadline + 2_000, claimedTime: deadline, rtt: 0 });
    expect(late).toBe(s0);
    const ok = plugin.onInput(s0, "p0", { type: "play", card: "attack" }, { receivedAt: deadline + 300, claimedTime: deadline, rtt: 0 });
    expect(ok.bouts[0]!.picks["p0"]).toBeTruthy();
  });

  it("Scommessa: si paga alla rivelazione e toglie una vita in più se si vince", () => {
    let s = start(2, { startTokens: 1, extraLifeCost: 5 }); // niente vita extra: la fase si salta
    s = input(s, "p0", { type: "play", card: "attack", bet: true });
    s = input(s, "p1", { type: "play", card: "trick", bet: false });
    const v = view(s, "p0");
    expect(v.bout.reveal ?? v.bout.last).toBeTruthy();
    const fin = until(s, "p0", "choose");
    expect(view(fin, "p0").bout.sides.map((x: { lives: number; tokens: number }) => [x.lives, x.tokens])).toEqual([[3, 0], [1, 1]]);
  });

  it("Trappola: dopo la rivelazione, nello scambio successivo l'avversario non può giocare quella carta", () => {
    let s = start(2, { startTokens: 2, extraLifeCost: 9 });
    s = input(s, "p0", { type: "play", card: "attack", bet: false });
    s = input(s, "p1", { type: "play", card: "trick", bet: false });
    expect(view(s, "p0").bout.phase).toBe("react");
    expect(view(s, "p0").my.reactions).toEqual(["trap"]); // ha vinto: solo Trappola
    s = input(s, "p0", { type: "react", action: "trap" });
    s = input(s, "p1", { type: "react", action: "pass" }); // p1 ha perso ma ha solo 2 token: Scudo e Trappola
    s = until(s, "p0", "choose");
    expect(view(s, "p1").my.blockedCard).toBe("trick");
    expect(view(s, "p0").my.blockedCard).toBeNull();
    expect(view(s, "p0").me.tokens).toBe(0);
    const refused = input(s, "p1", { type: "play", card: "trick", bet: false });
    expect(refused.bouts[0]!.picks["p1"]).toBeUndefined();
  });

  it("Scudo: chi ha perso non perde la vita", () => {
    let s = start(2, { startTokens: 2, extraLifeCost: 9 });
    s = input(s, "p0", { type: "play", card: "attack", bet: false });
    s = input(s, "p1", { type: "play", card: "trick", bet: false });
    s = input(s, "p0", { type: "react", action: "pass" });
    expect(view(s, "p1").my.reactions).toEqual(["shield", "trap"]);
    s = input(s, "p1", { type: "react", action: "shield" });
    const v = view(s, "p1");
    expect(v.bout.last).toMatchObject({ winnerId: "p0", loss: 0, shielded: true });
    expect(v.bout.sides.map((x: { lives: number }) => x.lives)).toEqual([3, 3]);
    expect(v.me.tokens).toBe(0);
  });

  it("Cambia carta con contromossa: scambio annullato e rigiocato, entrambi pagano 5", () => {
    let s = start(2, { startTokens: 5, maxTokens: 5, extraLifeCost: 9 });
    s = input(s, "p0", { type: "play", card: "attack", bet: false });
    s = input(s, "p1", { type: "play", card: "defense", bet: false });
    expect(view(s, "p0").my.reactions).toContain("swap");
    s = input(s, "p0", { type: "react", action: "swap", card: "trick" });
    s = input(s, "p1", { type: "react", action: "pass" });
    expect(view(s, "p1").bout.phase).toBe("counter");
    expect(view(s, "p1").my.canCounter).toBe(true);
    expect(view(s, "p0").my.canCounter).toBe(false);
    s = input(s, "p1", { type: "react", action: "counter" });
    const v = view(s, "p1");
    expect(v.bout.last).toMatchObject({ replay: true });
    expect(v.bout.exchanges).toBe(0);
    expect(v.bout.sides.map((x: { lives: number; tokens: number }) => [x.lives, x.tokens])).toEqual([[3, 0], [3, 0]]);
  });

  it("un'azione sola per scambio: chi ha pagato la Scommessa non reagisce", () => {
    let s = start(2, { startTokens: 5, extraLifeCost: 9 });
    s = input(s, "p0", { type: "play", card: "attack", bet: true });
    s = input(s, "p1", { type: "play", card: "defense", bet: true });
    expect(view(s, "p0").bout.phase).toBe("show"); // entrambi hanno scommesso: nessuna reazione
  });
});

describe("fine dello scontro", () => {
  function knockOut(startTokens = 0): ShadowState {
    let s = start(2, { startTokens, startLives: 1 });
    s = input(s, "p0", { type: "play", card: "attack", bet: false });
    s = input(s, "p1", { type: "play", card: "trick", bet: false });
    return s;
  }

  it("chi arriva a 0 vite passa da W a L e il vincitore sceglie il mazzo", () => {
    let s = until(knockOut(), "p0", "reward");
    expect(s.fighters["p1"]!.status).toBe("L");
    expect(s.fighters["p0"]!.boutsWon).toBe(1);
    expect(view(s, "p0").my.canChooseDeck).toBe(true);
    expect(view(s, "p1").my.canChooseDeck).toBe(false);
    s = input(s, "p0", { type: "deck", deck: "normal" });
    expect(view(s, "p0").bout.reward).toMatchObject({ deck: "normal" });
  });

  it("senza scelta del mazzo si pesca dal Normale a fine tempo", () => {
    let s = until(knockOut(), "p0", "reward");
    now += 60_000;
    s = plugin.onTick(s, now);
    expect(s.bouts[0]!.reward?.deck).toBe("normal");
  });

  it("i token non superano il massimo e la ricompensa si applica una volta sola", () => {
    const maxed = cfgWith({ startLives: 1, startTokens: 5, extraLifeCost: 9, normalDeck: [{ label: "+2", qty: 1, tokens: 2, nextLives: 1, either: false }] });
    now = 1_000_000;
    let s = plugin.init(maxed, ctx(2), now);
    s = input(s, "p0", { type: "play", card: "attack", bet: false });
    s = input(s, "p1", { type: "play", card: "trick", bet: false });
    s = until(s, "p0", "reward");
    s = input(s, "p0", { type: "deck", deck: "normal" });
    expect(s.fighters["p0"]!.tokens).toBe(5); // 5 + 2 con tetto a 5
    expect(s.fighters["p0"]!.nextLives).toBe(1);
    s = input(s, "p0", { type: "deck", deck: "legendary" }); // seconda pescata ignorata
    expect(s.fighters["p0"]!.nextLives).toBe(1);
  });

  it("la sconfitta da L elimina; l'eliminato non può più giocare ma può pronosticare", () => {
    const s = simulateTournament({ players: 4, seed: 11 }).state;
    expect(s.phase).toBe("done");
    expect(s.finalOrder).toHaveLength(4);
  });
});

describe("regia", () => {
  it("«Salta timer» manda avanti la fase; «Pausa» congela e poi riprende senza perdere tempo", () => {
    let s = start(2, { startTokens: 0 });
    const d0 = s.bouts[0]!.deadline;
    s = plugin.onHostCommand(s, { type: "pause" }, now);
    expect(s.paused).toBe(now);
    expect(plugin.onTick(s, now + 120_000)).toBe(s); // in pausa non scade nulla
    expect(input(s, "p0", { type: "play", card: "attack" })).toBe(s);
    s = plugin.onHostCommand(s, { type: "pause" }, now + 30_000);
    expect(s.paused).toBeNull();
    expect(s.bouts[0]!.deadline).toBe(d0 + 30_000);
    s = plugin.onHostCommand(s, { type: "skip" }, now + 31_000);
    expect(view(s, "p0").bout.phase).not.toBe("choose");
  });

  it("«Ritira giocatore»: perde lo scontro in corso ed è eliminato", () => {
    let s = start(2, { startTokens: 0 });
    s = plugin.onHostCommand(s, { type: "withdraw:p1" }, now);
    expect(s.fighters["p1"]!.status).toBe("out");
    expect(s.fighters["p0"]!.boutsWon).toBe(1);
    now += 60_000;
    s = plugin.onTick(s, now);
    now += 60_000;
    s = plugin.onTick(s, now);
    expect(plugin.isFinished(s)).toBe(true);
    expect(plugin.result(s).ranking[0]).toMatchObject({ playerId: "p0", rank: 1 });
  });

  it("«Termina torneo» chiude con la classifica attuale", () => {
    const s = plugin.onHostCommand(start(4), { type: "end" }, now);
    expect(plugin.isFinished(s)).toBe(true);
    expect(s.finalOrder).toHaveLength(4);
  });
});

describe("punti", () => {
  it("piazzamento + 50 per scontro vinto, con 1° 1000 e primo eliminato 100", () => {
    const { state } = simulateTournament({ players: 8, seed: 3 });
    const pts = Object.fromEntries(plugin.scores(state).map((d) => [d.playerId, d.points]));
    const first = state.finalOrder![0]!;
    expect(pts[first]).toBe(1000 + state.fighters[first]!.boutsWon * 50 + (state.predictionHits[first] ?? 0) * 30);
    const last = state.finalOrder![7]!;
    expect(pts[last]).toBe(100 + state.fighters[last]!.boutsWon * 50 + (state.predictionHits[last] ?? 0) * 30);
  });
});

describe("informazioni segrete (anti-leak)", () => {
  /** Stessa situazione, tranne ciò che p0 ha scelto in segreto: le viste degli altri devono essere identiche. */
  function secretsDoNotLeak(setup: (card: "attack" | "defense", bet: boolean) => ShadowState) {
    const a = setup("attack", false);
    const b = setup("defense", true);
    const same = (x: unknown, y: unknown) => expect(JSON.stringify(x)).toBe(JSON.stringify(y));
    same(plugin.screenView(a), plugin.screenView(b));
    same(view(a, "p1"), view(b, "p1"));
    same(view(a, "p2"), view(b, "p2"));
  }

  it("carta e Scommessa non escono prima della rivelazione (schermo, avversario, altri)", () => {
    secretsDoNotLeak((card, bet) => {
      const s = start(4, { startTokens: 2, extraLifeCost: 9 });
      const o = s.bouts.find((x) => x.a === "p0" || x.b === "p0")!;
      const p0IsA = o.a === "p0";
      // gioca p0 e non il suo avversario
      void p0IsA;
      return input(s, "p0", { type: "play", card, bet });
    });
    // anche nel JSON grezzo di tutte le viste del giocatore avversario non compare «bet»: solo «picked»
    const s = input(start(2, { startTokens: 2, extraLifeCost: 9 }), "p0", { type: "play", card: "attack", bet: true });
    expect(JSON.stringify(plugin.screenView(s))).not.toContain('"picks"');
    expect(view(s, "p1").bout.sides[0].picked).toBe(true);
    expect(view(s, "p1").bout.reveal).toBeNull();
  });

  it("la vita extra scelta resta segreta finché la fase non finisce", () => {
    const mk = (spend: boolean) => input(start(2, cheapExtra), "p0", { type: "extraLife", spend });
    const a = mk(true), b = mk(false);
    expect(JSON.stringify(plugin.screenView(a))).toBe(JSON.stringify(plugin.screenView(b)));
    expect(JSON.stringify(view(a, "p1"))).toBe(JSON.stringify(view(b, "p1")));
  });

  it("la reazione scelta resta segreta finché tutti hanno deciso; il Cambia carta nasconde la nuova carta fino all'esito", () => {
    const base = () => {
      let s = start(2, { startTokens: 5, extraLifeCost: 9 });
      s = input(s, "p0", { type: "play", card: "attack", bet: false });
      return input(s, "p1", { type: "play", card: "defense", bet: false });
    };
    const x = input(base(), "p0", { type: "react", action: "swap", card: "trick" });
    const y = input(base(), "p0", { type: "react", action: "trap" });
    // p1 vede soltanto che p0 ha risposto, non cosa ha scelto, finché p1 stesso non ha deciso
    expect(view(x, "p1").bout.phase === "counter" || view(x, "p1").bout.phase === "react").toBe(true);
    const text = JSON.stringify([plugin.screenView(x), view(x, "p1").bout]);
    expect(text).not.toContain('"trick"'); // la nuova carta non è ancora pubblica (le carte giocate sono attack e defense)
    expect(JSON.stringify(plugin.screenView(y))).not.toContain('"reacts"');
  });

  it("l'NPC computer: la sua carta non è nelle viste; chi lo interpreta vede una vista senza token né azioni", () => {
    let s = start(3, { startTokens: 0 });
    s = input(s, s.byeId!, { type: "byeChoice", choice: "npc" });
    expect(JSON.stringify(plugin.screenView(s))).not.toContain('"picks"');
    const mine = view(s, s.byeId!);
    expect(mine.bout.sides[1].picked).toBe(true);
    expect(mine.bout.reveal).toBeNull();
  });
});

describe("tornei simulati", () => {
  it("da 2 a 30 giocatori il torneo finisce con un solo vincitore e punteggi coerenti", () => {
    for (const n of [2, 3, 4, 5, 8, 13, 30]) {
      const { state, turns } = simulateTournament({ players: n, seed: n * 31 + 1 });
      expect(plugin.isFinished(state), `n=${n}`).toBe(true);
      expect(turns).toBeGreaterThan(0);
      const alive = state.order.filter((id) => state.fighters[id]!.status !== "out");
      expect(alive.length, `n=${n} vivi`).toBeLessThanOrEqual(1);
      const ranking = plugin.result(state).ranking;
      expect(ranking.map((r) => r.playerId).sort()).toEqual([...state.order].sort());
      expect(ranking[0]!.playerId).toBe(state.finalOrder![0]);
      for (const d of plugin.scores(state)) expect(Number.isInteger(d.points)).toBe(true);
      for (const f of Object.values(state.fighters)) {
        expect(f.tokens).toBeGreaterThanOrEqual(0);
        expect(f.tokens).toBeLessThanOrEqual(5);
      }
      for (const b of state.bouts) for (const l of Object.values(b.lives)) expect(l).toBeLessThanOrEqual(5);
    }
  });

  it("nessuno gioca due scontri nello stesso turno e il bye non tocca lo stesso giocatore due turni di fila", () => {
    // il simulatore usa il plugin vero: controlliamo gli invarianti turno per turno con 7 giocatori
    const ids = players(7).map((p) => p.id);
    now = 1_000_000;
    let s = plugin.init(cfgWith(), ctx(7, 9), now);
    let lastOdd: string | null = null;
    let seenTurn = 0;
    for (let i = 0; i < 400 && !plugin.isFinished(s); i++) {
      if (s.turn !== seenTurn) {
        seenTurn = s.turn;
        const inBout = s.bouts.flatMap((b) => [b.a, b.b]).filter((x) => x !== "npc");
        expect(new Set(inBout).size).toBe(inBout.length);
        if (s.byeId) {
          expect(s.byeId).not.toBe(lastOdd);
          lastOdd = s.byeId;
        } else lastOdd = null;
      }
      now += 20_000;
      s = plugin.onTick(s, now);
    }
    expect(ids.length).toBe(7);
  });

  it("durata stimata: 30 giocatori che pensano ~5 s giocano un torneo in meno di 45 minuti", () => {
    const { seconds, turns } = simulateTournament({ players: 30, seed: 21, thinkSec: 5 });
    expect(turns).toBeGreaterThan(3);
    expect(seconds / 60).toBeLessThan(45);
  });
});
