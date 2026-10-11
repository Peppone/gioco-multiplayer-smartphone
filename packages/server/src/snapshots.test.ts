import { minigames } from "@gioco/minigames";
import { beforeEach, describe, expect, it } from "vitest";
import { Engine } from "./engine.js";
import { SnapshotStore } from "./snapshots.js";
import { type World, buildWorld } from "./test-world.js";

let w: World;
beforeEach(() => {
  w = buildWorld();
});

/** Un secondo engine sullo stesso database: come dopo il riavvio del server. */
const reboot = () => {
  const engine = new Engine({ db: w.db, registry: minigames, scores: w.scores, now: () => w.clock.t, rttOf: () => null });
  const store = new SnapshotStore(w.db, engine, () => w.clock.t);
  return { engine, store };
};

const views = (e: Engine) => JSON.stringify({ screen: e.screenState(), admin: e.adminState(), ada: e.playerState(w.ids.ada!), cleo: e.playerState(w.ids.cleo!) });
const rows = () => (w.db.$client.prepare("select match_id from match_state_snapshots").all() as { match_id: string }[]).length;

describe("salvataggio della partita in corso", () => {
  it("senza partita non si salva nulla; con una partita in corso sì; a partita conclusa si cancella", () => {
    const first = new SnapshotStore(w.db, w.engine, () => w.clock.t);
    first.sync();
    expect(rows()).toBe(0);

    w.engine.hostCommand({ type: "start", matchId: w.match.id });
    first.sync();
    expect(rows()).toBe(1);

    w.engine.hostCommand({ type: "engine", action: "end-match" });
    first.sync();
    expect(rows()).toBe(0);
  });

  it("non riscrive se nulla è cambiato", () => {
    const store = new SnapshotStore(w.db, w.engine, () => w.clock.t);
    w.engine.hostCommand({ type: "start", matchId: w.match.id });
    store.sync();
    const ts = (w.db.$client.prepare("select ts from match_state_snapshots").get() as { ts: number }).ts;
    w.clock.t += 5_000;
    store.sync();
    expect((w.db.$client.prepare("select ts from match_state_snapshots").get() as { ts: number }).ts).toBe(ts);
  });
});

describe("ripresa dopo il riavvio", () => {
  it("a metà quiz le viste di schermo, regia e giocatori tornano identiche e la partita prosegue fino ai punti", () => {
    const store1 = new SnapshotStore(w.db, w.engine, () => w.clock.t);
    w.engine.hostCommand({ type: "start", matchId: w.match.id });
    w.engine.hostCommand({ type: "engine", action: "next" });
    w.clock.t += 1_000;
    w.engine.input(w.ids.ada!, { type: "answer", choice: 1 }, w.clock.t - 10);
    w.engine.input(w.ids.cleo!, { type: "answer", choice: 0 }, w.clock.t - 10);
    store1.sync();
    const before = views(w.engine);

    const { engine, store } = reboot(); // il server si è riavviato
    expect(store.restoreOnStart()).toEqual({ restored: w.match.id, abandoned: [] });
    expect(views(engine)).toBe(before);

    // si prosegue: gli altri rispondono, la regia chiude il quiz
    w.clock.t += 500;
    engine.input(w.ids.bob!, { type: "answer", choice: 1 }, w.clock.t - 10);
    engine.input(w.ids.dan!, { type: "answer", choice: 1 }, w.clock.t - 10);
    for (let i = 0; i < 4; i++) engine.hostCommand({ type: "plugin", command: { type: "next" } });
    expect(engine.screenState().phase).toBe("results");
    const pts = Object.fromEntries(w.scores.leaderboards(w.event.id).players.map((p) => [p.name, p.points]));
    expect(pts.ada).toBeGreaterThan(0);
    expect(pts.cleo).toBe(0); // aveva risposto male prima del riavvio: la risposta non è andata persa
  });

  it("con i timer scaduti durante lo spegnimento, al primo tick la domanda si rivela", () => {
    const store1 = new SnapshotStore(w.db, w.engine, () => w.clock.t);
    w.engine.hostCommand({ type: "start", matchId: w.match.id });
    w.engine.hostCommand({ type: "engine", action: "next" });
    store1.sync();

    w.clock.t += 5 * 60_000; // il PC è rimasto spento 5 minuti
    const { engine, store } = reboot();
    store.restoreOnStart();
    expect((engine.screenState().frame!.view as { phase: string }).phase).toBe("question");
    engine.tick();
    expect((engine.screenState().frame!.view as { phase: string }).phase).toBe("reveal");
  });

  it("riprende anche un duello a metà draft, con mani e voti segreti", () => {
    const must = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
      if (!r.ok) throw new Error(r.error);
      return r.value;
    };
    const inst = must(w.admin.library.createInstance({ typeId: "vero-falso", title: "R", config: { statements: [{ text: "x", answer: true }], timeSec: 5, revealSec: 1 } }));
    const duel = must(w.admin.library.createInstance({ typeId: "knight-duel", title: "D", config: { pool: [inst.id], hp: 10, minigamesPerBattle: 1, maxBattles: 2, draftSeconds: 30, battleSeconds: 30 } }));
    const m = must(w.admin.createMatch(w.event.id, { name: "Duello" }));
    must(w.admin.library.addRound(m.id, duel.id));
    const store1 = new SnapshotStore(w.db, w.engine, () => w.clock.t);
    w.engine.hostCommand({ type: "start", matchId: m.id });
    w.engine.hostCommand({ type: "engine", action: "next" });
    for (const n of ["ada", "bob"]) w.engine.input(w.ids[n]!, { type: "child", input: { type: "answer", value: true } }, w.clock.t);
    for (const n of ["cleo", "dan"]) w.engine.input(w.ids[n]!, { type: "child", input: { type: "answer", value: false } }, w.clock.t);
    w.clock.t += 200;
    w.engine.tick();
    w.clock.t += 1_300;
    w.engine.tick();
    const draftView = (e: Engine) => (e.playerState(w.ids.ada!).frame!.view as { draft?: { role?: string; cards?: { uid: string }[] } }).draft;
    expect(draftView(w.engine)?.role).toBe("picker");
    store1.sync();
    const before = views(w.engine);

    const { engine, store } = reboot();
    store.restoreOnStart();
    expect(views(engine)).toBe(before);
    expect(draftView(engine)?.cards).toHaveLength(3);
  });

  it("una partita rimasta avviata senza fotografia (arresto brusco) viene chiusa, non resta bloccata", () => {
    w.engine.hostCommand({ type: "start", matchId: w.match.id }); // la partita risulta in corso nel database, nessun salvataggio
    const { engine, store } = reboot();
    const report = store.restoreOnStart();
    expect(report).toEqual({ restored: null, abandoned: [w.match.id] });
    expect(engine.screenState().phase).toBe("idle");
    const status = (w.db.$client.prepare("select status from matches where id = ?").get(w.match.id) as { status: string }).status;
    expect(status).toBe("done");
  });

  it("una fotografia di versione sconosciuta non viene ripristinata e viene eliminata", () => {
    w.engine.hostCommand({ type: "start", matchId: w.match.id });
    new SnapshotStore(w.db, w.engine, () => w.clock.t).sync();
    w.db.$client.prepare("update match_state_snapshots set state_json = ?").run(JSON.stringify({ v: 99 }));
    const { engine, store } = reboot();
    expect(store.restoreOnStart().restored).toBeNull();
    expect(engine.screenState().phase).toBe("idle");
    expect(rows()).toBe(0);
  });
});
