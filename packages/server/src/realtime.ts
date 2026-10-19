import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import {
  ClientEvent,
  type GameMasterState,
  type HostAck,
  type JoinResult,
  type LobbyView,
  type PublicPlayer,
  type ReactionEvent,
  ServerEvent,
  createPlayerSchema,
  gameInputSchema,
  hostCommandSchema,
  masterCommandSchema,
  reactionSchema,
  recoverSchema,
  resumeSchema,
  rttReportSchema,
} from "@gioco/shared";
import type { AdminAuth } from "./admin-auth.js";
import type { MasterAuth } from "./master-auth.js";
import type { PlayerRow } from "./db.js";
import type { Engine } from "./engine.js";
import type { PlayerResult, PlayerService } from "./players.js";
import type { Presence } from "./presence.js";
import { RateLimiter } from "./rate-limiter.js";

const SCREEN_ROOM = "screen";
const ADMIN_ROOM = "admin";
const MASTER_ROOM = "master";

type Ack<T> = (result: T) => void;

export interface RealtimeDeps {
  service: PlayerService;
  presence: Presence;
  engine: Engine;
  adminAuth: AdminAuth;
  /** Accesso del Game Master; senza, il ruolo "master" è disattivato. */
  masterAuth?: MasterAuth;
  now?: () => number;
  /**
   * Intervallo minimo (ms) tra due invii delle viste: gli input a raffica si accorpano in un solo invio (il primo dopo una pausa
   * parte subito, i successivi al più tardi dopo questo tempo). 0 = nessun accorpamento.
   */
  flushMs?: number;
}

/** Intervallo di accorpamento predefinito: un ordine di grandezza sotto i tempi umani, ma 1/8 degli invii di un passo ogni 100 ms. */
export const DEFAULT_FLUSH_MS = 80;

export interface Realtime {
  io: Server;
  /** Fa avanzare il tempo del round corrente (da chiamare ogni ~100 ms). */
  tick: () => void;
}

export function attachRealtime(httpServer: HttpServer, deps: RealtimeDeps): Realtime {
  const { service, presence, engine, adminAuth, masterAuth } = deps;
  const now = deps.now ?? Date.now;
  // Nessun messaggio legittimo supera pochi KB: un limite basso scoraggia l'abuso.
  const io = new Server(httpServer, { serveClient: false, maxHttpBufferSize: 64 * 1024 });

  const toPublic = (p: PlayerRow): PublicPlayer => ({
    id: p.id,
    nickname: p.nickname,
    avatar: p.avatar,
    color: p.color,
    connected: presence.isConnected(p.id),
    rttMs: presence.getRtt(p.id),
  });

  const lobby = (): LobbyView => ({ players: service.list().map(toPublic) });
  const broadcastLobby = () => io.to(SCREEN_ROOM).emit(ServerEvent.LobbyUpdate, lobby());

  // ---- Stato di gioco: ogni ruolo riceve solo la propria vista filtrata ----

  let sentVersion = -1;
  /** Reazioni: al massimo 5 ogni 5 secondi per giocatore, per non coprire lo schermo. */
  const reactionLimiter = new RateLimiter(5, 5000);
  /** Input di gioco: al massimo 20 al secondo per giocatore (un dito che martella il buzzer ne fa meno di 10). */
  const inputLimiter = new RateLimiter(20, 1000);
  /** Comandi del Game Master: 20 al secondo bastano per approvazioni a raffica. */
  const masterLimiter = new RateLimiter(20, 1000);

  /**
   * Ultima vista inviata a ogni telefono, come testo: una vista identica non si rimanda (con 30 telefoni, un cambio che tocca un
   * solo giocatore non deve costare 30 messaggi). Lo stesso per schermo, regia e Game Master.
   */
  const lastPlayerSent = new Map<string, string>();
  const lastRoomSent = new Map<string, string>();

  const sendPlayerState = (socketId: string, playerId: string) => {
    const state = engine.playerState(playerId);
    lastPlayerSent.set(socketId, JSON.stringify(state));
    io.to(socketId).emit(ServerEvent.GamePlayer, state);
  };

  /** Invia a una stanza solo se la vista è cambiata dall'ultimo invio a quella stanza. */
  const emitRoom = (room: string, event: string, state: unknown) => {
    const text = JSON.stringify(state);
    if (lastRoomSent.get(room) === text) return;
    lastRoomSent.set(room, text);
    io.to(room).emit(event, state);
  };

  const masterState = (): GameMasterState => ({
    ...engine.masterState(),
    players: engine.rosterIds().flatMap((id) => {
      const p = service.get(id);
      return p ? [toPublic(p)] : [];
    }),
  });

  const flushMs = deps.flushMs ?? DEFAULT_FLUSH_MS;
  let lastFlushAt = -Infinity;
  let pending: NodeJS.Timeout | null = null;

  /** Invia davvero le viste: solo quelle cambiate, solo a chi le ha cambiate. */
  const sendNow = () => {
    if (pending) {
      clearTimeout(pending);
      pending = null;
    }
    if (engine.version === sentVersion) return;
    sentVersion = engine.version;
    lastFlushAt = Date.now();
    emitRoom(SCREEN_ROOM, ServerEvent.GameScreen, engine.screenState());
    emitRoom(ADMIN_ROOM, ServerEvent.GameAdmin, engine.adminState());
    if (io.sockets.adapter.rooms.has(MASTER_ROOM)) emitRoom(MASTER_ROOM, ServerEvent.GameMaster, masterState());
    for (const [socketId, playerId] of presence.entries()) {
      const state = engine.playerState(playerId);
      const text = JSON.stringify(state);
      if (lastPlayerSent.get(socketId) === text) continue;
      lastPlayerSent.set(socketId, text);
      io.to(socketId).emit(ServerEvent.GamePlayer, state);
    }
  };

  /**
   * Invia le viste a tutti, ma solo se l'engine è cambiato dall'ultimo invio, e al massimo ogni `flushMs`: il primo cambio dopo una
   * pausa parte subito (nessun ritardo per un buzzer isolato), quelli a raffica si accorpano in un invio solo alla fine
   * dell'intervallo. L'ora equa degli input viene da `meta`, non dall'istante di invio: l'accorpamento non penalizza nessuno.
   */
  const flush = () => {
    if (engine.version === sentVersion) return;
    const wait = flushMs - (Date.now() - lastFlushAt);
    if (wait <= 0) return sendNow();
    pending ??= setTimeout(sendNow, wait);
    pending.unref();
  };

  const finishJoin = (socket: Socket, result: PlayerResult, ack: Ack<JoinResult>) => {
    if (!result.ok) return ack(result);
    presence.attach(socket.id, result.player.id);
    ack({ ok: true, player: toPublic(result.player), token: result.token, pin: result.pin });
    sendPlayerState(socket.id, result.player.id); // risincronizzazione dopo (ri)connessione
    broadcastLobby();
  };

  io.on("connection", (socket) => {
    const auth = socket.handshake.auth as { role?: string; token?: string } | undefined;
    const isAdmin = auth?.role === "admin" && adminAuth.verify(auth.token);
    const isMaster = auth?.role === "master" && !!masterAuth?.verify(auth.token);

    if (auth?.role === "screen") {
      void socket.join(SCREEN_ROOM);
      socket.emit(ServerEvent.LobbyUpdate, lobby());
      socket.emit(ServerEvent.GameScreen, engine.screenState());
    }
    if (isAdmin) {
      void socket.join(ADMIN_ROOM);
      socket.emit(ServerEvent.GameAdmin, engine.adminState());
    }

    // Un link del GM non valido (sbagliato, scaduto, revocato) viene chiuso subito: il telefono lo mostra all'utente.
    if (auth?.role === "master" && !isMaster) {
      socket.disconnect(true);
      return;
    }
    if (isMaster) {
      void socket.join(MASTER_ROOM);
      socket.emit(ServerEvent.GameMaster, masterState());
    }

    // L'ora server serve ai telefoni per sincronizzare l'orologio (buzzer, punti-velocità).
    socket.on(ClientEvent.TimeSync, (_payload: unknown, ack: Ack<number>) => {
      if (typeof ack === "function") ack(now());
    });

    socket.on(ClientEvent.Create, (payload: unknown, ack: Ack<JoinResult>) => {
      const parsed = createPlayerSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: "invalid" });
      finishJoin(socket, service.create(parsed.data), ack);
    });

    socket.on(ClientEvent.Resume, (payload: unknown, ack: Ack<JoinResult>) => {
      const parsed = resumeSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: "invalid" });
      finishJoin(socket, service.resume(parsed.data.token), ack);
    });

    socket.on(ClientEvent.Recover, (payload: unknown, ack: Ack<JoinResult>) => {
      const parsed = recoverSchema.safeParse(payload);
      if (!parsed.success) return ack({ ok: false, error: "invalid" });
      finishJoin(socket, service.recover(parsed.data.nickname, parsed.data.pin), ack);
    });

    socket.on(ClientEvent.RttReport, (payload: unknown) => {
      const playerId = presence.playerOf(socket.id);
      const parsed = rttReportSchema.safeParse(payload);
      if (!playerId || !parsed.success) return;
      presence.setRtt(playerId, parsed.data.rtt);
      broadcastLobby();
    });

    // Intenzioni dei giocatori: il server decide (validazione, ora equa, regole del plugin).
    socket.on(ClientEvent.GameInput, (payload: unknown) => {
      const playerId = presence.playerOf(socket.id);
      const parsed = gameInputSchema.safeParse(payload);
      if (!playerId || !parsed.success || !inputLimiter.allow(playerId, now())) return;
      engine.input(playerId, parsed.data.input, parsed.data.clientTime);
      flush();
    });

    socket.on(ClientEvent.Reaction, (payload: unknown) => {
      const playerId = presence.playerOf(socket.id);
      const parsed = reactionSchema.safeParse(payload);
      if (!playerId || !parsed.success || !reactionLimiter.allow(playerId, now())) return;
      const p = service.get(playerId);
      if (!p) return;
      const event: ReactionEvent = { emoji: parsed.data.emoji, playerId, nickname: p.nickname, color: p.color };
      io.to(SCREEN_ROOM).emit(ServerEvent.Reaction, event);
    });

    // Comandi della regia: solo socket autenticati come admin.
    socket.on(ClientEvent.HostCommand, (payload: unknown, ack: Ack<HostAck>) => {
      const reply = typeof ack === "function" ? ack : () => undefined;
      if (!isAdmin || !adminAuth.verify(auth?.token)) return reply({ ok: false, error: "unauthorized" });
      const parsed = hostCommandSchema.safeParse(payload);
      if (!parsed.success) return reply({ ok: false, error: "Comando non valido." });
      reply(engine.hostCommand(parsed.data));
      flush();
    });

    // Comandi del Game Master: solo quelli del plugin del round in corso, con il token ancora valido.
    socket.on(ClientEvent.MasterCommand, (payload: unknown, ack: Ack<HostAck>) => {
      const reply = typeof ack === "function" ? ack : () => undefined;
      if (!isMaster || !masterAuth?.verify(auth?.token)) return reply({ ok: false, error: "unauthorized" });
      if (!masterLimiter.allow(socket.id, now())) return reply({ ok: false, error: "Troppi comandi, rallenta." });
      const parsed = masterCommandSchema.safeParse(payload);
      if (!parsed.success) return reply({ ok: false, error: "Comando non valido." });
      reply(engine.masterCommand(parsed.data.command));
      flush();
    });

    socket.on("disconnect", () => {
      lastPlayerSent.delete(socket.id);
      if (presence.detach(socket.id)) broadcastLobby();
    });
  });

  // Token revocato o rigenerato dalla regia: il telefono del GM perde subito l'accesso.
  masterAuth?.onRevoke(() => io.in(MASTER_ROOM).disconnectSockets(true));

  return {
    io,
    tick: () => {
      engine.tick();
      // Un token scaduto o legato a una partita finita chiude i socket del GM.
      if (masterAuth) for (const [, sock] of io.sockets.sockets) if (sock.rooms.has(MASTER_ROOM) && !masterAuth.verify((sock.handshake.auth as { token?: string }).token)) sock.disconnect(true);
      flush();
    },
  };
}
