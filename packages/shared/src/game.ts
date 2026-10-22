import { z } from "zod";
import type { HostView, ThemeId } from "./minigame.js";
import type { PublicPlayer } from "./protocol.js";

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
  /** Aggiunto alla serata durante un round: entra dal prossimo. */
  joining?: boolean;
  /** 1-based; presente quando il giocatore è in serata. */
  roundNumber?: number;
  frame?: MinigameFrame;
  me?: { points: number; rank: number | null; teamId: string | null; teamName: string | null };
}

/** Squadra temporanea: vale al posto delle squadre della serata, ma solo per i round a squadre. */
export interface TempTeam {
  /** Assegnato dal server (`temp-1`, `temp-2`…). */
  id: string;
  name: string;
  color: string;
  members: string[];
  captain?: string;
}

export interface GameAdminState extends GameScreenState {
  matchId?: string;
  eventId?: string;
  /** Squadre temporanee attive: valgono dal prossimo round a squadre, finché la regia non le toglie o la partita finisce. */
  tempTeams?: TempTeam[];
  /** Giocatori della serata cambiati durante il round: valgono dal prossimo. */
  rosterPending?: boolean;
  rounds: { id: string; title: string; typeId: string }[];
  host?: HostView;
  /** Il round in corso ha un Game Master: la regia può generare il link per il suo telefono. */
  master?: boolean;
  engineActions: { id: string; label: string; enabled: boolean; danger?: boolean }[];
}

/** Vista del Game Master: solo il round in corso, se il plugin lo prevede (`master: true`). */
export interface GameMasterState {
  phase: GamePhase;
  matchName?: string;
  roundTitle?: string;
  typeId?: string;
  /** La `hostView` del plugin: presente solo se il round in corso ha un'interfaccia per il GM. */
  host?: HostView;
  /** Giocatori della partita (il GM non è tra loro). */
  players: PublicPlayer[];
}

/** Il GM può inviare soltanto comandi del plugin del round in corso. */
export const masterCommandSchema = z.object({ type: z.literal("plugin"), command: z.record(z.string(), z.unknown()) });
export type MasterCommand = z.infer<typeof masterCommandSchema>;

// ---- Comandi della regia ----

export const tempTeamsInputSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(24),
      color: z.string().regex(/^#[0-9a-f]{6}$/i),
      members: z.array(z.string().min(1)).min(1).max(100),
      captain: z.string().min(1).optional(),
    }),
  )
  .min(1)
  .max(12);
export type TempTeamsInput = z.infer<typeof tempTeamsInputSchema>;

export const hostCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("start"), matchId: z.string().min(1) }),
  /** Imposta le squadre temporanee, oppure (`teams: null`) le toglie e si torna alle squadre della serata. */
  z.object({ type: z.literal("temp-teams"), teams: tempTeamsInputSchema.nullable() }),
  z.object({ type: z.literal("engine"), action: z.enum(["next", "finish-round", "end-match", "close"]) }),
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
