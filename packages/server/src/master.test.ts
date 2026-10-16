import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stanzeSegrete } from "@gioco/minigames";
import { ClientEvent, type GameMasterState, type HostAck, ServerEvent } from "@gioco/shared";
import { AdminAuth } from "./admin-auth.js";
import { MasterAuth } from "./master-auth.js";
import { Presence } from "./presence.js";
import { attachRealtime } from "./realtime.js";
import { type World, buildWorld } from "./test-world.js";

let w: World;
let masterMatch: string;

/** Aggiunge al mondo di prova una seconda partita con un solo round «Stanze Segrete». */
function addStanzeMatch(world: World) {
  const inst = world.admin.library.createInstance({ typeId: "stanze-segrete", title: "Complesso", config: stanzeSegrete.sampleConfig });
  if (!inst.ok) throw new Error(inst.error);
  const m = world.admin.createMatch(world.event.id, { name: "GDR" });
  if (!m.ok) throw new Error(m.error);
  world.admin.library.addRound(m.value.id, inst.value.id);
  return m.value.id;
}

const pluginCmd = (command: Record<string, unknown>) => w.engine.hostCommand({ type: "plugin", command });
const startRound = () => {
  expect(w.engine.hostCommand({ type: "start", matchId: masterMatch })).toEqual({ ok: true });
  expect(w.engine.hostCommand({ type: "engine", action: "next" })).toEqual({ ok: true });
};

beforeEach(() => {
  w = buildWorld();
  masterMatch = addStanzeMatch(w);
});

describe("MasterAuth", () => {
  const mk = (active: () => string | null, t = { v: 1000 }) => ({ auth: new MasterAuth(w.db, active, () => t.v), t });

  it("token sbagliato, scaduto, revocato o di un'altra partita sono rifiutati", () => {
    let active: string | null = "m1";
    const { auth, t } = mk(() => active);
    const { token } = auth.issue("m1");
    expect(auth.verify(token)).toBe(true);
    expect(auth.verify("sbagliato")).toBe(false);
    expect(auth.verify(undefined)).toBe(false);
    active = "m2";
    expect(auth.verify(token)).toBe(false); // partita finita o diversa
    active = "m1";
    t.v += 12 * 3600_000 + 1;
    expect(auth.verify(token)).toBe(false); // scaduto
    t.v = 1000;
    auth.revoke();
    expect(auth.verify(token)).toBe(false);
  });

  it("un nuovo token revoca il precedente e il database non contiene il token in chiaro", () => {
    const { auth } = mk(() => "m1");
    let revoked = 0;
    auth.onRevoke(() => revoked++);
    const first = auth.issue("m1");
    const second = auth.issue("m1");
    expect(revoked).toBe(1);
    expect(auth.verify(first.token)).toBe(false);
    expect(auth.verify(second.token)).toBe(true);
    const rows = w.db.$client.prepare("select value from settings").all();
    expect(JSON.stringify(rows)).not.toContain(second.token);
  });
});

describe("Engine con Game Master", () => {
  it("il comando del GM vale solo per il plugin di un round con master", () => {
    startRound();
    expect(w.engine.masterAvailable).toBe(true);
    expect(w.engine.masterCommand({ type: "place-spread" })).toEqual({ ok: true });
    expect(w.engine.masterCommand({ type: "inventato" })).toEqual({ ok: false, error: "Comando non valido." });
  });

  it("un round senza master rifiuta i comandi del GM e non gli mostra nulla", () => {
    const s = w.engine.hostCommand({ type: "start", matchId: w.match.id });
    expect(s.ok).toBe(true);
    w.engine.hostCommand({ type: "engine", action: "next" }); // quiz
    expect(w.engine.masterAvailable).toBe(false);
    expect(w.engine.masterCommand({ type: "answer" })).toEqual({ ok: false, error: "Questo round non ha un Game Master." });
    expect(w.engine.masterState().host).toBeUndefined();
  });

  it("masterState espone la vista della regia del plugin, senza la classifica", () => {
    startRound();
    const st = w.engine.masterState();
    expect(st).toMatchObject({ phase: "round", typeId: "stanze-segrete" });
    expect(JSON.stringify(st)).toContain("rooms");
    expect(st).not.toHaveProperty("leaderboards");
  });

  it("con più giocatori del massimo il round non parte e la regia riceve un messaggio chiaro", () => {
    for (let i = 0; i < 7; i++) {
      const r = w.playerService.create({ nickname: `extra${i}`, avatar: "🦊", color: "#112233" });
      if (!r.ok) throw new Error("player");
      w.admin.assignPlayer(w.event.id, r.player.id, null);
    }
    expect(w.engine.hostCommand({ type: "start", matchId: masterMatch })).toEqual({ ok: true });
    const res = w.engine.hostCommand({ type: "engine", action: "next" });
    expect(res).toEqual({ ok: false, error: "Complesso: massimo 10 giocatori, in serata ce ne sono 11." });
    expect(w.engine.screenState().phase).toBe("ready");
  });
});

describe("Salvataggio di messaggi ed eventi", () => {
  const rows = () => w.db.$client.prepare("select message_id, kind, text, read_at from round_messages order by message_id").all() as any[];

  const setup = () => {
    startRound();
    pluginCmd({ type: "place-spread" });
    pluginCmd({ type: "start" });
  };

  it("ogni messaggio ed evento finisce nel database, senza duplicati, con ricevute e letture aggiornate", () => {
    setup();
    pluginCmd({ type: "message", to: { player: w.ids.ada! }, text: "Ciao Ada" });
    pluginCmd({ type: "event", to: [w.ids.ada!, w.ids.bob!], text: "Crolla il soffitto" });
    expect(rows().map((r) => [r.kind, r.text])).toEqual([["message", "Ciao Ada"], ["event", "Crolla il soffitto"]]);

    w.clock.t += 500;
    w.engine.input(w.ids.ada!, { type: "accept-event", eventId: 2 }, w.clock.t);
    w.engine.input(w.ids.ada!, { type: "ack", messageId: 1 }, w.clock.t);
    const rec = w.db.$client.prepare("select player_id, accepted_at from round_event_receipts where message_id = 2 order by player_id").all() as any[];
    expect(rec).toHaveLength(2);
    expect(rec.find((r) => r.player_id === w.ids.ada)!.accepted_at).toBe(w.clock.t);
    expect(rec.find((r) => r.player_id === w.ids.bob)!.accepted_at).toBeNull();
    expect(rows()[0].read_at).toBe(w.clock.t);
    expect(rows()).toHaveLength(2);
  });

  it("l'accettazione ripetuta e un nuovo salvataggio non duplicano nulla; l'archivio ritrova tutto", () => {
    setup();
    pluginCmd({ type: "event", to: "all", text: "Luci spente" });
    w.engine.input(w.ids.cleo!, { type: "accept-event", eventId: 1 }, w.clock.t);
    w.engine.input(w.ids.cleo!, { type: "accept-event", eventId: 1 }, w.clock.t + 99);
    // un nuovo store senza cache (come dopo un riavvio) riscrive le stesse righe senza duplicarle
    w.engine.messageStore.persist({ eventId: w.event.id, matchId: masterMatch, roundId: w.engine.adminState().rounds[0]!.id }, stanzeSegrete.messages!((w.engine as any).live.roundState));
    expect(rows()).toHaveLength(1);
    const archive = w.engine.messageStore.list(w.event.id);
    expect(archive).toHaveLength(1);
    expect(archive[0]).toMatchObject({ kind: "event", text: "Luci spente", roundTitle: "Complesso", matchName: "GDR" });
    expect(archive[0]!.recipients).toHaveLength(4);
    expect(archive[0]!.recipients.filter((r) => r.acceptedAt !== null).map((r) => r.nickname)).toEqual(["cleo"]);
  });

  it("oltre i 300 messaggi lo stato ne tiene 300 ma il database li ha tutti", () => {
    setup();
    for (let i = 0; i < 320; i++) pluginCmd({ type: "message", to: "all", text: `m${i}` });
    expect(((w.engine as any).live.roundState.messages as unknown[]).length).toBe(300);
    expect(rows()).toHaveLength(320);
  });

  it("cancellare una serata toglie messaggi e ricevute", () => {
    setup();
    pluginCmd({ type: "event", to: "all", text: "x" });
    expect(w.engine.messageStore.deleteForEvent(w.event.id)).toBe(1);
    expect(w.engine.messageStore.list(w.event.id)).toEqual([]);
    expect(w.db.$client.prepare("select count(*) as n from round_event_receipts").get()).toEqual({ n: 0 });
  });

  it("i messaggi si salvano anche se il round si chiude subito dopo", () => {
    setup();
    pluginCmd({ type: "message", to: "all", text: "Ultimo" });
    pluginCmd({ type: "end" });
    expect(rows().map((r) => r.text)).toEqual(["Ultimo"]);
  });
});

describe("Realtime del Game Master", () => {
  let http: HttpServer;
  let url: string;
  let masterAuth: MasterAuth;
  const sockets: Socket[] = [];

  beforeEach(async () => {
    http = createServer();
    masterAuth = new MasterAuth(w.db, () => w.engine.activeMatchId, () => w.clock.t);
    attachRealtime(http, {
      service: w.playerService,
      presence: new Presence(),
      engine: w.engine,
      adminAuth: new AdminAuth(w.db, () => w.clock.t),
      masterAuth,
      now: () => w.clock.t,
    });
    await new Promise<void>((r) => http.listen(0, r));
    url = `http://localhost:${(http.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    sockets.splice(0).forEach((s) => s.disconnect());
    await new Promise<void>((r) => http.close(() => r()));
  });

  const open = (auth: object) => {
    const s = connect(url, { auth, transports: ["websocket"], forceNew: true });
    sockets.push(s);
    return s;
  };
  const emit = <T>(s: Socket, ev: string, payload: unknown) => new Promise<T>((r) => s.emit(ev, payload, r));
  const nextState = (s: Socket, pred: (m: GameMasterState) => boolean = () => true) =>
    new Promise<GameMasterState>((resolve) => {
      const h = (m: GameMasterState) => {
        if (pred(m)) {
          s.off(ServerEvent.GameMaster, h);
          resolve(m);
        }
      };
      s.on(ServerEvent.GameMaster, h);
    });

  it("un token sbagliato non riceve nulla e non può comandare", async () => {
    startRound();
    const bad = open({ role: "master", token: "sbagliato" });
    let got = 0;
    bad.on(ServerEvent.GameMaster, () => got++);
    await new Promise((r) => bad.on("connect", r));
    expect(await emit<HostAck>(bad, ClientEvent.MasterCommand, { type: "plugin", command: { type: "place-spread" } })).toEqual({ ok: false, error: "unauthorized" });
    expect(got).toBe(0);
  });

  it("il GM con il link riceve la sua vista, comanda solo il plugin e non può usare engine né admin", async () => {
    startRound();
    const { token } = masterAuth.issue(masterMatch);
    const gm = open({ role: "master", token });
    const first = await nextState(gm);
    expect(first.players).toHaveLength(4);
    expect(first.host).toBeDefined();

    const updated = nextState(gm, (m) => JSON.stringify(m.host).includes('"unplaced":0'));
    expect(await emit<HostAck>(gm, ClientEvent.MasterCommand, { type: "plugin", command: { type: "place-spread" } })).toEqual({ ok: true });
    await updated;

    // né comandi della regia né rettifiche: lo schema del GM accetta solo «plugin»
    for (const cmd of [{ type: "engine", action: "end-match" }, { type: "adjust", playerId: w.ids.ada, points: 99, reason: "x" }, { type: "start", matchId: w.match.id }]) {
      expect(await emit<HostAck>(gm, ClientEvent.MasterCommand, cmd)).toEqual({ ok: false, error: "Comando non valido." });
      expect(await emit<HostAck>(gm, ClientEvent.HostCommand, cmd)).toEqual({ ok: false, error: "unauthorized" });
    }
    expect(w.engine.screenState().phase).toBe("round");
  });

  it("revocare il link disconnette subito il GM; poi non rientra con il vecchio token", async () => {
    startRound();
    const { token } = masterAuth.issue(masterMatch);
    const gm = open({ role: "master", token });
    await nextState(gm);
    const closed = new Promise((r) => gm.on("disconnect", r));
    masterAuth.revoke();
    await closed;
    const again = open({ role: "master", token });
    let got = 0;
    again.on(ServerEvent.GameMaster, () => got++);
    await new Promise((r) => again.on("connect", r));
    expect(got).toBe(0);
  });

  it("con un round senza master il GM non riceve la vista del round", async () => {
    w.engine.hostCommand({ type: "start", matchId: w.match.id });
    w.engine.hostCommand({ type: "engine", action: "next" });
    const { token } = masterAuth.issue(w.match.id);
    const gm = open({ role: "master", token });
    const st = await nextState(gm);
    expect(st.host).toBeUndefined();
    expect(await emit<HostAck>(gm, ClientEvent.MasterCommand, { type: "plugin", command: { type: "answer" } })).toEqual({ ok: false, error: "Questo round non ha un Game Master." });
  });

  it("al riavvio del GM (nuova connessione) lo stato è subito completo", async () => {
    startRound();
    const { token } = masterAuth.issue(masterMatch);
    const a = open({ role: "master", token });
    await nextState(a);
    await emit<HostAck>(a, ClientEvent.MasterCommand, { type: "plugin", command: { type: "message", to: "all", text: "Benvenuti" } });
    a.disconnect();
    const b = open({ role: "master", token });
    expect(JSON.stringify((await nextState(b)).host)).toContain("Benvenuti");
  });
});
