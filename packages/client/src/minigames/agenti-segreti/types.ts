/** Viste di Agenti Segreti come le manda il server (vedi `packages/minigames/src/agenti-segreti`). */

export type Side = "red" | "blue";
export type CardKind = Side | "civilian" | "assassin";
export type Phase = "setup" | "clue" | "guess" | "reveal" | "done";
export type ClueCount = number | "inf";
export type Role = "spymaster" | "agent" | "spectator";
export type TurnEndReason = "pass" | "tie" | "no-votes" | "wrong" | "limit" | "clue-timeout" | "rejected" | "host" | "no-agents";

export interface Rules {
  gridSize: "5x5" | "4x4";
  first: number;
  second: number;
  civilians: number;
  assassins: number;
  clueSeconds: number;
  guessSeconds: number;
  maxTurns: number;
  allowZeroInfinity: boolean;
  win: number;
  perAgent: number;
}

/** Carta coperta: solo `word` (la chiave `kind` non c'è). Scoperta, o a fine partita: anche il tipo. */
export interface PublicCard {
  word: string;
  revealed: boolean;
  kind?: CardKind;
  revealedBy?: Side | null;
}

export interface Person {
  id: string;
  nickname: string;
}

export interface TeamView {
  name: string;
  color: string;
  spymaster: Person;
  members: Person[];
  /** `null` prima di «Distribuisci». */
  agentsLeft: number | null;
}

export interface ClueView {
  seq: number;
  side: Side;
  word: string;
  count: ClueCount;
  guesses: number;
  rejected: boolean;
}

export interface VoteView {
  /** Indice della carta (come stringa) oppure `pass`. */
  option: string;
  voters: Person[];
}

export interface Outcome {
  winner: Side | "draw";
  reason: "agents" | "assassin" | "turns" | "host";
}

export interface PublicView {
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
  rules: Rules;
  starting: Side;
  turn: Side;
  turnNumber: number;
  /** 0 = senza limite. */
  maxTurns: number;
  teams: Record<Side, TeamView>;
  cards: PublicCard[];
  clue: { side: Side; word: string; count: ClueCount; guesses: number } | null;
  /** `null` = quante carte vuole (indizio 0 o ∞). */
  guessesLeft: number | null;
  clues: ClueView[];
  votes: VoteView[];
  voters: number;
  confirmed: number;
  canPass: boolean;
  lastEnd: { side: Side; reason: TurnEndReason } | null;
  lastReveal: number | null;
  blindBroken: boolean;
  outcome: Outcome | null;
}

export interface Me {
  id: string;
  side: Side | null;
  role: Role;
  canClue: boolean;
  canVote: boolean;
  myPick: string | null;
  confirmed: boolean;
  /** Solo per i Capi-spia, da «Distribuisci». */
  map?: CardKind[];
  /** Solo per il Capo-spia che ha scritto un indizio non valido. */
  clueError?: string;
}

export interface PhoneView extends PublicView {
  me: Me | null;
}

export interface HostCard {
  word: string;
  revealed: boolean;
  /** Assente sulle carte coperte con la regia cieca. */
  kind?: CardKind;
  revealedBy?: Side | null;
}

export interface HostInfo {
  phase: Phase;
  blind: boolean;
  blindBroken: boolean;
  turn: Side;
  turnNumber: number;
  maxTurns: number;
  pausedRemainingMs: number | null;
  teams: Record<Side, TeamView>;
  canMove: Record<Side, boolean>;
  clue: PublicView["clue"];
  clues: ClueView[];
  votes: VoteView[];
  voters: number;
  confirmed: number;
  canUndo: boolean;
  lastReveal: string | null;
  clueError: string | null;
  outcome: Outcome | null;
  cards: HostCard[];
}
