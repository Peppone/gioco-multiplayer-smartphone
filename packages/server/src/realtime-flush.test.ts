import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { ClientEvent, type GamePlayerState, type GameScreenState, type JoinResult, ServerEvent } from "@gioco/shared";
import { AdminAuth } from "./admin-auth.js";
import { Presence } from "./presence.js";
import { attachRealtime } from "./realtime.js";
import { type World, buildWorld } from "./test-world.js";

/**
 * Accorpamento degli invii delle viste (`flush` in `realtime.ts`): nessun invio di viste identiche, un solo invio per gli
 * input a raffica, e il primo invio dopo una pausa parte subito. Giocatori veri su socket veri, quiz come minigioco.
 */

let http: HttpServer;
const sockets: Socket[] = [];

afterEach(async () => {
  sockets.splice(0).forEach((s) => s.disconnect());
  await new Promise<void>((r) => http.close(() => r()));
});

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Phone {
  socket: Socket;
  states: GamePlayerState[];
}

async function setup(flushMs: number) {
  const world: World = buildWorld();
  http = createServer();
  const presence = new Presence();
  const realtime = attachRealtime(http, { service: world.playerService, presence, engine: world.engine, adminAuth: new AdminAuth(world.db), flushMs });
  await new Promise<void>((r) => http.listen(0, r));
  const url = `http://localhost:${(http.address() as AddressInfo).port}`;

  const screen = connect(url, { auth: { role: "screen" }, transports: ["websocket"], forceNew: true });
  sockets.push(screen);
  const screenStates: GameScreenState[] = [];
  screen.on(ServerEvent.GameScreen, (s: GameScreenState) => screenStates.push(s));

  const phones: Record<string, Phone> = {};
  for (const nick of ["ada", "bob", "cleo", "dan"]) {
    const socket = connect(url, { auth: { role: "play" }, transports: ["websocket"], forceNew: true });
    sockets.push(socket);
    const phone: Phone = { socket, states: [] };
    socket.on(ServerEvent.GamePlayer, (s: GamePlayerState) => phone.states.push(s));
    const joined = await new Promise<JoinResult>((resolve) => socket.emit(ClientEvent.Resume, { token: world.tokens[nick] }, resolve));
    expect(joined.ok).toBe(true);
    phones[nick] = phone;
  }

  // la partita parte e si arriva alla prima domanda del quiz
  world.engine.hostCommand({ type: "start", matchId: world.match.id });
  world.engine.hostCommand({ type: "engine", action: "next" });
  realtime.tick();
  await wait(250);
  const settle = () => {
    Object.values(phones).forEach((p) => (p.states.length = 0));
    screenStates.length = 0;
  };
  settle();
  const answer = (nick: string, choice = 1) => phones[nick]!.socket.emit(ClientEvent.GameInput, { input: { type: "answer", choice }, clientTime: Date.now() });
  const answered = () => (screenStates.at(-1)?.frame?.view as { answered?: number } | undefined)?.answered;
  return { world, phones, screenStates, answer, answered, settle, realtime };
}

describe("invio accorpato delle viste", () => {
  it("una vista identica non si rimanda: chi non è toccato dall'input non riceve nulla", async () => {
    const { phones, answer } = await setup(80);
    answer("ada");
    await wait(300);
    expect(phones.ada!.states.length, "ada vede la sua risposta").toBe(1);
    expect(phones.bob!.states, "bob: la sua vista non è cambiata").toHaveLength(0);
    expect(phones.cleo!.states).toHaveLength(0);
    expect(phones.dan!.states).toHaveLength(0);
  });

  it("gli input a raffica si accorpano: lo schermo riceve meno messaggi degli input, con lo stato finale giusto", async () => {
    const { screenStates, answer, answered } = await setup(80);
    answer("ada");
    answer("bob");
    answer("cleo");
    answer("dan");
    await wait(400);
    expect(answered(), "stato finale completo").toBe(4);
    expect(screenStates.length, "messaggi allo schermo per 4 input").toBeLessThanOrEqual(2);
    expect(screenStates.length).toBeGreaterThanOrEqual(1);
  });

  it("il primo invio dopo una pausa parte subito, senza aspettare l'intervallo", async () => {
    const { phones, answer, settle } = await setup(400);
    await wait(450); // pausa più lunga dell'intervallo
    settle();
    const t0 = Date.now();
    answer("ada");
    await new Promise<void>((resolve) => {
      const check = () => (phones.ada!.states.length > 0 ? resolve() : setTimeout(check, 2));
      check();
    });
    expect(Date.now() - t0, "ritardo dell'invio").toBeLessThan(150);
  });

  it("con flushMs 0 non si accorpa: ogni input è un invio", async () => {
    const { screenStates, answer, answered } = await setup(0);
    answer("ada");
    answer("bob");
    answer("cleo");
    await wait(300);
    expect(answered()).toBe(3);
    expect(screenStates.length).toBe(3);
  });

  it("un telefono che rientra riceve subito la sua vista, anche se uguale all'ultima inviata", async () => {
    const { world, phones, answer, settle } = await setup(80);
    answer("ada");
    await wait(300);
    settle();
    const again = connect((phones.ada!.socket as unknown as { io: { uri: string } }).io.uri, { auth: { role: "play" }, transports: ["websocket"], forceNew: true });
    sockets.push(again);
    const got: GamePlayerState[] = [];
    again.on(ServerEvent.GamePlayer, (s: GamePlayerState) => got.push(s));
    await new Promise<JoinResult>((resolve) => again.emit(ClientEvent.Resume, { token: world.tokens.ada }, resolve));
    await wait(200);
    expect(got.length, "risincronizzazione dopo la riconnessione").toBeGreaterThanOrEqual(1);
    expect((got.at(-1)!.frame?.view as { myChoice?: number } | undefined)?.myChoice).toBe(1);
  });
});
