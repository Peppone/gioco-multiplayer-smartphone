/** Viste del Pianeta Nascosto come le serializza il server (`screenView`, `viewFor`, `hostView`). La logica sta in `@gioco/minigames`. */

export type Phase = "briefing" | "turn" | "resolve" | "conference" | "theory" | "review" | "lastCall" | "finalGuess" | "reveal" | "final" | "done";
export type Seen = "asteroid" | "dwarf" | "comet" | "gas" | "empty";
export type Kind = Seen | "planetX";
export type Token = "asteroid" | "comet" | "gas" | "dwarf";
export type Mark = "excluded" | "supposed" | "confirmed";
export type Difficulty = "youth" | "beginner" | "experienced" | "genius";

export interface Settings {
  mode: "standard" | "expert";
  sectors: number;
  turnMode: "sequential" | "simultaneous";
  decision: "vote" | "captain";
  maxDays: number;
  turnSeconds: number;
  theorySeconds: number;
  assist: boolean;
  tokens: Record<Token, number>;
  theoriesPerPhase: number;
  targets: number;
  pointScale: number;
}

export interface Obs {
  id: string;
  name: string;
  color: string;
  bot: boolean;
  time: number;
  stack: number;
  members: number;
  sector: number;
}

export interface PublicTheory {
  id: number;
  ownerId: string;
  sector: number;
  space: 0 | 1 | 2 | 3;
  faceUp: boolean;
  object: Token | null;
}

export interface Breakdown {
  priority: number;
  asteroid: number;
  comet: number;
  gas: number;
  dwarf: number;
  planetX: number;
  total: number;
}

export interface PublicView {
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
  settings: Settings;
  earth: number;
  earthSector: number;
  observatories: Obs[];
  actingIds: string[];
  topics: { id: string; label: Kind[]; readBy: string[] }[];
  conferences: { id: string; label: Kind[]; held: boolean; text: string | null }[];
  conferenceNow: string | null;
  confirmed: Record<string, Token>;
  refuted: { sector: number; object: Token }[];
  theories: PublicTheory[];
  review: { events: { sector: number; theoryId: number; ownerId: string; object: Token; correct: boolean }[]; penalties: { ownerId: string; sector: number }[] } | null;
  publicLog: { id: number; time: number; obsId: string; text: string; ok?: boolean }[];
  lastCall: string[] | null;
  fromMaxDays: boolean;
  sky?: Kind[];
  scores?: { id: string; rank: number; breakdown: Breakdown }[];
}

export type ScreenView = PublicView;

export type Action =
  | { type: "survey"; object: Seen; from: number; to: number }
  | { type: "target"; sector: number }
  | { type: "research"; topic: string }
  | { type: "locate"; sector: number; left: Seen; right: Seen }
  | { type: "pass" };

export interface Guess {
  sector: number;
  left: Seen;
  right: Seen;
}

export interface MemberVote {
  options: string[];
  mine: string[];
  confirmed: boolean;
  mates: { playerId: string; picks: string[]; confirmed: boolean }[];
}

export interface TeamView {
  id: string;
  /** Il giocatore a cui è destinata la vista. */
  playerId: string;
  name: string;
  color: string;
  captainId: string | null;
  isCaptain: boolean;
  difficulty: Difficulty;
  facts: { sector: number; absent: Token }[];
  tokens: Record<Token, number>;
  targetsLeft: number;
  lastWasResearch: boolean;
  log: { time: number; cost: number; text: string; action: Action }[];
  research: { topic: string; text: string }[];
  notes: Record<string, Mark>;
  /** Segni fissi: fatti iniziali, revisioni e (con l'aiuto) certezze dirette. */
  fixed: Record<string, Mark>;
  acting: boolean;
  visible: number[];
  turn: { proposals: { id: string; by: string; action: Action; text: string; cost: number; error: string | null }[]; vote: MemberVote; chosen: Action | null } | null;
  collect: { draft: { sector: number; object: Token }[]; guess: Guess | null; ready: boolean; readyBy: number; limit: number; lag: number; canGuess: boolean } | null;
  myTheories: { id: number; sector: number; object: Token; space: number; faceUp: boolean }[];
}

export interface PhoneView extends PublicView {
  mine: TeamView | null;
}

export interface HostDetail {
  id: string;
  difficulty: Difficulty;
  bot: boolean;
  members: { id: string; nickname: string }[];
  captainId: string | null;
  acting: boolean;
  decided: boolean;
  proposals: number;
  ready: number;
  tokens: Record<Token, number>;
  targetsLeft: number;
  facts?: { sector: number; absent: Token }[];
  log?: { time: number; text: string }[];
}

export interface HostInfo extends PublicView {
  unlocked: boolean;
  blind: boolean;
  details: HostDetail[];
  solution?: { sky: Kind[]; topics: { id: string; text: string }[]; conferences: { id: string; text: string }[] };
}
