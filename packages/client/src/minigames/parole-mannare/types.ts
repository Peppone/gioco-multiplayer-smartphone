/** Forme delle viste inviate dal plugin `parole-mannare` (la logica sta in `@gioco/minigames`). */

export type Role = "werewolf" | "seer" | "villager";
export type Token = "yes" | "no" | "maybe" | "close" | "far" | "correct";
export type Phase = "deal" | "word" | "night" | "questions" | "correct-grace" | "seer-hunt" | "werewolf-vote" | "reveal" | "done";

export interface Summary {
  yes: number;
  no: number;
  maybe: number;
  close: number;
  far: number;
}

export interface Reserves {
  yesNo: number;
  /** `null` = Forse illimitati. */
  maybe: number | null;
  close: number;
  far: number;
}

/** I numeri della partita, per la pagina «Regole». */
export interface Rules {
  players: number;
  werewolves: number;
  questionSeconds: number;
  yesNoPool: number;
  maybePool: number | null;
  closeTokens: number;
  farTokens: number;
  seerHuntSeconds: number;
  voteSeconds: number;
  runoffSeconds: number;
}

export interface LogEntry {
  seq: number;
  playerId: string;
  nickname: string;
  token: Token;
  undone: boolean;
}

export interface Named {
  id: string;
  nickname: string;
}

/** Parte uguale per schermo e telefoni. */
export interface PublicView {
  phase: Phase;
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
  mayor: Named;
  players: (Named & { summary: Summary })[];
  reserves: Reserves;
  rules: Rules;
  log: LogEntry[];
  correctBy: string | null;
  runoff: Named[] | null;
  voted: number;
  voters: number;
  word: string | null;
  wolves: string[] | null;
  /** Solo a fine round. */
  roles?: (Named & { role: Role })[];
  outcome?: { winner: "village" | "werewolves"; reason: string } | null;
}

export interface Me {
  id: string;
  isMayor: boolean;
  role: Role | null;
  word: string | null;
  wordOptions: string[] | null;
  mates: string[];
  seen: boolean;
  canVote: boolean;
  targets: Named[];
  myVote: string | null;
  teamVotes: Record<string, string> | null;
  canUndo: boolean;
  lastToken: { token: Token; nickname: string } | null;
}

export interface PhoneView extends PublicView {
  me: Me | null;
}
