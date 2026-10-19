import { describe, expect, it } from "vitest";
import { GRACE_MS } from "../util.js";
import { STRIKE_SPEEDUP, artificieri as plugin, fakeRemaining, realDeadline, teamPoints } from "./index.js";
import { buildManual } from "./bomb.js";
import { type ButtonData, type ButtonRules, buttonMode, releaseOk } from "./modules/button.js";
import { assignPages, formTeams, nextDefuser, tooSmallTeams } from "./turns.js";
import { makeRng } from "../knight-duel/rng.js";
import { type S, T0, only, TEAMS, ctxFor, findSeed, host, input, midSecondWithDigit, roster, solutionOf, solveModule, start, strikeAt, timeFor, toDefuse, toDefuseFrom } from "./test-helpers.js";

describe("squadre, turni e avvio", () => {
  it("le squadre sono i team della serata (per nome) e il primo turno comincia dalle scommesse", () => {
    const s = start(7);
    expect(s.teams.map((t) => t.id)).toEqual(["ta", "tb"]);
    expect(s.queue.map((q) => q.teamId)).toEqual(["ta", "tb"]);
    expect(s.phase).toBe("bet");
    expect(s.phaseEndsAt).toBe(T0 + 15_000);
    expect(s.bomb!.teamId).toBe("ta");
    expect(["a1", "a2", "a3"]).toContain(s.bomb!.defuserId);
    expect(s.bomb!.modules).toHaveLength(4);
  });

  it("è deterministico: stesso seme, stesso stato; l'artificiere di ogni squadra ruota tra i turni", () => {
    expect(JSON.stringify(start(5))).toBe(JSON.stringify(start(5)));
    expect(JSON.stringify(start(5))).not.toBe(JSON.stringify(start(6)));
    const s = start(3, { bombsPerTeam: 3 });
    expect(s.queue.map((q) => q.teamId)).toEqual(["ta", "tb", "ta", "tb", "ta", "tb"]);
    for (const id of ["ta", "tb"]) {
      const defusers = s.queue.filter((q) => q.teamId === id).map((q) => q.defuserId);
      expect(new Set(defusers).size).toBe(3);
    }
  });

  it("senza scommesse, o senza altre squadre, si parte dal briefing", () => {
    expect(start(1, { betSeconds: 0 }).phase).toBe("briefing");
    const solo = start(1, {}, ctxFor(1, { players: roster(3, "ta", "a"), teams: [TEAMS[0]!] }));
    expect(solo.phase).toBe("briefing");
    expect(solo.queue).toHaveLength(1);
  });

  it("i giocatori senza team non giocano la bomba ma scommettono", () => {
    const players = [...roster(3, "ta", "a"), ...roster(3, "tb", "b"), ...roster(2, null, "s")];
    const s = start(2, {}, ctxFor(2, { players }));
    expect(s.teams.flatMap((t) => t.members).sort()).toEqual(["a1", "a2", "a3", "b1", "b2", "b3"]);
    expect(s.players).toContain("s1");
    const out = input(s, "s1", { type: "bet", outcome: "exploded" }, T0 + 100);
    expect(out.bets).toEqual({ s1: "exploded" });
  });

  it("senza team la serata si divide in squadre da 3–5 giocatori", () => {
    const sizes = (n: number) => formTeams(roster(n, null, "p"), [], makeRng(9)).map((t) => t.members.length).sort();
    expect(sizes(2)).toEqual([2]);
    expect(sizes(5)).toEqual([5]);
    expect(sizes(7)).toEqual([3, 4]);
    expect(sizes(12)).toEqual([4, 4, 4]);
    expect(sizes(30)).toEqual([5, 5, 5, 5, 5, 5]);
    expect(formTeams([], [], makeRng(1))).toEqual([]);
    const s = start(4, {}, ctxFor(4, { players: roster(8, null, "p"), teams: [] }));
    expect(s.teams).toHaveLength(2);
  });

  it("buildConfig rifiuta un team con un solo giocatore e accetta il resto", () => {
    const players = [...roster(3, "ta", "a"), ...roster(1, "tb", "b")];
    expect(tooSmallTeams(players, TEAMS).map((t) => t.id)).toEqual(["tb"]);
    const bad = plugin.buildConfig!({}, () => undefined, { players, teams: TEAMS });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.error).toContain("Beta");
    expect(plugin.buildConfig!({}, () => undefined, { players: ctxFor(1).players, teams: TEAMS }).ok).toBe(true);
    expect(plugin.buildConfig!({}, () => undefined, { players: [], teams: [] }).ok).toBe(true);
    expect(plugin.buildConfig!({ modules: 99 }, () => undefined, { players: [], teams: [] }).ok).toBe(false);
    expect(plugin.buildConfig!({ enabledModules: only() }, () => undefined, { players: [], teams: [] }).ok).toBe(false);
  });

  it("il manuale è diviso: ogni pagina ad almeno un esperto, nessun esperto a mani vuote", () => {
    for (const experts of [1, 2, 3, 5, 9]) {
      for (const pages of [1, 4, 6]) {
        const ids = Array.from({ length: experts }, (_, i) => `e${i}`);
        const out = assignPages(pages, ids, makeRng(experts * 31 + pages));
        expect(new Set(Object.values(out).flat())).toEqual(new Set(Array.from({ length: pages }, (_, i) => i)));
        expect(Object.values(out).every((p) => p.length > 0)).toBe(true);
      }
    }
    expect(assignPages(5, [], makeRng(1))).toEqual({});
    const s = start(11);
    const all = buildManual(s.bomb!.rules).map((p) => p.id);
    expect(new Set(Object.values(s.bomb!.pages).flat())).toEqual(new Set(all));
    expect(Object.keys(s.bomb!.pages).sort()).toEqual(["a1", "a2", "a3"].filter((id) => id !== s.bomb!.defuserId));
  });
});

describe("scommesse", () => {
  it("scommettono solo le altre squadre, l'ultima scelta vale e con tutte le scommesse si passa al briefing", () => {
    const s = start(2);
    const own = s.bomb!.defuserId;
    expect(input(s, own, { type: "bet", outcome: "defused" }, T0 + 10)).toBe(s);
    expect(input(s, "estraneo", { type: "bet", outcome: "defused" }, T0 + 10)).toBe(s);
    let cur = input(s, "b1", { type: "bet", outcome: "defused" }, T0 + 100);
    expect(cur.bets).toEqual({ b1: "defused" });
    expect(input(cur, "b1", { type: "bet", outcome: "defused" }, T0 + 200)).toBe(cur);
    cur = input(cur, "b1", { type: "bet", outcome: "exploded" }, T0 + 300);
    expect(cur.bets).toEqual({ b1: "exploded" });
    cur = input(cur, "b2", { type: "bet", outcome: "defused" }, T0 + 400);
    expect(cur.phase).toBe("bet");
    cur = input(cur, "b3", { type: "bet", outcome: "defused" }, T0 + 500);
    expect(cur.phase).toBe("briefing");
    // fuori fase la scommessa non conta
    expect(input(cur, "b1", { type: "bet", outcome: "defused" }, T0 + 600)).toBe(cur);
  });

  it("il tempo delle scommesse scade (con la tolleranza) e le scommesse in ritardo non contano", () => {
    const s = start(2);
    expect(plugin.onTick(s, T0 + 14_999)).toBe(s);
    expect(input(s, "b1", { type: "bet", outcome: "defused" }, T0 + 15_000 + GRACE_MS + 1)).toBe(s);
    expect(plugin.onTick(s, T0 + 15_000).phase).toBe("briefing");
  });

  it("le scommesse restano segrete finché il turno non finisce: dopo si vede chi ha indovinato", () => {
    let s = start(2);
    s = input(s, "b1", { type: "bet", outcome: "defused" }, T0 + 10);
    s = input(s, "b2", { type: "bet", outcome: "exploded" }, T0 + 20);
    s = plugin.onTick(s, T0 + 16_000);
    s = host(host(s, "start", T0 + 17_000), "explode", T0 + 18_000);
    expect(s.phase).toBe("outcome");
    const last = s.history.at(-1)!;
    expect(last.betWinners).toEqual(["b2"]);
    expect(last.bets).toEqual({ b1: "defused", b2: "exploded" });
  });
});

describe("input sulla bomba", () => {
  it("solo l'artificiere, solo in disinnesco, solo da chi è in serata, solo su moduli esistenti", () => {
    const s = start(3, { betSeconds: 0 });
    const b = s.bomb!;
    const mod = b.modules[0]!;
    const act = solutionOf(s, mod).actions[0]!;
    const experts = Object.keys(b.pages);
    // briefing: la bomba non si tocca
    expect(input(s, b.defuserId, { ...act, module: mod.id }, T0 + 100)).toBe(s);
    expect(input(s, experts[0]!, { type: "start" }, T0 + 100)).toBe(s);
    expect(input(s, "b1", { type: "start" }, T0 + 100)).toBe(s);
    const d = toDefuse(s);
    const a = { ...act, module: mod.id };
    for (const who of [...experts, "b1", "b2", "estraneo"]) expect(input(d, who, a, T0 + 2000), who).toBe(d);
    expect(input(d, b.defuserId, { ...act, module: 5 }, T0 + 2000)).toBe(d);
    expect(input(d, b.defuserId, { type: "bet", outcome: "defused" }, T0 + 2000)).toBe(d);
    // un'azione di un altro tipo di modulo non conta
    const foreign = mod.kind === "wires" ? { type: "tap", module: mod.id } : { type: "cut", module: mod.id, wire: 0 };
    expect(input(d, b.defuserId, foreign, T0 + 2000)).toBe(d);
  });

  it("«select» sceglie il modulo mostrato dalla TV, senza cambiare lo stato se è già scelto", () => {
    const d = toDefuse(start(3, { betSeconds: 0 }));
    const sel = input(d, d.bomb!.defuserId, { type: "select", module: 2 }, T0 + 2000);
    expect(sel.bomb!.selected).toBe(2);
    expect(input(sel, d.bomb!.defuserId, { type: "select", module: 2 }, T0 + 2100)).toBe(sel);
  });

  it("disinnescare tutti i moduli chiude il turno con la bomba disinnescata e i punti giusti", () => {
    let s = start(4, { betSeconds: 0 });
    s = toDefuse(s);
    const at = T0 + 20_000;
    for (const mod of s.bomb!.modules) s = solveModule(s, s.bomb!.modules[mod.id]!, at);
    expect(s.phase).toBe("outcome");
    expect(s.bomb!.outcome).toMatchObject({ result: "defused", reason: "all-solved" });
    const e = s.history[0]!;
    expect(e).toMatchObject({ outcome: "defused", solved: 4, strikes: 0 });
    // l'ultima azione è all'istante `at` o dopo (il rilascio del pulsante): restano meno di 300 s
    expect(e.secondsLeft).toBeGreaterThan(200);
    expect(e.secondsLeft).toBeLessThanOrEqual(281);
    const expected = 50 * 4 + 200 + e.secondsLeft;
    expect(teamPoints(s.cfg, e)).toBe(expected);
    const totals = Object.fromEntries(plugin.scores(s).map((d) => [d.playerId, d.points]));
    expect(totals).toEqual({ a1: expected, a2: expected, a3: expected });
  });

  it("gli esperti non muovono nulla e un modulo già disinnescato non reagisce più", () => {
    let s = toDefuse(start(4, { betSeconds: 0 }));
    const mod = s.bomb!.modules[0]!;
    s = solveModule(s, mod, T0 + 5000);
    if (s.phase === "outcome") return;
    const solved = s.bomb!.modules[0]!;
    expect(solved.solved).toBe(true);
    const again = input(s, s.bomb!.defuserId, { ...solutionOf(s, mod).actions[0]!, module: 0 }, T0 + 5100);
    expect(again).toBe(s);
  });
});

describe("errori e timer", () => {
  it("ogni errore accelera il timer del 25% e a maxStrikes la bomba esplode", () => {
    let s = toDefuse(start(5, { betSeconds: 0 }));
    const t1 = T0 + 11_000;
    s = strikeAt(s, t1);
    expect(s.bomb!.strikes).toBe(1);
    expect(s.bomb!.speed).toBe(1 + STRIKE_SPEEDUP);
    // rimanevano 290 s (T0+1000 → T0+11 000): da qui scorrono a 1,25×
    expect(s.bomb!.clock).toEqual({ at: t1, remainingMs: 290_000 });
    expect(fakeRemaining(s.bomb!, t1 + 10_000)).toBe(290_000 - 12_500);
    expect(realDeadline(s.bomb!)).toBe(t1 + 290_000 / 1.25);
    s = strikeAt(s, t1 + 2000);
    expect(s.bomb!.speed).toBe(1.5);
    expect(s.phase).toBe("defuse");
    s = strikeAt(s, t1 + 3000);
    expect(s.phase).toBe("outcome");
    expect(s.bomb!.outcome).toMatchObject({ result: "exploded", reason: "strikes" });
    expect(s.history[0]).toMatchObject({ outcome: "exploded", strikes: 3, secondsLeft: 0 });
  });

  it("senza accelerazione la velocità resta 1, e maxStrikes 1 fa esplodere al primo errore", () => {
    let s = toDefuse(start(5, { betSeconds: 0, speedUpOnStrike: false, maxStrikes: 2 }));
    s = strikeAt(s, T0 + 3000);
    expect(s.bomb!.speed).toBe(1);
    expect(s.bomb!.strikes).toBe(1);
    const one = toDefuse(start(5, { betSeconds: 0, maxStrikes: 1 }));
    expect(strikeAt(one, T0 + 3000).phase).toBe("outcome");
  });

  it("a timer scaduto la bomba esplode dopo la tolleranza, non prima", () => {
    const s = toDefuse(start(6, { betSeconds: 0, seconds: 60 }));
    const deadline = realDeadline(s.bomb!);
    expect(deadline).toBe(T0 + 1000 + 60_000);
    expect(plugin.onTick(s, deadline + GRACE_MS - 1)).toBe(s);
    const out = plugin.onTick(s, deadline + GRACE_MS);
    expect(out.phase).toBe("outcome");
    expect(out.bomb!.outcome).toMatchObject({ result: "exploded", reason: "time", secondsLeft: 0 });
  });

  it("l'accelerazione anticipa la scadenza", () => {
    let s = toDefuse(start(6, { betSeconds: 0, seconds: 100 }));
    s = strikeAt(s, T0 + 11_000);
    // 90 s finti rimasti a 1,25×: scadenza dopo 72 s reali
    expect(realDeadline(s.bomb!)).toBe(T0 + 11_000 + 72_000);
    expect(plugin.onTick(s, T0 + 11_000 + 71_000 + GRACE_MS)).toBe(s);
    expect(plugin.onTick(s, T0 + 11_000 + 72_000 + GRACE_MS).phase).toBe("outcome");
  });

  it("un'azione in tempo che arriva entro la tolleranza vale; una dichiarata dopo la scadenza no", () => {
    const base = toDefuse(start(7, { betSeconds: 0, seconds: 60, modules: 3, enabledModules: only("wires") }));
    let s = base;
    const mods = s.bomb!.modules;
    for (const m of mods.slice(0, -1)) s = solveModule(s, s.bomb!.modules[m.id]!, T0 + 5000);
    const last = s.bomb!.modules.at(-1)!;
    const act = { ...solutionOf(s, last).actions[0]!, module: last.id };
    const deadline = realDeadline(s.bomb!);
    // premuto un istante prima della scadenza, arrivato 300 ms dopo (rete lenta): vale
    const inTime = input(s, s.bomb!.defuserId, act, deadline + 300, deadline - 50, 800);
    expect(inTime.bomb!.outcome).toMatchObject({ result: "defused" });
    // dichiarato dopo la scadenza (e arrivato in ritardo) no: poi la bomba esplode
    expect(input(s, s.bomb!.defuserId, act, deadline + 300, deadline + 100, 50)).toBe(s);
    // oltre la tolleranza non si accetta più nulla
    expect(input(s, s.bomb!.defuserId, act, deadline + GRACE_MS + 1, deadline - 100, 5000)).toBe(s);
  });

  it("pausa e ripresa: il timer si ferma e riparte da dove era, e in pausa le azioni non contano", () => {
    let s = toDefuse(start(8, { betSeconds: 0 }));
    s = host(s, "pause", T0 + 11_000);
    expect(s.pausedRemainingMs).toBe(290_000);
    expect(plugin.onTick(s, T0 + 10_000_000)).toBe(s);
    const mod = s.bomb!.modules[0]!;
    expect(input(s, s.bomb!.defuserId, { ...solutionOf(s, mod).actions[0]!, module: 0 }, T0 + 12_000)).toBe(s);
    expect(host(s, "pause", T0 + 12_000)).toBe(s);
    s = host(s, "resume", T0 + 61_000);
    expect(s.pausedRemainingMs).toBeNull();
    expect(s.bomb!.clock).toEqual({ at: T0 + 61_000, remainingMs: 290_000 });
    expect(host(s, "resume", T0 + 62_000)).toBe(s);
  });

  it("la pausa ferma anche il tempo delle scommesse", () => {
    let s = start(8);
    s = host(s, "pause", T0 + 5000);
    expect(s.pausedRemainingMs).toBe(10_000);
    expect(plugin.onTick(s, T0 + 999_999)).toBe(s);
    expect(input(s, "b1", { type: "bet", outcome: "defused" }, T0 + 6000)).toBe(s);
    s = host(s, "resume", T0 + 50_000);
    expect(s.phaseEndsAt).toBe(T0 + 60_000);
  });
});

describe("pulsante con latenza simulata", () => {
  const over = { betSeconds: 0, modules: 3, enabledModules: only("button") };
  const holdSeed = findSeed(over, (s) => s.bomb!.modules.some((m) => buttonMode(m.data as ButtonData, s.bomb!.rules.button as ButtonRules, s.bomb!.edgework) === "hold"));

  function held() {
    const s = toDefuse(start(holdSeed, over));
    const mod = s.bomb!.modules.find((m) => buttonMode(m.data as ButtonData, s.bomb!.rules.button as ButtonRules, s.bomb!.edgework) === "hold")!;
    const after = input(s, s.bomb!.defuserId, { type: "hold", module: mod.id }, T0 + 2000);
    const digit = (s.bomb!.rules.button as ButtonRules).releaseDigit[(mod.data as ButtonData).strip];
    return { s: after, mod, digit };
  }

  it("la stessa pressione dà lo stesso giudizio con qualunque ritardo di rete (ora equa)", () => {
    const { s, mod, digit } = held();
    const ms = midSecondWithDigit(digit, 250_000);
    const pressedAt = timeFor(s, ms);
    for (const delay of [10, 60, 150, 300, 600]) {
      const out = input(s, s.bomb!.defuserId, { type: "release", module: mod.id }, pressedAt + delay, pressedAt, delay * 2);
      const m = out.bomb!.modules[mod.id]!;
      expect(m.solved, `ritardo ${delay} ms`).toBe(true);
    }
  });

  it("un telefono con l'orologio avanti non può barare: la dichiarazione è riportata al limite plausibile", () => {
    const { s, mod, digit } = held();
    const target = midSecondWithDigit(digit, 250_000);
    // arriva molto dopo la finestra giusta (il vero rilascio è 5 s dopo): l'orologio dichiara un istante di 5 s prima, ma con RTT 40 ms non è credibile
    const receivedAt = timeFor(s, target) + 5000;
    const out = input(s, s.bomb!.defuserId, { type: "release", module: mod.id }, receivedAt, receivedAt - 5000, 40);
    expect(releaseOk(digit, fakeRemaining(s.bomb!, receivedAt - 90))).toBe(false);
    expect(out.bomb!.strikes).toBe(1);
    expect(out.bomb!.modules[mod.id]!.solved).toBe(false);
  });

  it("rilasciare sulla cifra sbagliata è un errore e si può riprovare", () => {
    const { s, mod, digit } = held();
    const wrong = timeFor(s, midSecondWithDigit((digit + 4) % 10, 250_000));
    const bad = input(s, s.bomb!.defuserId, { type: "release", module: mod.id }, wrong);
    expect(bad.bomb!.strikes).toBe(1);
    const again = input(bad, bad.bomb!.defuserId, { type: "hold", module: mod.id }, wrong + 500);
    expect((again.bomb!.modules[mod.id]!.progress as { holding: boolean }).holding).toBe(true);
  });
});

describe("comandi della regia", () => {
  it("«Cambia artificiere» passa al compagno successivo e rifà la divisione del manuale", () => {
    const s = start(9, { betSeconds: 0 });
    const before = s.bomb!.defuserId;
    const t = s.teams.find((x) => x.id === "ta")!;
    const out = host(s, "swap-defuser", T0 + 100);
    expect(out.bomb!.defuserId).toBe(nextDefuser(t, before));
    expect(out.queue[0]!.defuserId).toBe(out.bomb!.defuserId);
    expect(Object.keys(out.bomb!.pages).sort()).toEqual(["a1", "a2", "a3"].filter((id) => id !== out.bomb!.defuserId));
    expect(new Set(Object.values(out.bomb!.pages).flat())).toEqual(new Set(buildManual(out.bomb!.rules).map((p) => p.id)));
    // la bomba è la stessa
    expect(out.bomb!.modules).toEqual(s.bomb!.modules);
    // il nuovo artificiere può iniziare, il vecchio no
    expect(input(out, before, { type: "start" }, T0 + 200)).toBe(out);
    expect(input(out, out.bomb!.defuserId, { type: "start" }, T0 + 200).phase).toBe("defuse");
    // non in disinnesco
    expect(host(toDefuse(s), "swap-defuser", T0 + 3000).bomb!.defuserId).toBe(before);
  });

  it("«Salta la squadra» passa alla successiva senza punti, e con l'ultima si va alla classifica", () => {
    let s = start(9, { betSeconds: 0 });
    s = host(s, "skip-team", T0 + 100);
    expect(s.phase).toBe("briefing");
    expect(s.bomb!.teamId).toBe("tb");
    expect(s.history[0]).toMatchObject({ teamId: "ta", outcome: "skipped" });
    s = host(s, "skip-team", T0 + 200);
    expect(s.phase).toBe("final");
    expect(plugin.scores(s)).toEqual([]);
  });

  it("«Esplodi» e «Disinnesca» chiudono il turno; «Avanti» passa alla squadra dopo e poi alla fine", () => {
    let s = toDefuse(start(10, { betSeconds: 0 }));
    s = host(s, "explode", T0 + 5000);
    expect(s.history[0]).toMatchObject({ outcome: "exploded", reason: "host" });
    s = host(s, "next", T0 + 6000);
    expect(s.phase).toBe("briefing");
    s = host(host(s, "start", T0 + 7000), "defuse", T0 + 17_000);
    expect(s.history[1]).toMatchObject({ outcome: "defused", reason: "host", secondsLeft: 290 });
    s = host(s, "next", T0 + 18_000);
    expect(s.phase).toBe("final");
    expect(plugin.isFinished(s)).toBe(false);
    s = host(s, "next", T0 + 19_000);
    expect(plugin.isFinished(s)).toBe(true);
    // chi non era di turno non cambia nulla in fasi in cui il comando non vale
    expect(host(s, "explode", T0 + 20_000)).toBe(s);
  });

  it("«Annulla l'ultimo errore» rimette il modulo e la velocità, anche dopo un'esplosione per errori", () => {
    const wiresOnly = { betSeconds: 0, enabledModules: only("wires") };
    let s = toDefuse(start(5, wiresOnly));
    const before = JSON.stringify(s.bomb!.modules);
    expect(host(s, "strike-undo", T0 + 2000)).toBe(s);
    s = strikeAt(s, T0 + 11_000);
    expect(JSON.stringify(s.bomb!.modules)).not.toBe(before);
    const undone = host(s, "strike-undo", T0 + 12_000);
    expect(undone.bomb!.strikes).toBe(0);
    expect(undone.bomb!.speed).toBe(1);
    expect(JSON.stringify(undone.bomb!.modules)).toBe(before);
    expect(undone.bomb!.clock).toEqual({ at: T0 + 12_000, remainingMs: fakeRemaining(s.bomb!, T0 + 12_000) });
    expect(host(undone, "strike-undo", T0 + 13_000)).toBe(undone);
    // tre errori: esplode; l'annullamento riapre il turno e toglie l'esito dalla cronologia
    let boom = toDefuse(start(5, wiresOnly));
    for (let i = 0; i < 3; i++) boom = strikeAt(boom, T0 + 11_000 + i * 1000);
    expect(boom.phase).toBe("outcome");
    const back = host(boom, "strike-undo", T0 + 20_000);
    expect(back.phase).toBe("defuse");
    expect(back.history).toEqual([]);
    expect(back.bomb!.strikes).toBe(2);
    expect(back.bomb!.outcome).toBeNull();
    // e ora si può ancora vincere
    expect(fakeRemaining(back.bomb!, T0 + 20_000)).toBeGreaterThan(200_000);
  });

  it("«Termina il round» salta alla classifica mantenendo i punti già fatti", () => {
    let s = toDefuse(start(10, { betSeconds: 0 }));
    s = host(host(s, "defuse", T0 + 5000), "next", T0 + 6000);
    s = host(s, "end", T0 + 7000);
    expect(s.phase).toBe("final");
    expect(plugin.scores(s).length).toBe(3);
    expect(host(s, "end", T0 + 8000)).toBe(s);
  });
});

describe("manuale e punti", () => {
  it("con sameManual le regole sono le stesse in tutte le bombe, altrimenti cambiano", () => {
    const rules = (s: S, i: number) => {
      const cur = i === 0 ? s : host(host(s, "skip-team", T0 + 1), "swap-defuser", T0 + 2);
      return JSON.stringify(cur.bomb!.rules);
    };
    for (const same of [true, false]) {
      const s = start(12, { betSeconds: 0, sameManual: same });
      const a = rules(s, 0);
      const second = host(s, "skip-team", T0 + 1);
      expect(JSON.stringify(second.bomb!.rules) === a, `sameManual ${same}`).toBe(same);
      expect(second.bomb!.edgework).not.toEqual(s.bomb!.edgework);
    }
  });

  it("i punti sommano tutti i turni: squadra di turno per i suoi moduli e bomba, scommesse giuste per chi ha indovinato", () => {
    let s = start(13, { betSeconds: 15, defusePoints: 300, modulePoints: 40, timeBonus: 2, betPoints: 25 });
    s = input(s, "b1", { type: "bet", outcome: "defused" }, T0 + 10);
    s = input(s, "b2", { type: "bet", outcome: "exploded" }, T0 + 20);
    s = plugin.onTick(s, T0 + 15_001);
    s = toDefuseFrom(s);
    for (const m of s.bomb!.modules.slice(0, 2)) s = solveModule(s, s.bomb!.modules[m.id]!, T0 + 30_000);
    s = host(s, "explode", T0 + 40_000);
    const totals = () => Object.fromEntries(plugin.scores(s).map((d) => [d.playerId, d.points]));
    expect(totals()).toEqual({ a1: 80, a2: 80, a3: 80, b2: 25 });
    s = host(s, "next", T0 + 41_000);
    s = plugin.onTick(s, T0 + 60_000);
    s = toDefuseFrom(s);
    s = host(s, "defuse", T0 + 70_000);
    const left = s.history[1]!.secondsLeft;
    expect(left).toBeGreaterThan(0);
    // la squadra Beta ha disinnescato solo a mano: nessun modulo risolto, quindi solo bomba e tempo
    expect(totals()).toMatchObject({ a1: 80, b1: 300 + 2 * left, b2: 25 + 300 + 2 * left, b3: 300 + 2 * left });
    // la classifica del round: chi ha gli stessi punti ha lo stesso rango; b2 ha in più la scommessa giusta
    const ranking = plugin.result(s).ranking;
    const rank = (id: string) => ranking.find((r) => r.playerId === id)!.rank;
    expect(rank("b1")).toBe(rank("b3"));
    expect(rank("b2")).toBeLessThan(rank("b1"));
    expect(ranking.map((r) => r.playerId).sort()).toEqual(["a1", "a2", "a3", "b1", "b2", "b3"]);
  });
});

describe("stato", () => {
  it("lo stato è JSON puro e le azioni non modificano quello ricevuto", () => {
    const s = toDefuseFrom(start(14, { betSeconds: 0 }));
    const frozen = JSON.stringify(s);
    const mod = s.bomb!.modules[0]!;
    input(s, s.bomb!.defuserId, { ...solutionOf(s, mod).actions[0]!, module: 0 }, T0 + 5000);
    strikeAt(s, T0 + 5000);
    host(s, "pause", T0 + 5000);
    expect(JSON.stringify(s)).toBe(frozen);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
