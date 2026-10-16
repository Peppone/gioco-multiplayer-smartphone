import { z } from "zod";

// ---- Schemi dei messaggi client → server (validati sempre lato server) ----

export const nicknameSchema = z.string().trim().min(2).max(16);

export const createPlayerSchema = z.object({
  nickname: nicknameSchema,
  avatar: z.string().min(1).max(16),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});

export const resumeSchema = z.object({ token: z.string().min(16).max(128) });

export const recoverSchema = z.object({
  nickname: nicknameSchema,
  pin: z.string().regex(/^\d{4}$/),
});

export const rttReportSchema = z.object({ rtt: z.number().min(0).max(60_000) });

export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;
export type ResumeInput = z.infer<typeof resumeSchema>;
export type RecoverInput = z.infer<typeof recoverSchema>;

// ---- Viste inviate ai client ----

export interface PublicPlayer {
  id: string;
  nickname: string;
  avatar: string;
  color: string;
  connected: boolean;
  /** Latenza misurata dal telefono, null finché non è disponibile. */
  rttMs: number | null;
}

export interface LobbyView {
  players: PublicPlayer[];
}

export type JoinError = "invalid" | "nickname_taken" | "bad_credentials" | "too_many_attempts";

export type JoinResult =
  | {
      ok: true;
      player: PublicPlayer;
      /** Da salvare sul telefono (localStorage) per rientrare automaticamente. */
      token: string;
      /** Presente solo alla creazione: serve a recuperare il profilo da un altro telefono. */
      pin?: string;
    }
  | { ok: false; error: JoinError };

// ---- Nomi degli eventi socket ----

export const ClientEvent = {
  Create: "player:create",
  Resume: "player:resume",
  Recover: "player:recover",
  TimeSync: "time:sync",
  RttReport: "rtt:report",
  GameInput: "game:input",
  HostCommand: "host:cmd",
  Reaction: "reaction:send",
  MasterCommand: "master:cmd",
} as const;

export const ServerEvent = {
  LobbyUpdate: "lobby:update",
  GameScreen: "game:screen",
  GamePlayer: "game:player",
  GameAdmin: "game:admin",
  Reaction: "reaction",
  GameMaster: "game:master",
} as const;

export type Role = "screen" | "play" | "admin" | "master";

// ---- Reazioni emoji (interazione blanda, sempre disponibile) ----

export const REACTIONS = ["👏", "😂", "😮", "🔥", "❤️", "😭"] as const;
export type ReactionEmoji = (typeof REACTIONS)[number];

export const reactionSchema = z.object({ emoji: z.enum(REACTIONS) });

/** Reazione inoltrata allo schermo condiviso. */
export interface ReactionEvent {
  emoji: ReactionEmoji;
  playerId: string;
  nickname: string;
  color: string;
}
