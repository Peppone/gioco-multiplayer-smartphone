/** Viste di Artificieri come le serializza il server (`screenView`, `viewFor`, `hostView`). */

export type Phase = "bet" | "briefing" | "defuse" | "outcome" | "final" | "done";
export type Bet = "defused" | "exploded";
export type CloseReason = "all-solved" | "strikes" | "time" | "host";
export type WireColor = "red" | "blue" | "yellow" | "black" | "white";
export type ButtonColor = "red" | "blue" | "yellow" | "white" | "black";
export type StripColor = "blue" | "white" | "yellow" | "red" | "green";
export type ModuleKind = "wires" | "button" | "symbols" | "colors" | "maze" | "word";

export interface Person {
  id: string;
  nickname: string;
}

export interface Settings {
  difficulty: "facile" | "media" | "difficile";
  modules: number;
  seconds: number;
  maxStrikes: number;
  speedUpOnStrike: boolean;
  bombsPerTeam: number;
  betSeconds: number;
  modulePoints: number;
  defusePoints: number;
  timeBonus: number;
  betPoints: number;
}

export interface TeamView {
  id: string;
  name: string;
  color: string;
  members: Person[];
}

export interface TurnView {
  position: number;
  total: number;
  teamId: string;
  teamName: string;
  teamColor: string;
  defuser: Person;
  experts: Person[];
  bettors: number;
  betsPlaced: number;
}

export interface Status {
  strikes: number;
  maxStrikes: number;
  moduleCount: number;
  solved: number;
  speed: number;
  /** A `at` (ora server) restavano `remainingMs` di tempo della bomba, che scorre a `speed` volte il reale. */
  clock: { at: number; remainingMs: number };
  pausedRemainingMs: number | null;
  outcome: { result: Bet; reason: CloseReason; remainingMs: number; secondsLeft: number } | null;
}

export interface HistoryEntry {
  turn: number;
  teamId: string;
  outcome: Bet | "skipped";
  reason: CloseReason | "skipped";
  solved: number;
  moduleCount: number;
  strikes: number;
  secondsLeft: number;
  points: number;
  betWinners: Person[];
  betsDefused: number;
  betsExploded: number;
}

export interface PublicView {
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
  settings: Settings;
  teams: TeamView[];
  turn: TurnView | null;
  status: Status | null;
  history: HistoryEntry[];
}

// ---- Schermo ----

export interface Edgework {
  serial: string;
  batteries: number;
  indicators: { label: string; lit: boolean }[];
  ports: string[];
}

export type TvModule =
  | { id: number; kind: "wires"; solved: boolean; data: { wires: WireColor[] }; progress: { cut: number[] } }
  | { id: number; kind: "button"; solved: boolean; data: { color: ButtonColor; label: string; strip?: StripColor }; progress: { holding: boolean } }
  | { id: number; kind: "symbols"; solved: boolean; data: { symbols: string[] }; progress: { pressed: number[] } }
  | { id: number; kind: "colors"; solved: boolean; data: { sequence: number[] }; progress: { stage: number; entered: number } }
  | { id: number; kind: "maze"; solved: boolean; data: { marks: [number, number]; start: number; goal: number }; progress: { pos: number } }
  | { id: number; kind: "word"; solved: boolean; data: { wheels: string[][]; start: number[] }; progress: { pos: number[] } };

export interface ScreenView extends PublicView {
  bomb: { edgework: Edgework; modules: TvModule[]; selected: number | null } | null;
}

// ---- Telefono ----

export type Control =
  | { id: number; kind: "wires"; solved: boolean; wires: number; cut: number[] }
  | { id: number; kind: "button"; solved: boolean; holding: boolean }
  | { id: number; kind: "symbols"; solved: boolean; symbols: string[]; pressed: number[] }
  | { id: number; kind: "colors"; solved: boolean }
  | { id: number; kind: "maze"; solved: boolean }
  | { id: number; kind: "word"; solved: boolean };

export interface ManualBlock {
  type: "h" | "p" | "list" | "table" | "symbols" | "mazes" | "words";
  text?: string;
  ordered?: boolean;
  items?: string[];
  head?: string[];
  rows?: string[][];
  columns?: string[][];
  size?: number;
  mazes?: { cells: number[]; marks: [number, number] }[];
  words?: string[];
}

export interface ManualPage {
  id: number;
  title: string;
  blocks: ManualBlock[];
}

export type Me =
  | { id: string; role: "bettor"; canBet: boolean; myBet: Bet | null }
  | { id: string; role: "defuser"; canStart: boolean; controls?: Control[]; selected?: number | null }
  | { id: string; role: "expert"; index: { id: number; title: string; owners: string[]; mine: boolean }[]; manual: ManualPage[] };

export interface PhoneView extends PublicView {
  me: Me | null;
}

// ---- Regia ----

export interface HostModule {
  id: number;
  kind: ModuleKind;
  solved: boolean;
  data: unknown;
  progress: unknown;
  solution: string | null;
}

export interface HostInfo extends PublicView {
  bets: { id: string; nickname: string; bet: Bet }[];
  bomb: {
    edgework: Edgework;
    selected: number | null;
    strikes: number;
    modules: HostModule[];
    pages: { id: string; nickname: string; pages: number[] }[];
    manual: ManualPage[];
  } | null;
  canUndoStrike: boolean;
}
