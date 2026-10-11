import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { minigames } from "@gioco/minigames";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ClientEvent,
  type GameAdminState,
  type GamePlayerState,
  type GameScreenState,
  type HostAck,
  type HostCommand,
  type JoinResult,
  ServerEvent,
} from "@gioco/shared";
import { AdminAuth } from "./admin-auth.js";
import { Engine } from "./engine.js";
import { Presence } from "./presence.js";
import { attachRealtime, type Realtime } from "./realtime.js";
import { ScoreService } from "./scores.js";
import { type World, buildWorld } from "./test-world.js";

let w: World;
let http: HttpServer;
let url: string;
let realtime: Realtime;
let ticker: NodeJS.Timeout;
let adminToken: string;
const sockets: Socket[] = [];

/** Tutto ciò che un socket riceve, serializzato: serve per i controlli anti-leak sul traffico. */
class Tap {
  readonly raw: string[] = [];
  screen: GameScreenState | null = null;
  player: GamePlayerState | null = null;
  admin: GameAdminState | null = null;
  constructor(readonly socket: Socket) {
    socket.on(ServerEvent.GameScreen, (s: GameScreenState) => ((this.screen = s), this.raw.push(JSON.stringify(s))));
    socket.on(ServerEvent.GamePlayer, (s: GamePlayerState) => ((this.player = s), this.raw.push(JSON.stringify(s))));
    socket.on(ServerEvent.GameAdmin, (s: GameAdminState) => ((this.admin = s), this.raw.push(JSON.stringify(s))));
  }
  get traffic() {
    return this.raw.join("\n");
  }
}

const open = (auth: object) => {
  const s = connect(url, { auth, transports: ["websocket"], forceNew: true });
  sockets.push(s);
  return new Tap(s);
};
const emit = <T>(s: Socket, event: string, payload: unknown) => new Promise<T>((r) => s.emit(event, payload, r));
const until = async (cond: () => boolean, label: string) => {
  for (let i = 0; i < 200; i++) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timeout: ${label}`);
};

async function player(nick: string) {
  const tap = open({ role: "play" });
  await until(() => tap.socket.connected, "connect");
  const res = await emit<JoinResult>(tap.socket, ClientEvent.Resume, { token: w.tokens[nick] });
  expect(res.ok).toBe(true);
  await until(() => tap.player !== null, "stato iniziale");
  return tap;
}

const host = (tap: Tap, cmd: HostCommand) => emit<HostAck>(tap.socket, ClientEvent.HostCommand, cmd);

beforeEach(async () => {
  w = buildWorld();
  const presence = new Presence();
  const adminAuth = new AdminAuth(w.db);
  const setup = adminAuth.setup("password-segreta");
  if (!setup.ok) throw new Error("setup");
  adminToken = setup.token;
  const engine = new Engine({
    db: w.db,
    registry: minigames,
    scores: new ScoreService(w.db),
    now: Date.now,
    rttOf: (id) => presence.getRtt(id),
  });
  http = createServer();
  realtime = attachRealtime(http, { service: w.playerService, presence, engine, adminAuth });
  ticker = setInterval(realtime.tick, 20);
  await new Promise<void>((r) => http.listen(0, r));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterEach(async () => {
  clearInterval(ticker);
  sockets.splice(0).forEach((s) => s.disconnect());
  await new Promise<void>((r) => http.close(() => r()));
});

describe("partita via socket", () => {
  it("solo la regia autenticata può inviare comandi", async () => {
    const intruder = open({ role: "play" });
    await until(() => intruder.socket.connected, "connect");
    expect(await host(intruder, { type: "start", matchId: w.match.id })).toEqual({ ok: false, error: "unauthorized" });

    const fake = open({ role: "admin", token: "falso" });
    await until(() => fake.socket.connected, "connect");
    expect(await host(fake, { type: "start", matchId: w.match.id })).toEqual({ ok: false, error: "unauthorized" });

    const admin = open({ role: "admin", token: adminToken });
    await until(() => admin.socket.connected, "connect");
    expect(await host(admin, { type: "start", matchId: w.match.id })).toEqual({ ok: true });
  });

  it("quiz giocato dal vivo: viste filtrate per ruolo e nessuna fuga nel traffico", async () => {
    const screen = open({ role: "screen" });
    const admin = open({ role: "admin", token: adminToken });
    const ada = await player("ada");
    const dan = await player("dan");
    await until(() => admin.admin !== null && screen.screen !== null, "stati iniziali");

    await host(admin, { type: "start", matchId: w.match.id });
    await until(() => ada.player?.phase === "ready", "ready");
    await host(admin, { type: "engine", action: "next" });
    await until(() => dan.player?.frame?.typeId === "quiz-multipla", "round quiz");

    emit(ada.socket, ClientEvent.GameInput, { input: { type: "answer", choice: 1 }, clientTime: Date.now() });
    await until(() => (ada.player?.frame?.view as { myChoice: number | null })?.myChoice === 1, "risposta registrata");

    // Durante la domanda nessuno, tranne la regia, riceve la risposta corretta.
    expect(screen.traffic).not.toMatch(/correct/i);
    expect(ada.traffic).not.toMatch(/correct/i);
    expect(dan.traffic).not.toMatch(/correct/i);
    expect(admin.traffic).toMatch(/correct/);
    // dan non vede la scelta di ada
    expect((dan.player?.frame?.view as { myChoice: number | null }).myChoice).toBeNull();

    await host(admin, { type: "plugin", command: { type: "next" } });
    await until(() => (screen.screen?.frame?.view as { reveal?: unknown })?.reveal !== undefined, "rivelazione");
    expect(JSON.stringify(screen.screen)).toContain("correctIndex");
  });

  it("buzzer: vince chi ha premuto per primo anche se il suo messaggio arriva dopo", async () => {
    const admin = open({ role: "admin", token: adminToken });
    const ada = await player("ada");
    const bob = await player("bob");
    await until(() => admin.admin !== null, "admin");
    await host(admin, { type: "start", matchId: w.match.id });
    await host(admin, { type: "engine", action: "next" }); // quiz
    await host(admin, { type: "engine", action: "finish-round" });
    await host(admin, { type: "engine", action: "next" }); // buzzer
    await host(admin, { type: "plugin", command: { type: "open" } });
    await until(() => (ada.player?.frame?.view as { canBuzz?: boolean })?.canBuzz === true, "buzzer aperto");

    // ada preme per prima ma la sua rete è lenta (180 ms); bob preme 50 ms dopo e arriva subito.
    const pressedAt = Date.now();
    setTimeout(() => ada.socket.emit(ClientEvent.GameInput, { input: { type: "buzz" }, clientTime: pressedAt }), 180);
    setTimeout(() => bob.socket.emit(ClientEvent.GameInput, { input: { type: "buzz" }, clientTime: pressedAt + 50 }), 50);

    await until(() => (admin.admin?.host?.info as { answering?: string })?.answering != null, "qualcuno risponde");
    const info = admin.admin!.host!.info as { answering: string; queue: string[] };
    expect(info.answering).toBe("ada");
    expect(info.queue).toEqual(["ada", "bob"]);
    // La risposta segreta non arriva ai telefoni.
    expect(ada.traffic + bob.traffic).not.toContain("SEGRETA");
  });
});
