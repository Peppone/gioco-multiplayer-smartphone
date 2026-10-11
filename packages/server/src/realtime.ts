import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import {
  ClientEvent,
  type HostAck,
  type JoinResult,
  type LobbyView,
  type PublicPlayer,
  type ReactionEvent,
  ServerEvent,
  createPlayerSchema,
  gameInputSchema,
  hostCommandSchema,
  reactionSchema,
  recoverSchema,
  resumeSchema,
  rttReportSchema,
} from "@gioco/shared";
import type { AdminAuth } from "./admin-auth.js";
import type { PlayerRow } from "./db.js";
import type { Engine } from "./engine.js";
import type { PlayerResult, PlayerService } from "./players.js";
import type { Presence } from "./presence.js";
import { RateLimiter } from "./rate-limiter.js";

const SCREEN_ROOM = "screen";
const ADMIN_ROOM = "admin";

type Ack<T> = (result: T) => void;

export interface RealtimeDeps {
  service: PlayerService;
  presence: Presence;
  engine: Engine;
  adminAuth: AdminAuth;
  now?: () => number;
}

export interface Realtime {
  io: Server;
  /** Fa avanzare il tempo del round corrente (da chiamare ogni ~100 ms). */
  tick: () => void;
}

export function attachRealtime(httpServer: HttpServer, deps: RealtimeDeps): Realtime {
  const { service, presence, engine, adminAuth } = deps;
  const now = deps.now ?? Date.now;
  const io = new Server(httpServer, { serveClient: false });

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

  const sendPlayerState = (socketId: string, playerId: string) =>
    io.to(socketId).emit(ServerEvent.GamePlayer, engine.playerState(playerId));

  /** Invia le viste a tutti, ma solo se l'engine è cambiato dall'ultimo invio. */
  const flush = () => {
    if (engine.version === sentVersion) return;
    sentVersion = engine.version;
    io.to(SCREEN_ROOM).emit(ServerEvent.GameScreen, engine.screenState());
    io.to(ADMIN_ROOM).emit(ServerEvent.GameAdmin, engine.adminState());
    for (const [socketId, playerId] of presence.entries()) sendPlayerState(socketId, playerId);
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

    if (auth?.role === "screen") {
      void socket.join(SCREEN_ROOM);
      socket.emit(ServerEvent.LobbyUpdate, lobby());
      socket.emit(ServerEvent.GameScreen, engine.screenState());
    }
    if (isAdmin) {
      void socket.join(ADMIN_ROOM);
      socket.emit(ServerEvent.GameAdmin, engine.adminState());
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
      if (!playerId || !parsed.success) return;
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

    socket.on("disconnect", () => {
      if (presence.detach(socket.id)) broadcastLobby();
    });
  });

  return {
    io,
    tick: () => {
      engine.tick();
      flush();
    },
  };
}
