/** Forma delle viste di Stanze col botto, come le restituiscono `screenView` e `viewFor` del plugin. */
export type Team = "blue" | "red" | "grey";
export type Character = "president" | "bomber" | "blue-member" | "red-member" | "gambler";
export type Phase = "pairing" | "deal" | "round" | "lock" | "hostages" | "exchange" | "gamble" | "reveal" | "done";

export interface Card {
  team: Team;
  character: Character;
}

export interface Person {
  id: string;
  nickname: string;
}

export interface Rules {
  players: number;
  rounds: { seconds: number; hostages: number }[];
  colorAllowed: boolean;
  startAfterFirstSeconds: number;
  startAfterExchangeSeconds: number;
}

export interface MovedPerson extends Person {
  from: 0 | 1;
  to: 0 | 1;
}

export interface PublicView {
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
  roomNames: [string, string];
  round: number;
  roundCount: number;
  roundSeconds: number;
  hostages: number;
  hostagesNeeded: number;
  rooms: [Person[], Person[]];
  unassigned: Person[];
  leaders: [Person | null, Person | null];
  /** Falso nei round successivi al primo finché non c'è un nuovo blocco. */
  leadersFresh: boolean;
  locked: [boolean, boolean];
  hostagesConfirmed: [boolean, boolean];
  startPressed: [boolean, boolean];
  exchange: { round: number; moved: MovedPerson[] } | null;
  hostSeesCards: boolean;
  pairing?: { mode: "random" | "qr" | "host"; codes: [string, string] | null; capacity: number };
  cards?: { id: string; nickname: string; room: 0 | 1 | null; card: Card }[];
  outcome?: { winner: "blue" | "red"; reason: string; sameRoom: boolean } | null;
  gamblerGuess?: "blue" | "red" | null;
}

export interface Known {
  playerId: string;
  nickname: string;
  seq: number;
  level: "card" | "color";
  /** Con `level: "color"` c'è solo la squadra. */
  card: Card | { team: Team };
}

export interface Offer {
  seq: number;
  kind: "card" | "color";
  at: number;
}

export interface Me {
  id: string;
  /** Null finché non ci si è abbinati a una stanza (fase `pairing`). */
  room: 0 | 1 | null;
  card: Card | null;
  joinRefused: 0 | 1 | null;
  leader?: Person | null;
  isLeader?: boolean;
  leaderLocked?: boolean;
  canVote?: boolean;
  canAppoint?: boolean;
  myVote?: string | null;
  votes?: Record<string, number>;
  abdicateTo?: Person | null;
  abdicationFrom?: Person | null;
  canAbdicate?: boolean;
  hostagePicks?: string[];
  hostagesConfirmed?: boolean;
  canPickHostages?: boolean;
  canConfirmHostages?: boolean;
  canStart?: boolean;
  travel?: { from: 0 | 1; to: 0 | 1 } | null;
  canShare?: boolean;
  colorAllowed?: boolean;
  incoming?: (Offer & { from: Person })[];
  outgoing?: (Offer & { to: Person }) | null;
  known?: Known[];
  canGamble?: boolean;
  myGuess?: "blue" | "red" | null;
}

export interface PhoneView extends PublicView {
  me: Me | null;
  rules: Rules;
}

/** Vista della regia (`hostView.info`): i campi segreti mancano in modalità cieca. */
export interface HostInfo {
  phase: Phase;
  blind: boolean;
  assignment: "random" | "qr" | "host";
  round: number;
  roundCount: number;
  roomNames: [string, string];
  balanced: boolean;
  players: { id: string; nickname: string; room: 0 | 1 | null }[];
  leaders: { revealed: Person | null; locked: boolean; confirmed: boolean }[];
  startPressed: boolean[];
  hostagesNeeded: number;
  outcome?: { winner: "blue" | "red"; reason: string };
  cards?: Record<string, Card>;
  rooms?: { leader: Person | null; votes: Record<string, string>; picks: string[] }[];
  shares?: { seq: number; kind: string; fromNickname: string; toNickname: string | null; status: string; round: number }[];
}
