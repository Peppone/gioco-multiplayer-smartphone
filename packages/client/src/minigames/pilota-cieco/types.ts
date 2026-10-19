/** Viste di Pilota alla cieca come le serializza il server (`screenView`, `viewFor`, `hostView`). */

export type Phase = "ready" | "run" | "level-end" | "final" | "done";
export type Layer = "mines" | "doors" | "keys" | "patrols";
export type Mode = "insieme" | "a-turno";

export interface Door {
  cell: number;
  period: number;
  offset: number;
}

export interface Patrol {
  path: number[];
  stepMs: number;
  offset: number;
}

export interface Person {
  id: string;
  nickname: string;
}

export interface Settings {
  mode: Mode;
  levels: number;
  stepMs: number;
  penaltyMs: number;
  levelSeconds: number;
  keys: number;
  finishPoints: number[];
  distancePoints: number;
  strikePenalty: number;
}

/** A fine gara si scopre tutto. */
export interface Reveal {
  mines: number[];
  doors: Door[];
  keys: number[];
  patrols: Patrol[];
}

export interface PublicLane {
  teamId: string;
  teamName: string;
  teamColor: string;
  pilot: Person;
  w: number;
  h: number;
  /** I muri: un bit per lato aperto (1 su, 2 destra, 4 giù, 8 sinistra). */
  cells: number[];
  start: number;
  exit: number;
  checkpoints: number[];
  doorCells: number[];
  pos: number;
  frozenUntil: number;
  strikes: number;
  keys: { total: number; taken: number };
  keysTaken: number[];
  hitMines: number[];
  finishedAt: number | null;
  rank: number | null;
  reveal?: Reveal;
}

export interface Result {
  teamId: string;
  finished: boolean;
  elapsedMs: number | null;
  progress: number;
  strikes: number;
  points: number | null;
}

export interface TeamView {
  id: string;
  name: string;
  color: string;
  members: Person[];
}

export interface PublicView {
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
  levelStartedAt: number | null;
  settings: Settings;
  level: number;
  unit: number;
  units: number;
  teams: TeamView[];
  lanes: PublicLane[];
  results: Result[];
  history: { level: number; results: Result[] }[];
  board: Record<string, number>;
}

export interface LayerData {
  mines?: number[];
  doors?: Door[];
  keys?: number[];
  patrols?: Patrol[];
}

export type Me =
  | { id: string; role: "pilot"; teamId: string }
  | { id: string; role: "spectator"; teamId: string | null }
  | { id: string; role: "navigator"; teamId: string; layers: Layer[]; layerData: LayerData };

export interface PhoneView extends PublicView {
  me: Me | null;
}

export interface HostInfo extends PublicView {
  secrets: { teamId: string; mines: number[]; doors: Door[]; keys: number[]; patrols: Patrol[]; layers: (Person & { layers: Layer[] })[] }[];
}
