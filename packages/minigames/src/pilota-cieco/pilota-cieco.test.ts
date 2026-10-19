import { describe, expect, it } from "vitest";
import { fairTime } from "@gioco/shared";
import { GRACE_MS } from "../util.js";
import { LAYERS, MAX_LANES, READY_SECONDS, levelPoints, pilotaCieco as plugin, type LaneResult } from "./index.js";
import { BUMP_MS } from "./move.js";
import { PLAIN, type S, T0, autopilot, corridor, ctxFor, host, move, start, toRun, withCourse } from "./test-helpers.js";

const lane = (s: S, teamId: string) => s.lanes.find((l) => l.teamId === teamId)!;

describe("squadre, livelli e gare", () => {
  it("le squadre sono i team della serata, il primo livello è pronto e parte da solo dopo 10 secondi", () => {
    const s = start(3, PLAIN);
    expect(s.teams.map((t) => t.id)).toEqual(["ta", "tb"]);
    expect(s.phase).toBe("ready");
    expect(s.level).toBe(1);
    expect(s.units).toEqual([["ta", "tb"]]);
    expect(s.lanes.map((l) => l.teamId)).toEqual(["ta", "tb"]);
    expect(s.phaseEndsAt).toBe(T0 + READY_SECONDS * 1000);
    expect(plugin.onTick(s, T0 + READY_SECONDS * 1000 - 1)).toBe(s);
    const run = plugin.onTick(s, T0 + READY_SECONDS * 1000);
    expect(run.phase).toBe("run");
    expect(run.levelStartedAt).toBe(T0 + READY_SECONDS * 1000);
    expect(run.phaseEndsAt).toBe(T0 + READY_SECONDS * 1000 + 150_000);
  });

  it("è deterministico e il pilota ruota a ogni livello", () => {
    expect(JSON.stringify(start(5))).toBe(JSON.stringify(start(5)));
    expect(JSON.stringify(start(5))).not.toBe(JSON.stringify(start(6)));
    let s = start(2, { ...PLAIN, levels: 3 }, ctxFor(2, [3, 4]));
    for (let level = 1; level <= 3; level++) {
      expect(s.level).toBe(level);
      for (const l of s.lanes) {
        const order = s.teams.find((x) => x.id === l.teamId)!.order;
        expect(l.pilotId, `livello ${level}`).toBe(order[(level - 1) % order.length]);
      }
      s = host(host(goAt(s), { type: "finish-level" }, s.phaseStartedAt + 2000), { type: "next" }, s.phaseStartedAt + 2500);
    }
    expect(s.phase).toBe("final");
  });

  it("gli strati vanno ai navigatori: ognuno ne ha almeno uno quando ci sono abbastanza strati, e tutti gli strati del livello sono assegnati", () => {
    for (const navigators of [1, 2, 3, 4, 6]) {
      const s = start(11, { levels: 3 }, ctxFor(11, [navigators + 1, navigators + 1]));
      for (const l of s.lanes) {
        const active = LAYERS.filter((x) => (x === "mines" ? l.course.mines : x === "doors" ? l.course.doors : x === "keys" ? l.course.keys : l.course.patrols).length > 0);
        expect(Object.keys(l.layers).sort(), "i navigatori sono i membri tranne il pilota").toEqual(s.teams.find((t) => t.id === l.teamId)!.members.filter((m) => m !== l.pilotId).sort());
        const all = Object.values(l.layers).flat();
        expect([...all].sort()).toEqual([...active].sort());
        if (navigators >= active.length) for (const layers of Object.values(l.layers)) expect(layers.length).toBeLessThanOrEqual(1);
      }
    }
  });

  it("con più di 4 squadre in «insieme» si corre in più gare di 4 corsie; «a turno» è una gara a squadra", () => {
    const sizes = [2, 2, 2, 2, 2];
    const together = start(4, PLAIN, ctxFor(4, sizes));
    expect(together.units.map((u) => u.length)).toEqual([MAX_LANES, 1]);
    expect(together.lanes).toHaveLength(MAX_LANES);
    const single = start(4, { ...PLAIN, mode: "a-turno" }, ctxFor(4, sizes));
    expect(single.units).toEqual([["ta"], ["tb"], ["tc"], ["td"], ["te"]]);
    expect(single.lanes).toHaveLength(1);
  });

  it("senza team: 2–4 squadre a caso (una sola con meno di 4 giocatori)", () => {
    const groups = (n: number) => start(7, PLAIN, { seed: 7, teams: [], players: Array.from({ length: n }, (_, i) => ({ id: `p${i}`, nickname: `P${i}`, teamId: null })) }).teams.map((t) => t.members.length).sort();
    expect(groups(2)).toEqual([2]);
    expect(groups(3)).toEqual([3]);
    expect(groups(4)).toEqual([2, 2]);
    expect(groups(9)).toEqual([3, 3, 3]);
    expect(groups(30)).toEqual([7, 7, 8, 8]);
  });

  it("buildConfig rifiuta un team con un solo giocatore e accetta il resto", () => {
    const players = [...ctxFor(1, [3]).players, { id: "z", nickname: "Z", teamId: "tz" }];
    const teams = [{ id: "ta", name: "Squadra A" }, { id: "tz", name: "Squadra Z" }];
    const bad = plugin.buildConfig!({}, () => undefined, { players, teams });
    expect(!bad.ok && bad.error).toContain("Squadra Z");
    expect(plugin.buildConfig!({}, () => undefined, { players: ctxFor(1).players, teams: ctxFor(1).teams }).ok).toBe(true);
    expect(plugin.buildConfig!({ levels: 9 }, () => undefined, { players: [], teams: [] }).ok).toBe(false);
  });
});

/** «Via» un secondo dopo la presentazione del livello in corso. */
const goAt = (s: S) => host(s, { type: "go" }, s.phaseStartedAt + 1000);

describe("passi, blocchi e arrivi", () => {
  it("solo il pilota, solo in gara, non in pausa e solo da chi è in serata", () => {
    let s = start(6, PLAIN);
    const l = lane(s, "ta");
    const next = firstDir(l);
    expect(move(s, l.pilotId, next, T0 + 100)).toBe(s); // ready
    s = toRun(s);
    const nav = Object.keys(l.layers)[0]!;
    expect(move(s, nav, next, T0 + 1500)).toBe(s);
    expect(move(s, "estraneo", next, T0 + 1500)).toBe(s);
    const moved = move(s, l.pilotId, next, T0 + 1500);
    expect(moved).not.toBe(s);
    expect(lane(moved, "ta").run.pos).not.toBe(l.run.pos);
    const paused = host(s, { type: "pause" }, T0 + 1200);
    expect(move(paused, l.pilotId, next, T0 + 1500)).toBe(paused);
    // il pilota dell'altra squadra non muove la mia pedina
    expect(lane(moved, "tb").run.pos).toBe(lane(s, "tb").run.pos);
  });

  it("un'intera gara: il pilota arriva, l'ordine di arrivo vale i punti, la gara finisce quando arrivano tutti", () => {
    let s = toRun(start(8, { ...PLAIN, levels: 1 }));
    expect(s.phase).toBe("run");
    ({ s } = autopilot(s, T0 + 1100, 140_000));
    expect(s.phase).toBe("level-end");
    expect(s.results.every((r) => r.finished)).toBe(true);
    const order = [...s.results].sort((a, b) => a.elapsedMs! - b.elapsedMs!).map((r) => r.teamId);
    const points = Object.fromEntries(s.results.map((r) => [r.teamId, r.points]));
    expect(points[order[0]!]).toBe(150);
    expect(points[order[1]!]).toBe(100);
    expect(s.board).toEqual(points);
    expect(s.lanes.every((l) => l.run.finishedAt !== null)).toBe(true);
  });

  it("l'arrivo si giudica all'ora equa: la squadra che preme per prima arriva prima anche se il suo messaggio arriva dopo", () => {
    let s = toRun(start(8, { ...PLAIN, levels: 1 }));
    s = withCourse(withCourse(s, "ta", corridor({ keys: [] })), "tb", corridor({ keys: [] }));
    const a = lane(s, "ta").pilotId;
    const b = lane(s, "tb").pilotId;
    // si portano entrambi accanto all'uscita
    s = { ...s, lanes: s.lanes.map((l) => ({ ...l, run: { ...l.run, pos: 4, lastCheckpoint: 3 } })) };
    // A preme a T0+3000 ma il messaggio arriva a T0+3600 (rete lenta); B preme a T0+3200 e arriva subito
    s = move(s, b, "right", T0 + 3200, T0 + 3200, 30);
    s = move(s, a, "right", T0 + 3600, T0 + 3000, 700);
    expect(s.phase).toBe("level-end");
    const byTeam = Object.fromEntries(s.results.map((r) => [r.teamId, r]));
    expect(byTeam.ta!.elapsedMs).toBeLessThan(byTeam.tb!.elapsedMs!);
    expect(byTeam.ta!.points).toBeGreaterThan(byTeam.tb!.points!);
    expect(fairTime({ claimed: T0 + 3000, receivedAt: T0 + 3600, rtt: 700, openedAt: T0 })).toBe(T0 + 3000);
  });

  it("una mina rimanda al punto di controllo, ferma e conta un errore, e a fine livello costa punti", () => {
    let s = toRun(start(9, { ...PLAIN, levels: 1, penaltyMs: 3000 }));
    s = withCourse(s, "ta", corridor({ mines: [4], keys: [] }));
    s = { ...s, lanes: s.lanes.map((l) => (l.teamId === "ta" ? { ...l, run: { ...l.run, pos: 3, lastCheckpoint: 3 } } : l)) };
    const pilot = lane(s, "ta").pilotId;
    s = move(s, pilot, "right", T0 + 2000);
    expect(lane(s, "ta").run).toMatchObject({ pos: 3, strikes: 1, minesHit: [4], frozenUntil: T0 + 5000 });
    expect(move(s, pilot, "right", T0 + 4999)).toBe(s);
    // la mina scoperta è pubblica sulla TV
    expect((plugin.screenView(s) as { lanes: { teamId: string; hitMines: number[] }[] }).lanes.find((l) => l.teamId === "ta")!.hitMines).toEqual([4]);
    const ended = host(s, { type: "finish-level" }, T0 + 6000);
    const r = ended.results.find((x) => x.teamId === "ta")!;
    expect(r.strikes).toBe(1);
    expect(r.finished).toBe(false);
  });

  it("le porte si giudicano all'ora equa anche a livello di plugin (stessa pressione, ritardi diversi, stesso esito)", () => {
    const door = { cell: 1, period: 1000, offset: 0 };
    for (const delay of [10, 120, 300, 700]) {
      let s = toRun(start(9, { ...PLAIN, levels: 1 }));
      s = withCourse(s, "ta", corridor({ doors: [door], keys: [] }));
      const t0 = s.levelStartedAt!;
      const pilot = lane(s, "ta").pilotId;
      // premuto a +900 ms dall'inizio (aperta), arrivato dopo `delay` ms (anche con la porta già chiusa)
      s = move(s, pilot, "right", t0 + 900 + delay, t0 + 900, delay * 2);
      expect(lane(s, "ta").run.pos, `ritardo ${delay} ms`).toBe(1);
    }
    // premuto a +1100 (chiusa): urto, anche se arriva quando sarebbe aperta
    let s = toRun(start(9, { ...PLAIN, levels: 1 }));
    s = withCourse(s, "ta", corridor({ doors: [door], keys: [] }));
    const t0 = s.levelStartedAt!;
    const out = move(s, lane(s, "ta").pilotId, "right", t0 + 2100, t0 + 1100, 2000);
    expect(lane(out, "ta").run).toMatchObject({ pos: 0, frozenUntil: t0 + 1100 + BUMP_MS });
  });

  it("una pattuglia raggiunge il pilota fermo al tick", () => {
    let s = toRun(start(9, { ...PLAIN, levels: 1 }));
    s = withCourse(s, "ta", corridor({ patrols: [{ path: [1, 2, 3], stepMs: 1000, offset: 0 }], checkpoints: [0], keys: [] }));
    s = { ...s, lanes: s.lanes.map((l) => (l.teamId === "ta" ? { ...l, run: { ...l.run, pos: 1 } } : l)) };
    const t0 = s.levelStartedAt!;
    expect(plugin.onTick(s, t0 + 1500)).toBe(s);
    const hit = plugin.onTick(s, t0 + 100);
    expect(lane(hit, "ta").run).toMatchObject({ pos: 0, strikes: 1 });
  });

  it("il tempo scade (con la tolleranza): chi non è arrivato prende punti in proporzione alla strada fatta", () => {
    let s = toRun(start(10, { ...PLAIN, levels: 1 }));
    const end = s.phaseEndsAt!;
    expect(plugin.onTick(s, end + GRACE_MS - 1)).toBe(s);
    // una squadra a metà strada, l'altra ferma
    const half = lane(s, "ta").course.route[Math.floor(lane(s, "ta").course.route.length / 2)]!;
    s = { ...s, lanes: s.lanes.map((l) => (l.teamId === "ta" ? { ...l, run: { ...l.run, pos: half } } : l)) };
    const out = plugin.onTick(s, end + GRACE_MS);
    expect(out.phase).toBe("level-end");
    const ta = out.results.find((r) => r.teamId === "ta")!;
    const tb = out.results.find((r) => r.teamId === "tb")!;
    expect(ta.finished).toBe(false);
    expect(ta.progress).toBeGreaterThan(0.1);
    expect(ta.progress).toBeLessThan(1);
    expect(tb.progress).toBe(0);
    expect(ta.points).toBe(Math.round(50 * ta.progress));
    expect(tb.points).toBe(0);
  });

  it("un passo in tempo che arriva entro la tolleranza vale, uno dichiarato dopo la scadenza no", () => {
    let s = toRun(start(10, { ...PLAIN, levels: 1 }));
    s = withCourse(s, "ta", corridor({ keys: [] }));
    const pilot = lane(s, "ta").pilotId;
    const end = s.phaseEndsAt!;
    expect(lane(move(s, pilot, "right", end + 300, end - 100, 600), "ta").run.pos).toBe(1);
    expect(move(s, pilot, "right", end + 300, end + 100, 50)).toBe(s);
    expect(move(s, pilot, "right", end + GRACE_MS + 1, end - 100, 5000)).toBe(s);
  });
});

function firstDir(l: S["lanes"][number]) {
  const path = l.course.route;
  const dirs = [["up", -l.course.w], ["down", l.course.w], ["left", -1], ["right", 1]] as const;
  const delta = path[1]! - path[0]!;
  return dirs.find(([, d]) => d === delta)![0];
}

describe("pausa", () => {
  it("la pausa ferma il tempo e la ripresa sposta di altrettanto tutti i tempi, così porte e blocchi non saltano", () => {
    let s = toRun(start(12, { ...PLAIN, levels: 1 }));
    s = withCourse(s, "ta", corridor({ keys: [], doors: [{ cell: 4, period: 1000, offset: 0 }] }));
    const pilot = lane(s, "ta").pilotId;
    s = move(s, pilot, "right", s.levelStartedAt! + 500);
    const t0 = s.levelStartedAt!;
    const endsAt = s.phaseEndsAt!;
    const paused = host(s, { type: "pause" }, t0 + 1000);
    expect(paused.pausedRemainingMs).toBe(endsAt - (t0 + 1000));
    expect(plugin.onTick(paused, t0 + 10_000_000)).toBe(paused);
    expect(host(paused, { type: "pause" }, t0 + 1100)).toBe(paused);
    const resumed = host(paused, { type: "resume" }, t0 + 31_000);
    expect(resumed.levelStartedAt).toBe(t0 + 30_000);
    expect(resumed.phaseEndsAt).toBe(t0 + 31_000 + (endsAt - (t0 + 1000)));
    expect(lane(resumed, "ta").run.lastStepAt).toBe(lane(s, "ta").run.lastStepAt + 30_000);
    // il tempo del livello, e quindi l'orario delle porte, è quello di prima della pausa
    expect(resumed.phaseEndsAt! - resumed.levelStartedAt!).toBe(endsAt - t0);
    expect(host(resumed, { type: "resume" }, t0 + 32_000)).toBe(resumed);
  });

  it("si può mettere in pausa anche la presentazione del livello", () => {
    const s = start(12, PLAIN);
    const paused = host(s, { type: "pause" }, T0 + 4000);
    expect(paused.pausedRemainingMs).toBe(6000);
    expect(host(paused, { type: "resume" }, T0 + 9000).phaseEndsAt).toBe(T0 + 15_000);
  });
});

describe("livelli, modalità a turno e comandi della regia", () => {
  it("tre livelli: la regia avanza, i punti si sommano, poi la classifica e la fine", () => {
    let s = start(14, { ...PLAIN, levels: 3 });
    let at = T0;
    for (let level = 1; level <= 3; level++) {
      expect(s.level).toBe(level);
      s = goAt(s);
      at = s.phaseStartedAt;
      ({ s } = autopilot(s, at + 100, 150_000));
      expect(s.phase).toBe("level-end");
      expect(s.history).toHaveLength(level);
      s = host(s, { type: "next" }, s.phaseStartedAt + 1);
    }
    expect(s.phase).toBe("final");
    const totals = plugin.scores(s);
    expect(totals.length).toBeGreaterThan(0);
    expect(new Set(totals.filter((d) => d.playerId!.startsWith("a")).map((d) => d.points)).size).toBe(1);
    expect(totals.every((d) => Number.isInteger(d.points) && d.teamId === null)).toBe(true);
    expect(host(s, { type: "next" }, at + 2).phase).toBe("done");
    expect(plugin.isFinished(host(s, { type: "next" }, at + 2))).toBe(true);
  });

  it("a turno: una gara per squadra; i punti arrivano solo quando tutte hanno giocato (per ordine di tempo)", () => {
    let s = start(15, { ...PLAIN, mode: "a-turno", levels: 1 }, ctxFor(15, [2, 2, 2]));
    expect(s.units).toHaveLength(3);
    const elapsed: Record<string, number> = {};
    for (let u = 0; u < 3; u++) {
      expect(s.lanes).toHaveLength(1);
      s = goAt(s);
      const startAt = s.levelStartedAt!;
      const teamId = s.lanes[0]!.teamId;
      ({ s } = autopilot(s, startAt + 100, 140_000));
      expect(s.phase).toBe("level-end");
      elapsed[teamId] = s.results.find((r) => r.teamId === teamId)!.elapsedMs!;
      expect(s.results).toHaveLength(u + 1);
      // finché una gara manca, i punti non ci sono ancora
      expect(s.results.every((r) => (u < 2 ? r.points === null : r.points !== null))).toBe(true);
      s = host(s, { type: "next" }, s.phaseStartedAt + 1);
    }
    expect(s.phase).toBe("final");
    const order = Object.entries(elapsed).sort((a, b) => a[1] - b[1]).map(([id]) => id);
    expect(s.board[order[0]!]).toBeGreaterThan(s.board[order[1]!]!);
    expect(s.board[order[1]!]).toBeGreaterThan(s.board[order[2]!]!);
  });

  it("le penalità non portano i punti sotto zero e oltre la lista vale l'ultimo valore", () => {
    const base = pilotaConfigSchemaFor();
    const r = (teamId: string, finished: boolean, elapsedMs: number | null, progress: number, strikes: number): LaneResult => ({ teamId, finished, elapsedMs, progress, strikes, points: null });
    const out = levelPoints(base, [r("a", true, 9000, 1, 0), r("b", true, 5000, 1, 1), r("c", true, 7000, 1, 0), r("d", true, 8000, 1, 0), r("e", true, 8500, 1, 0), r("f", false, null, 0.5, 9)]);
    const pts = Object.fromEntries(out.map((x) => [x.teamId, x.points]));
    expect(pts).toEqual({ b: 140, c: 100, d: 75, e: 50, a: 50, f: 0 });
    // niente arrivi: solo la strada fatta
    expect(levelPoints(base, [r("a", false, null, 0.4, 0)])[0]!.points).toBe(20);
  });

  it("«Cambia pilota» passa al compagno successivo prima del via, rifà gli strati e non vale in gara", () => {
    const s = start(16, PLAIN, ctxFor(16, [4, 4]));
    const before = lane(s, "ta").pilotId;
    const out = host(s, { type: "skip-pilot", teamId: "ta" }, T0 + 100);
    expect(lane(out, "ta").pilotId).not.toBe(before);
    expect(lane(out, "tb").pilotId).toBe(lane(s, "tb").pilotId);
    expect(Object.keys(lane(out, "ta").layers)).not.toContain(lane(out, "ta").pilotId);
    expect(Object.keys(lane(out, "ta").layers)).toContain(before);
    // senza squadra: tutte
    const all = host(s, { type: "skip-pilot" }, T0 + 100);
    expect(lane(all, "tb").pilotId).not.toBe(lane(s, "tb").pilotId);
    expect(host(toRun(s), { type: "skip-pilot" }, T0 + 2000).lanes.map((l) => l.pilotId)).toEqual(toRun(s).lanes.map((l) => l.pilotId));
  });

  it("«Chiudi la gara» e «Termina il round» portano ai punti e alla classifica", () => {
    const s = toRun(start(17, { ...PLAIN, levels: 2 }));
    const closed = host(s, { type: "finish-level" }, T0 + 3000);
    expect(closed.phase).toBe("level-end");
    const ended = host(s, { type: "end" }, T0 + 3000);
    expect(ended.phase).toBe("final");
    expect(ended.history).toHaveLength(1);
    expect(host(ended, { type: "end" }, T0 + 4000)).toBe(ended);
    expect(host(start(17, PLAIN), { type: "finish-level" }, T0 + 10)).toEqual(start(17, PLAIN));
  });

  it("lo stato è JSON puro e le azioni non modificano quello ricevuto", () => {
    const s = toRun(start(18, PLAIN));
    const frozen = JSON.stringify(s);
    expect(JSON.parse(frozen)).toEqual(s);
    const l = lane(s, "ta");
    move(s, l.pilotId, firstDir(l), T0 + 2000);
    host(s, { type: "pause" }, T0 + 2000);
    plugin.onTick(s, T0 + 2000);
    expect(JSON.stringify(s)).toBe(frozen);
  });
});

function pilotaConfigSchemaFor() {
  return plugin.configSchema.parse({ finishPoints: [150, 100, 75, 50], distancePoints: 50, strikePenalty: 10 });
}
