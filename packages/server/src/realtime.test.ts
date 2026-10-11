import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClientEvent, type JoinResult, type LobbyView, ServerEvent } from "@gioco/shared";
import { openDb } from "./db.js";
import { PlayerService } from "./players.js";
import { Presence } from "./presence.js";
import { AdminAuth } from "./admin-auth.js";
import { Engine } from "./engine.js";
import { attachRealtime } from "./realtime.js";
import { ScoreService } from "./scores.js";
import { minigames } from "@gioco/minigames";

let http: HttpServer;
let url: string;
const sockets: Socket[] = [];

const client = (role: string) => {
  const s = connect(url, { auth: { role }, transports: ["websocket"], forceNew: true });
  sockets.push(s);
  return s;
};
const emit = <T>(s: Socket, event: string, payload: unknown) =>
  new Promise<T>((resolve) => s.emit(event, payload, resolve));
const nextLobby = (s: Socket, pred: (l: LobbyView) => boolean) =>
  new Promise<LobbyView>((resolve) => {
    const handler = (l: LobbyView) => {
      if (pred(l)) {
        s.off(ServerEvent.LobbyUpdate, handler);
        resolve(l);
      }
    };
    s.on(ServerEvent.LobbyUpdate, handler);
  });

beforeEach(async () => {
  http = createServer();
  const { db } = openDb(":memory:");
  const presence = new Presence();
  const engine = new Engine({ db, registry: minigames, scores: new ScoreService(db), now: () => 123_456, rttOf: () => null });
  attachRealtime(http, { service: new PlayerService(db), presence, engine, adminAuth: new AdminAuth(db), now: () => 123_456 });
  await new Promise<void>((r) => http.listen(0, r));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterEach(async () => {
  sockets.splice(0).forEach((s) => s.disconnect());
  await new Promise<void>((r) => http.close(() => r()));
});

describe("realtime", () => {
  it("risponde con l'ora del server per la sincronizzazione", async () => {
    const s = client("play");
    expect(await emit<number>(s, ClientEvent.TimeSync, {})).toBe(123_456);
  });

  it("rifiuta messaggi non validi", async () => {
    const s = client("play");
    expect(await emit<JoinResult>(s, ClientEvent.Create, { nickname: "x" })).toEqual({ ok: false, error: "invalid" });
  });

  it("lo schermo vede entrare, uscire e rientrare un giocatore, con il ping", async () => {
    const screen = client("screen");
    await nextLobby(screen, () => true);

    const phone = client("play");
    const joined = await emit<JoinResult>(phone, ClientEvent.Create, { nickname: "Gina", avatar: "🦊", color: "#ff8800" });
    if (!joined.ok) throw new Error("join fallito");
    await nextLobby(screen, (l) => l.players[0]?.connected === true);

    phone.emit(ClientEvent.RttReport, { rtt: 87.4 });
    const withRtt = await nextLobby(screen, (l) => l.players[0]?.rttMs === 87);
    expect(withRtt.players[0]?.nickname).toBe("Gina");

    phone.disconnect(); // telefono bloccato / rete persa
    await nextLobby(screen, (l) => l.players[0]?.connected === false);

    const phone2 = client("play"); // il telefono si risveglia e rientra col token
    const back = await emit<JoinResult>(phone2, ClientEvent.Resume, { token: joined.token });
    expect(back.ok && back.player.id).toBe(joined.player.id);
    await nextLobby(screen, (l) => l.players[0]?.connected === true);
  });

  it("un client non-schermo non riceve la lobby", async () => {
    const phone = client("play");
    let received = false;
    phone.on(ServerEvent.LobbyUpdate, () => (received = true));
    const other = client("play");
    await emit(other, ClientEvent.Create, { nickname: "Gino", avatar: "🐻", color: "#00aa55" });
    await new Promise((r) => setTimeout(r, 100));
    expect(received).toBe(false);
  });
});
