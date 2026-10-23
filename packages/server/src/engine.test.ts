import { minigames } from "@gioco/minigames";
import { beforeEach, describe, expect, it } from "vitest";
import { type World, buildWorld } from "./test-world.js";

let w: World;
beforeEach(() => {
  w = buildWorld();
});

const start = () => w.engine.hostCommand({ type: "start", matchId: w.match.id });
const next = () => w.engine.hostCommand({ type: "engine", action: "next" });
const plugin = (type: string) => w.engine.hostCommand({ type: "plugin", command: { type } });
const answer = (nick: string, choice: number) =>
  w.engine.input(w.ids[nick]!, { type: "answer", choice }, w.clock.t - 20);
const buzz = (nick: string) => w.engine.input(w.ids[nick]!, { type: "buzz" }, w.clock.t - 20);

describe("Engine: avvio", () => {
  it("rifiuta comandi senza partita, e partite senza round o senza giocatori", () => {
    expect(next()).toEqual({ ok: false, error: "Nessuna partita in corso." });
    const empty = w.admin.createMatch(w.event.id, { name: "Vuota" });
    if (!empty.ok) throw new Error();
    expect(w.engine.startMatch(empty.value.id)).toEqual({ ok: false, error: "La partita non ha round." });
  });

  it("parte in fase ready; una seconda partita non si può avviare mentre una è in corso", () => {
    expect(start()).toEqual({ ok: true });
    expect(w.engine.screenState()).toMatchObject({ phase: "ready", roundNumber: 0, roundCount: 2, matchName: "Partita 1" });
    expect(start().ok).toBe(false);
  });

  it("avviare una partita rende attiva la serata in bozza, ma non riapre una chiusa", () => {
    expect(w.admin.getEvent(w.event.id)).toMatchObject({ ok: true, value: { status: "draft" } });
    start();
    expect(w.admin.getEvent(w.event.id)).toMatchObject({ value: { status: "live" } });
    expect(w.admin.listEvents()[0]!.matches.map((m) => m.status)).toEqual(["running"]);

    w.engine.hostCommand({ type: "engine", action: "end-match" });
    w.engine.hostCommand({ type: "engine", action: "close" });
    w.admin.patchEvent(w.event.id, { status: "closed" });
    const next2 = w.admin.createMatch(w.event.id, { name: "Bis" });
    if (!next2.ok) throw new Error();
    w.admin.library.addRound(next2.value.id, w.admin.library.listInstances()[0]!.id);
    w.engine.startMatch(next2.value.id);
    expect(w.admin.getEvent(w.event.id)).toMatchObject({ value: { status: "closed" } });
  });

  it("a partita avviata i round non si possono aggiungere, togliere o riordinare", () => {
    start();
    const lib = w.admin.library;
    const rounds = lib.rounds(w.match.id);
    const inst = lib.listInstances()[0]!;
    expect(lib.addRound(w.match.id, inst.id)).toMatchObject({ ok: false, error: "conflict" });
    expect(lib.deleteRound(rounds[0]!.id)).toMatchObject({ ok: false, error: "conflict" });
    expect(lib.reorderRounds(w.match.id, rounds.map((r) => r.id).reverse())).toMatchObject({ ok: false, error: "conflict" });
    expect(lib.rounds(w.match.id)).toHaveLength(2);
  });

  it("a partita conclusa si torna alla lobby; prima non si può", () => {
    const close = () => w.engine.hostCommand({ type: "engine", action: "close" });
    start();
    expect(close()).toMatchObject({ ok: false });
    w.engine.hostCommand({ type: "engine", action: "end-match" });
    expect(w.engine.adminState().engineActions.map((a) => a.id)).toEqual(["close"]);
    expect(close()).toEqual({ ok: true });
    expect(w.engine.screenState().phase).toBe("idle");
    expect(w.engine.playerState(w.ids.ada!)).toMatchObject({ phase: "idle", inRoster: false });
    expect(close()).toMatchObject({ ok: false }); // nessuna partita
  });

  it("rifiuta il round se i giocatori sono meno del minimo del minigioco, con un messaggio chiaro", () => {
    const inst = w.admin.library.createInstance({ typeId: "stanze-col-botto", title: "Botto", config: minigames["stanze-col-botto"]!.sampleConfig });
    if (!inst.ok) throw new Error(inst.error);
    const match = w.admin.createMatch(w.event.id, { name: "Poche persone" });
    if (!match.ok) throw new Error(match.error);
    w.admin.library.addRound(match.value.id, inst.value.id);
    w.engine.startMatch(match.value.id);
    expect(next()).toEqual({ ok: false, error: "Botto: servono almeno 6 giocatori, in serata ce ne sono 4." });
  });

  it("una partita già avviata non si riavvia", () => {
    start();
    w.engine.hostCommand({ type: "engine", action: "end-match" });
    expect(start()).toMatchObject({ ok: false });
  });
});

describe("Engine: partita completa Quiz + Buzzer", () => {
  it("gioca tutto, registra i punti una volta sola e calcola le classifiche", () => {
    start();
    next(); // round 1: quiz
    expect(w.engine.screenState().phase).toBe("round");

    // domanda 1: ada e cleo giusto (ada più veloce), bob sbaglia
    w.clock.t += 1_000;
    answer("ada", 1);
    w.clock.t += 3_000;
    answer("cleo", 1);
    answer("bob", 0);
    plugin("next"); // rivela
    plugin("next"); // domanda 2
    w.clock.t += 500;
    answer("ada", 0);
    plugin("next");
    plugin("next"); // chiude il quiz
    expect(w.engine.screenState().phase).toBe("results");

    const afterQuiz = w.scores.leaderboards(w.event.id);
    expect(afterQuiz.players[0]?.name).toBe("ada");
    expect(afterQuiz.players.find((p) => p.name === "dan")?.points).toBe(0);
    // la squadra Rossi (ada+bob) ha più punti di Blu (solo cleo)
    expect(afterQuiz.teams.map((t) => t.name)).toEqual(["Rossi", "Blu"]);
    expect(afterQuiz.teams[0]!.points).toBeGreaterThan(afterQuiz.teams[1]!.points);

    next(); // round 2: buzzer
    plugin("open");
    w.clock.t += 400;
    buzz("dan");
    w.clock.t += 300;
    w.engine.tick(); // chiude la finestra di raccolta
    plugin("correct");
    plugin("next");
    expect(w.engine.screenState().phase).toBe("results");

    const final = w.scores.leaderboards(w.event.id);
    expect(final.players.find((p) => p.name === "dan")?.points).toBe(100);

    next(); // niente altri round: conclude
    expect(w.engine.screenState().phase).toBe("ended");
    const totalAfterEnd = w.scores.leaderboards(w.event.id).players.reduce((s, p) => s + p.points, 0);
    const totalBefore = final.players.reduce((s, p) => s + p.points, 0);
    expect(totalAfterEnd).toBe(totalBefore); // nessun doppio conteggio
    expect(w.engine.hostCommand({ type: "engine", action: "next" }).ok).toBe(false);
  });

  it("terminare il round a metà registra i punti ottenuti fino a quel momento", () => {
    start();
    next();
    w.clock.t += 500;
    answer("ada", 1);
    w.engine.hostCommand({ type: "engine", action: "finish-round" });
    plugin("next"); // non ha effetto: il round è chiuso
    const ada = w.scores.leaderboards(w.event.id).players.find((p) => p.name === "ada");
    expect(ada?.points).toBe(0); // la domanda non era ancora stata rivelata
    expect(w.engine.screenState().phase).toBe("results");
  });

  it("il tick rivela la domanda del quiz alla scadenza", () => {
    start();
    next();
    w.clock.t += 20_400;
    expect(w.engine.tick()).toBe(false);
    w.clock.t += 200;
    expect(w.engine.tick()).toBe(true);
    expect(w.engine.screenState().frame?.view).toMatchObject({ phase: "reveal" });
  });
});

describe("Engine: input e rettifiche", () => {
  it("ignora input di chi non è in serata, input malformati e input fuori round", () => {
    start();
    expect(w.engine.input(w.ids.ada!, { type: "answer", choice: 0 }, 0)).toBe(false); // fase ready
    next();
    expect(w.engine.input("intruso", { type: "answer", choice: 0 }, 0)).toBe(false);
    expect(w.engine.input(w.ids.ada!, { type: "boh" }, 0)).toBe(false);
    expect(w.engine.input(w.ids.ada!, { type: "answer", choice: 99 }, 0)).toBe(false);
    expect(w.engine.input(w.ids.ada!, { type: "answer", choice: 1 }, 0)).toBe(true);
  });

  it("le rettifiche manuali sono tracciate e spostano le classifiche", () => {
    start();
    expect(w.engine.hostCommand({ type: "adjust", playerId: w.ids.dan!, teamId: null, points: 250, reason: "Bonus" })).toEqual({ ok: true });
    expect(w.engine.hostCommand({ type: "adjust", playerId: null, teamId: w.red.id, points: -50, reason: "Penalità" })).toEqual({ ok: true });
    const lb = w.scores.leaderboards(w.event.id);
    expect(lb.players[0]).toMatchObject({ name: "dan", points: 250 });
    const blu = lb.teams.find((t) => t.name === "Blu");
    const rossi = lb.teams.find((t) => t.name === "Rossi");
    expect(blu?.points).toBe(250); // dan è in Blu
    expect(rossi?.points).toBe(-50);
    const rows = w.db.$client.prepare("select reason from score_entries order by id").all() as { reason: string }[];
    expect(rows.map((r) => r.reason)).toEqual(["Rettifica: Bonus", "Rettifica: Penalità"]);
  });

  it("rifiuta rettifiche verso giocatori o squadre fuori serata e senza destinatario", () => {
    start();
    const adj = (playerId: string | null, teamId: string | null) =>
      w.engine.hostCommand({ type: "adjust", playerId, teamId, points: 10, reason: "x" }).ok;
    expect(adj("intruso", null)).toBe(false);
    expect(adj(null, "boh")).toBe(false);
    expect(adj(null, null)).toBe(false);
  });
});

describe("Engine: viste filtrate (anti-leak)", () => {
  const text = (v: unknown) => JSON.stringify(v);

  it("quiz: schermo e telefoni non ricevono la risposta corretta prima della rivelazione", () => {
    start();
    next();
    answer("ada", 1);
    expect(text(w.engine.screenState())).not.toMatch(/correct/i);
    for (const nick of Object.keys(w.ids)) expect(text(w.engine.playerState(w.ids[nick]!))).not.toMatch(/correct/i);
    expect(text(w.engine.adminState().host)).toContain("correct");
    plugin("next");
    expect(text(w.engine.screenState())).toContain("correctIndex");
  });

  it("buzzer: la risposta segreta è solo nella vista della regia", () => {
    start();
    next();
    for (let i = 0; i < 4; i++) plugin("next"); // rivela e avanza fino a chiudere le 2 domande del quiz
    next();
    plugin("open");
    w.clock.t += 300;
    buzz("ada");
    w.clock.t += 400;
    w.engine.tick();
    expect(w.engine.screenState().frame?.typeId).toBe("buzzer");
    expect(text(w.engine.screenState())).not.toContain("SEGRETA");
    for (const nick of Object.keys(w.ids)) expect(text(w.engine.playerState(w.ids[nick]!))).not.toContain("SEGRETA");
    expect(text(w.engine.adminState())).toContain("SEGRETA");
  });

  it("un giocatore fuori serata vede solo l'attesa", () => {
    start();
    next();
    const p = w.engine.playerState("sconosciuto");
    expect(p).toEqual({ phase: "round", matchName: "Partita 1", inRoster: false });
  });

  it("le classifiche non compaiono sullo schermo durante un round (solo prima e dopo)", () => {
    start();
    expect(w.engine.screenState().leaderboards).toBeDefined();
    next();
    expect(w.engine.screenState().leaderboards).toBeUndefined();
  });
});

describe("Engine: giocatori che cambiano a partita avviata", () => {
  const newPlayer = (nick: string, teamId: string | null) => {
    const r = w.playerService.create({ nickname: nick, avatar: "🐼", color: "#445566" });
    if (!r.ok) throw new Error("player");
    w.ids[nick] = r.player.id;
    expect(w.admin.assignPlayer(w.event.id, r.player.id, teamId).ok).toBe(true);
    return r.player.id;
  };
  const finishRound = () => w.engine.hostCommand({ type: "engine", action: "finish-round" });

  it("tra un round e l'altro un nuovo giocatore entra subito e può giocare", () => {
    start();
    const eli = newPlayer("eli", w.red.id);
    expect(w.engine.playerState(eli)).toMatchObject({ phase: "ready", inRoster: true, me: { teamId: w.red.id } });
    next();
    expect(w.engine.rosterIds()).toContain(eli);
    w.clock.t += 1_000;
    expect(answer("eli", 1)).toBe(true);
  });

  it("tra un round e l'altro chi viene tolto esce subito, ma i suoi punti restano nel registro", () => {
    start();
    next();
    w.clock.t += 1_000;
    answer("ada", 1);
    plugin("next"); // rivela: i punti si assegnano
    finishRound();
    expect(w.engine.playerState(w.ids.ada!).me?.points).toBeGreaterThan(0);
    w.admin.removePlayer(w.event.id, w.ids.ada!);
    expect(w.engine.playerState(w.ids.ada!)).toMatchObject({ inRoster: false });
    expect(w.engine.rosterIds()).not.toContain(w.ids.ada);
    expect(w.engine.screenState().leaderboards?.players.map((p) => p.name)).not.toContain("ada");
    // Rimesso in serata ritrova i punti.
    w.admin.assignPlayer(w.event.id, w.ids.ada!, w.red.id);
    expect(w.engine.playerState(w.ids.ada!).me?.points).toBeGreaterThan(0);
  });

  it("durante un round le modifiche aspettano la fine del round", () => {
    start();
    next();
    const eli = newPlayer("eli", w.red.id);
    w.admin.removePlayer(w.event.id, w.ids.dan!);
    // Il round in corso continua con i giocatori di prima.
    expect(w.engine.rosterIds()).toContain(w.ids.dan);
    expect(w.engine.rosterIds()).not.toContain(eli);
    expect(w.engine.playerState(eli)).toEqual({ phase: "round", matchName: "Partita 1", inRoster: false, joining: true });
    expect(w.engine.adminState()).toMatchObject({ rosterPending: true, eventId: w.event.id });
    w.clock.t += 1_000;
    expect(answer("eli", 1)).toBe(false);
    expect(answer("dan", 1)).toBe(true);

    finishRound();
    expect(w.engine.rosterIds()).toContain(eli);
    expect(w.engine.rosterIds()).not.toContain(w.ids.dan);
    expect(w.engine.adminState().rosterPending).toBeUndefined();
    // I punti del round sono stati registrati con il roster di prima: dan li ha presi.
    const entries = w.scores.leaderboards(w.event.id);
    expect(entries.players.map((p) => p.name)).toContain("eli");
    expect(entries.players.map((p) => p.name)).not.toContain("dan");
  });

  it("una modifica annullata durante il round non lascia nulla in attesa", () => {
    start();
    next();
    w.admin.removePlayer(w.event.id, w.ids.dan!);
    expect(w.engine.adminState().rosterPending).toBe(true);
    w.admin.assignPlayer(w.event.id, w.ids.dan!, w.blue.id);
    expect(w.engine.adminState().rosterPending).toBeUndefined();
  });

  it("il cambio di squadra vale dal round dopo e i punti del round restano alla squadra di prima", () => {
    start();
    next();
    w.clock.t += 1_000;
    answer("ada", 1);
    w.admin.assignPlayer(w.event.id, w.ids.ada!, w.blue.id);
    expect(w.engine.playerState(w.ids.ada!).me?.teamId).toBe(w.red.id);
    plugin("next"); // rivela: i punti si assegnano
    finishRound();
    expect(w.engine.playerState(w.ids.ada!).me?.teamId).toBe(w.blue.id);
    const red = w.engine.screenState().leaderboards?.teams.find((t) => t.id === w.red.id);
    expect(red?.points).toBeGreaterThan(0);
  });

  it("senza giocatori in serata il round non parte", () => {
    start();
    for (const nick of ["ada", "bob", "cleo", "dan"]) w.admin.removePlayer(w.event.id, w.ids[nick]!);
    expect(next()).toEqual({ ok: false, error: "Nessun giocatore in serata: aggiungine dalla regia." });
  });

  it("la modifica in attesa sopravvive a un riavvio (fotografia)", () => {
    start();
    next();
    const eli = newPlayer("eli", w.red.id);
    const snap = w.engine.snapshot()!;
    const restored = JSON.parse(JSON.stringify(snap)) as typeof snap;
    w.engine.restore(restored);
    expect(w.engine.playerState(eli)).toMatchObject({ joining: true });
    finishRound();
    expect(w.engine.rosterIds()).toContain(eli);
  });
});
