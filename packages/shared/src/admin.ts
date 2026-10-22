import { z } from "zod";

// ---- Input dell'admin (validati lato server) ----

export const passwordSchema = z.string().min(8).max(128);

export const passwordBody = z.object({ password: passwordSchema });

const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i);

export const teamInputSchema = z.object({
  name: z.string().trim().min(1).max(24),
  color: colorSchema,
  emblem: z.string().min(1).max(16),
});

export const eventInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export const eventStatusSchema = z.enum(["draft", "live", "closed"]);

export const eventPatchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  status: eventStatusSchema.optional(),
});

export const eventTeamsSchema = z.object({ teamIds: z.array(z.string().min(1)).max(16) });

export const assignPlayerSchema = z.object({ teamId: z.string().min(1).nullable() });

export const captainSchema = z.object({ captain: z.boolean() });

export const matchInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export const matchPatchSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
});

export type TeamInput = z.infer<typeof teamInputSchema>;
export type EventInput = z.infer<typeof eventInputSchema>;
export type EventStatus = z.infer<typeof eventStatusSchema>;

// ---- Viste dell'admin ----

export interface TeamView {
  id: string;
  name: string;
  color: string;
  emblem: string;
}

export interface AdminPlayerView {
  id: string;
  nickname: string;
  avatar: string;
  color: string;
}

/** Giocatore visto dalla regia con il PIN (`null` per i profili creati prima: si può generarne uno nuovo). */
export interface AdminPlayerDetail extends AdminPlayerView {
  pin: string | null;
  createdAt: number;
}

export interface RoundView {
  id: string;
  order: number;
  instanceId: string;
  title: string;
  typeId: string;
}

export interface MatchView {
  id: string;
  order: number;
  name: string;
  status: "pending" | "running" | "done";
  rounds: RoundView[];
}

export const instanceInputSchema = z.object({
  typeId: z.string().min(1).max(40),
  title: z.string().trim().min(1).max(80),
  theme: z.enum(["gameshow", "pixel", "manga", "retro80", "boom"]).optional(),
  /** Validata dal `configSchema` del tipo di minigioco. */
  config: z.unknown(),
});

export const roundInputSchema = z.object({ instanceId: z.string().min(1) });

export const roundOrderSchema = z.object({ roundIds: z.array(z.string().min(1)).max(100) });

export interface InstanceView {
  id: string;
  typeId: string;
  title: string;
  theme: "gameshow" | "pixel" | "manga" | "retro80" | "boom";
  config: unknown;
}

export interface MinigameTypeView {
  id: string;
  /** minigame: si aggiunge come round · content: contenuto della libreria (es. mazzo di carte) */
  kind: "minigame" | "content";
  title: string;
  defaultTheme: "gameshow" | "pixel" | "manga" | "retro80" | "boom";
  sampleConfig: unknown;
  /** Punto di partenza dell'editor per una nuova istanza (se assente, vale `sampleConfig`). */
  draftConfig?: unknown;
  /** JSON Schema della configurazione (da `configSchema`): genera il form dell editor. */
  configJsonSchema: unknown;
}

export interface EventSummary {
  id: string;
  name: string;
  status: EventStatus;
  createdAt: number;
}

export interface EventDetail extends EventSummary {
  teamIds: string[];
  /** Giocatori della serata con il team assegnato (null = senza team) e se ne sono il capitano. */
  players: { playerId: string; teamId: string | null; captain: boolean }[];
  matches: MatchView[];
}

export interface AdminStatus {
  configured: boolean;
}

export interface AdminSession {
  token: string;
}

export type AdminError =
  | "invalid"
  | "unauthorized"
  | "already_configured"
  | "bad_credentials"
  | "too_many_attempts"
  | "not_found"
  | "conflict";

/** Messaggio o evento di un round con Game Master, come lo vede l'archivio della regia. */
export interface ArchivedMessage {
  roundId: string;
  roundTitle: string;
  matchId: string;
  matchName: string;
  messageId: number;
  kind: "message" | "event";
  fromKind: "master" | "player";
  fromNickname: string | null;
  toKind: "master" | "player" | "room" | "all" | "players";
  toNickname: string | null;
  toCell: number | null;
  /** Solo per gli eventi: destinatari e istante di accettazione. */
  recipients: { playerId: string; nickname: string; acceptedAt: number | null }[];
  text: string;
  ts: number;
  readAt: number | null;
  cancelled: boolean;
}

/** Risposta di `POST /api/admin/master-link`: il token compare solo qui, il database ne tiene l'hash. */
export interface MasterLink {
  token: string;
  expiresAt: number;
}
