/** Forma delle viste del plugin `knight-duel` (il server le manda già filtrate per chi guarda). */

export type Side = 0 | 1;

export interface SideView {
  name: string;
  color: string;
  hp: number;
  maxHp: number;
  handCount: number;
  poison: number;
  members: number;
}

export interface CardV {
  id: string;
  name: string;
  icon: string;
  rarity: "common" | "rare" | "epic";
  initiative: number;
  text: string;
}
export interface HandCardV extends CardV {
  uid: string;
}

export type BattleEventV =
  | { type: "play"; side: Side; uid: string; cardId: string }
  | { type: "poison-tick"; side: Side; damage: number }
  | { type: "shield"; side: Side; amount: number }
  | { type: "counter-ready"; side: Side }
  | { type: "heal"; side: Side; amount: number }
  | { type: "damage"; source: Side; target: Side; kind: "attack" | "heavy" | "counter"; amount: number; blocked: number }
  | { type: "poison"; source: Side; target: Side; damage: number; turns: number }
  | { type: "steal"; side: Side; uid: string | null; cardId: string | null }
  | { type: "spy"; side: Side; uid: string | null; cardId: string | null }
  | { type: "sabotage"; source: Side; target: Side; percent: number }
  | { type: "ko"; side: Side };

export interface MemberVoteV {
  options: string[];
  max: number;
  deadline: number;
  mine: string[];
  confirmed: boolean;
  mates: { playerId: string; picks: string[]; confirmed: boolean }[];
}

export interface ProgressV {
  members: number;
  decided: number;
  deadline: number;
}

export interface ResultV {
  events: BattleEventV[];
  cards: Record<string, CardV>;
  winner: Side | null;
  shownUntil: number;
}

export interface OutcomeV {
  winner: Side | null;
  reason: "ko" | "hp" | "sudden" | "coin";
}

export interface MinigameFrameV {
  typeId: string;
  title: string;
  theme: "gameshow" | "pixel" | "manga" | "retro80" | "boom";
  view: unknown;
}

export interface DuelCommonV {
  phase: "minigame-select" | "minigame" | "draft" | "battle" | "battle-result" | "ended";
  battleNo: number;
  maxBattles: number;
  minigamesLeft: number;
  suddenDeath: boolean;
  sides: [SideView, SideView];
  minigame: MinigameFrameV | null;
  minigameWinner: Side | null;
  outcome: OutcomeV | null;
}

export type DraftPublicV = { phase: "picking" | "done"; picker: Side | null; offeredCount: number; progress: ProgressV | null };
export type DraftPlayerV =
  | { phase: "done" }
  | { phase: "picking"; role: "picker"; cards: HandCardV[]; vote: MemberVoteV; first: boolean; picksLeft: number }
  | { phase: "picking"; role: "waiting"; offeredCount: number; picker: Side };

export interface DuelScreenV extends DuelCommonV {
  draft: DraftPublicV | null;
  battle: { progress: ProgressV[]; deadline: number } | null;
  result: ResultV | null;
}

export interface DuelPlayerV extends DuelCommonV {
  side: Side | null;
  team: { id: string; nickname: string }[];
  hand?: HandCardV[];
  spied?: HandCardV | null;
  draft?: DraftPublicV | DraftPlayerV | null;
  battle?: { vote: MemberVoteV; opponent: ProgressV; deadline: number } | { progress: ProgressV[]; deadline: number } | null;
  result: ResultV | null;
}

export type DuelDoneV = { phase: "done"; outcome: OutcomeV | null; sides: [SideView, SideView] };
