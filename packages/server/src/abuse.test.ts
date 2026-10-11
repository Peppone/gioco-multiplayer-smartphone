import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ClientEvent, type JoinResult } from "@gioco/shared";
import { AdminAuth } from "./admin-auth.js";
import { openDb } from "./db.js";
import type { Engine } from "./engine.js";
import { PlayerService } from "./players.js";
import { Presence } from "./presence.js";
import { attachRealtime } from "./realtime.js";

// Un engine finto che conta gli input arrivati: si verifica solo il filtro davanti all'engine.
let http: HttpServer;
let url: string;
let received: unknown[] = [];
const sockets: Socket[] = [];

const fakeEngine = {
  version: 0,
  input: (_id: string, input: unknown) => (received.push(input), false),
  tick: () => false,
  screenState: () => ({ phase: "idle" }),
  adminState: () => ({ phase: "idle" }),
  playerState: () => ({ phase: "idle", inRoster: false }),
} as unknown as Engine;

beforeEach(async () => {
  received = [];
  http = createServer();
  const { db } = openDb(":memory:");
  attachRealtime(http, { service: new PlayerService(db), presence: new Presence(), engine: fakeEngine, adminAuth: new AdminAuth(db), now: () => 1_000 });
  await new Promise<void>((r) => http.listen(0, r));
  url = `http://localhost:${(http.address() as AddressInfo).port}`;
});

afterEach(async () => {
  sockets.splice(0).forEach((s) => s.disconnect());
  await new Promise<void>((r) => http.close(() => r()));
});

async function player(nick: string): Promise<Socket> {
  const s = connect(url, { auth: { role: "play" }, transports: ["websocket"], forceNew: true });
  sockets.push(s);
  const res = await new Promise<JoinResult>((resolve) => s.emit(ClientEvent.Create, { nickname: nick, avatar: "🦊", color: "#112233" }, resolve));
  expect(res.ok).toBe(true);
  return s;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("protezione dagli abusi", () => {
  it("una raffica di input da un telefono viene limitata a 20 al secondo", async () => {
    const s = await player("Spam");
    for (let i = 0; i < 200; i++) s.emit(ClientEvent.GameInput, { input: { type: "buzz" }, clientTime: 1 });
    await wait(300);
    expect(received).toHaveLength(20);
  });

  it("il limite è per giocatore: un altro telefono non ne risente", async () => {
    const a = await player("Anna");
    const b = await player("Bruno");
    for (let i = 0; i < 50; i++) a.emit(ClientEvent.GameInput, { input: { n: i }, clientTime: 1 });
    b.emit(ClientEvent.GameInput, { input: { from: "b" }, clientTime: 1 });
    await wait(300);
    expect(received).toContainEqual({ from: "b" });
    expect(received).toHaveLength(21);
  });

  it("un messaggio troppo grande chiude la connessione invece di essere elaborato", async () => {
    const s = await player("Gigante");
    const closed = new Promise<void>((resolve) => s.on("disconnect", () => resolve()));
    s.emit(ClientEvent.GameInput, { input: { blob: "x".repeat(200_000) }, clientTime: 1 });
    await Promise.race([closed, wait(2_000).then(() => Promise.reject(new Error("la connessione è rimasta aperta")))]);
    expect(received).toHaveLength(0);
  });
});
