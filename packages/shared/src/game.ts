import { z } from "zod";
import type { HostView, ThemeId } from "./minigame.js";

// ---- Classifiche ----

export interface LeaderRow {
  id: string;
  name: string;
  avatar?: string;
  color: string;
  points: number;
  rank: number;
}

export interface Leaderboards {
  players: LeaderRow[];
  teams: LeaderRow[];
}

// ---- Stato della partita live ----

/** idle: nessuna partita · ready: pronta, nessun round attivo · round · results: dopo un round · ended */
export type GamePhase = "idle" | "ready" | "round" | "results" | "ended";

/** Il contenuto di un minigioco già filtrato per chi lo guarda (`screenView` / `viewFor`). */
export interface MinigameFrame {
  typeId: string;
  title: string;
  theme: ThemeId;
  view: unknown;
}

export interface GameScreenState {
  phase: GamePhase;
  eventName?: string;
  matchName?: string;
  /** 1-based; 0 prima del primo round. */
  roundNumber: number;
  roundCount: number;
  frame?: MinigameFrame;
  leaderboards?: Leaderboards;
}

export interface GamePlayerState {
  phase: GamePhase;
  matchName?: string;
  /** False se il giocatore non fa parte della serata in corso: vede solo l'attesa. */
  inRoster: boolean;
  /** 1-based; presente quando il giocatore è in serata. */
  roundNumber?: number;
  frame?: MinigameFrame;
  me?: { points: number; rank: number | null; teamId: string | null; teamName: string | null };
}

export interface GameAdminState extends GameScreenState {
  matchId?: string;
  rounds: { id: string; title: string; typeId: string }[];
  host?: HostView;
  engineActions: { id: string; label: string; enabled: boolean; danger?: boolean }[];
}

// ---- Comandi della regia ----

export const hostCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), matchId: z.string().min(1) }),
  z.object({ type: z.literal("engine"), action: z.enum(["next", "finish-round", "end-match"]) }),
  z.object({ type: z.literal("plugin"), command: z.record(z.string(), z.unknown()) }),
  z.object({
    type: z.literal("adjust"),
    playerId: z.string().min(1).nullable().default(null),
    teamId: z.string().min(1).nullable().default(null),
    points: z.number().int().min(-10_000).max(10_000),
    reason: z.string().trim().min(1).max(80),
  }),
]);

export type HostCommand = z.infer<typeof hostCommandSchema>;

export const gameInputSchema = z.object({
  input: z.unknown(),
  /** Ora della pressione, già convertita in "ora server" con l'offset misurato. */
  clientTime: z.number(),
});

export type HostAck = { ok: true } | { ok: false; error: string };
