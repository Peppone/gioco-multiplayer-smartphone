/** Forme delle viste inviate dal plugin `reazione-a-catena` (vedi packages/minigames/src/reazione-a-catena). */
export interface Person {
  id: string;
  nickname: string;
}

export interface Trio {
  giverA: Person | null;
  giverB: Person | null;
  guesser: Person | null;
}

export type PauseReason = "answer" | "pass" | "ready" | "host" | null;

export interface GameEvent {
  n: number;
  kind: "begin" | "correct" | "wrong" | "pass" | "skip" | "buzz" | "pause" | "time" | "extra";
  word?: string;
}

export interface TurnSummary {
  turn: number;
  correct: number;
  wrong: number;
  passes: number;
  points: number;
  players: string[];
}

export interface TurnView {
  phase: "setup" | "playing" | "paused" | "turn-over";
  pauseReason: PauseReason;
  turn: number;
  turns: number;
  trio: Trio;
  running: boolean;
  deadline: number | null;
  timeLeftMs: number | null;
  totalMs: number;
  correct: number;
  wrong: number;
  passes: number;
  passesLeft: number;
  points: number;
  wordShown: boolean;
  word: string | null;
  event: GameEvent | null;
  history: TurnSummary[];
}

export interface DoneView {
  phase: "done";
  history: TurnSummary[];
}

export interface PlayerTurnView extends TurnView {
  role: "giver" | "guesser" | "spectator";
}

export interface HostInfo extends Omit<TurnView, "trio" | "word"> {
  participants: Person[];
  trioIds: { giverA: string | null; giverB: string | null; guesser: string | null };
  trio: Trio;
  word: string | null;
  extraTimeSec: number;
}
