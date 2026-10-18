/** Viste di Lunghezza d'Onda come le invia il server (`screenView` / `viewFor` del plugin `lunghezza-onda`). */

export type Mode = "tutti" | "squadre";
export type Phase = "pick" | "clue" | "guess" | "counter" | "reveal" | "final" | "done";
export type Role = "psychic" | "guesser" | "counter" | "spectator";
export type Direction = "left" | "right";
export type Zone = 0 | 2 | 3 | 4;

export interface Spectrum {
  left: string;
  right: string;
}

export interface Rules {
  mode: Mode;
  turns: number;
  targetScore: number;
  zoneWidth: number;
  unitPoints: number;
  counterPoints: number;
  catchUp: boolean;
  clueSeconds: number;
  guessSeconds: number;
  counterSeconds: number;
}

export interface TurnResult {
  number: number;
  psychicId: string;
  teamId: string | null;
  spectrum: Spectrum;
  clue: string;
  target: number;
  guesses: { playerId: string; pos: number; zone: Zone; points: number }[];
  psychicPoints: number;
  teamPos: number | null;
  zone: Zone;
  counters: { teamId: string; dir: Direction | null; correct: boolean; points: number }[];
}

export interface TeamView {
  id: string;
  name: string;
  color: string;
  score: number;
  members: { id: string; nickname: string }[];
}

export interface PublicView {
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
  mode: Mode;
  rules: Rules;
  played: number;
  maxTurns: number;
  turn: {
    number: number;
    catchUp: boolean;
    psychic: { id: string; nickname: string };
    teamId: string | null;
    spectrum: Spectrum | null;
    clue: string | null;
  };
  teams: TeamView[];
  standings: { id: string; nickname: string; points: number }[];
  guessers: number;
  confirmed: number;
  /** Solo a squadre, durante il voto: le posizioni della squadra di turno. */
  teamDials: { playerId: string; nickname: string; pos: number; confirmed: boolean }[] | null;
  teamPos: number | null;
  counterVoters: number;
  counterVoted: number;
  result: TurnResult | null;
  history: TurnResult[];
}

export interface Me {
  id: string;
  role: Role;
  teamId: string | null;
  /** Solo il Sensitivo, nella scelta dello spettro. */
  options?: Spectrum[];
  /** Solo il Sensitivo, dopo la scelta dello spettro. */
  target?: number;
  myDial: number | null;
  confirmed: boolean;
  myCounter: Direction | null;
  teamCounter: { playerId: string; nickname: string; dir: Direction }[] | null;
}

export interface PhoneView extends PublicView {
  me: Me | null;
}
