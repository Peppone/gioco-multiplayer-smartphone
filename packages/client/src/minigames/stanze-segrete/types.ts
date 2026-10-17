/** Forme delle viste inviate dal plugin `stanze-segrete` (la logica sta in `@gioco/minigames`). */

export type Dir = "up" | "down" | "left" | "right";
export type ArrowState = "open" | "blocked" | "wall";
export type Outcome = "in-gioco" | "fuggito" | "eliminato";
export const DIR_LABEL: Record<Dir, string> = { up: "su", down: "giù", left: "a sinistra", right: "a destra" };
export const DIR_ARROW: Record<Dir, string> = { up: "↑", down: "↓", left: "←", right: "→" };
export const DIRS: Dir[] = ["up", "down", "left", "right"];

export interface PublicPlayerRef {
  id: string;
  nickname: string;
}

/** Finché il GM non mostra la mappa lo schermo riceve solo la fase: niente griglia, posizioni o dimensioni. */
export interface ScreenView {
  phase: "setup" | "play" | "reveal" | "done";
  mapShown: boolean;
  rows?: number;
  cols?: number;
  players?: PublicPlayerRef[];
  positions?: Record<string, number | null>;
  letters?: string[];
  paths?: { word: string; cells: number[] }[];
  outcomes?: { id: string; nickname: string; outcome: Outcome; solved: boolean }[];
}

export interface Ability {
  id: string;
  action: string;
  label: string | null;
  usesLeft: number | null;
  expiresAt: number | null;
}

export interface PendingRequest {
  id: number;
  kind: "move" | "peek" | "custom" | "guess";
  direction: Dir | null;
  actionId: string | null;
  word: string | null;
}

export interface PhoneMessage {
  id: number;
  mine: boolean;
  text: string;
  at: number;
  readAt: number | null;
  replyTo: number | null;
  canReply: boolean;
}

export interface PhoneEvent {
  id: number;
  text: string;
  at: number;
  acceptedAt: number | null;
  cancelled: boolean;
}

export interface Rules {
  /** Assenti finché la mappa non è stata mostrata. */
  rows?: number;
  cols?: number;
  sightSec: number;
  messageMaxLength: number;
  positionsPublic: boolean;
}

/** Un oggetto nella propria stanza: sconosciuto finché il Master non lo palesa. */
export type PhoneItem = { ref: number; known: false } | { ref: number; known: true; name: string; icon: string; text: string };

export interface PhoneView {
  phase: "setup" | "play" | "reveal" | "done";
  member: boolean;
  mapShown?: boolean;
  rows?: number;
  cols?: number;
  cell?: number | null;
  outcome?: Outcome;
  solved?: boolean;
  others?: { id: string; nickname: string; cell: number | null }[];
  abilities?: Ability[];
  compass?: Partial<Record<"move" | "peek", Record<Dir, ArrowState>>>;
  pending?: PendingRequest[];
  items?: PhoneItem[];
  sighting?: { cell: number; letter: string; until: number } | null;
  feedback?: { kind: "approved" | "refused" | "cancelled" | "letter" | "solved"; cell: number | null; at: number } | null;
  messages?: PhoneMessage[];
  pendingEvents?: PhoneEvent[];
  history?: PhoneEvent[];
  rules?: Rules;
}

/** Colore stabile di un giocatore nelle mappe (variabili del tema). */
export const playerColor = (index: number) => `var(--opt-${index % 6})`;
