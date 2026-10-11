import { type Side, other } from "./battle.js";
import type { HandCard } from "./cards.js";
import {
  type MemberVoteView,
  type TeamVote,
  castVote,
  confirmVote,
  createVote,
  isVoteDone,
  memberView,
  publicVoteView,
  resolveVote,
} from "./team-vote.js";

/**
 * Draft a priorità: si offrono N carte; il vincitore del minigioco ne sceglie una (voto di team),
 * poi lo sconfitto sceglie tra quelle rimaste. Le carte non scelte tornano al mazzo (a cura del chiamante).
 *
 * Segretezza: vede le carte offerte solo il team che sta scegliendo. Chi sceglie per secondo vede soltanto
 * quelle rimaste, senza sapere quale è stata presa. Lo schermo non vede mai nessuna carta.
 */
export interface DraftState {
  phase: "picking" | "done";
  /** `order[0]` sceglie per primo. */
  order: [Side, Side];
  step: 0 | 1;
  offered: HandCard[];
  vote: TeamVote | null;
  picks: [HandCard | null, HandCard | null];
  members: [string[], string[]];
  voteMs: number;
}

function voteFor(state: Pick<DraftState, "order" | "members" | "offered" | "voteMs">, step: 0 | 1, now: number): TeamVote {
  return createVote({
    options: state.offered.map((c) => c.uid),
    max: 1,
    members: state.members[state.order[step]],
    deadline: now + state.voteMs,
  });
}

export function startDraft(p: { offered: HandCard[]; winner: Side; members: [string[], string[]]; now: number; voteMs: number }): DraftState {
  const base = {
    phase: "picking" as const,
    order: [p.winner, other(p.winner)] as [Side, Side],
    step: 0 as const,
    offered: [...p.offered],
    picks: [null, null] as [HandCard | null, HandCard | null],
    members: p.members,
    voteMs: p.voteMs,
  };
  if (base.offered.length === 0) return { ...base, phase: "done", vote: null };
  return { ...base, vote: voteFor(base, 0, p.now) };
}

const pickerSide = (s: DraftState): Side => s.order[s.step];

/** Un membro del team di turno sceglie (o cambia) la carta che preferisce. Gli altri vengono ignorati. */
export function draftCast(state: DraftState, playerId: string, uid: string): DraftState {
  if (state.phase !== "picking" || !state.vote) return state;
  const vote = castVote(state.vote, playerId, uid);
  return vote === state.vote ? state : { ...state, vote };
}

export function draftConfirm(state: DraftState, playerId: string): DraftState {
  if (state.phase !== "picking" || !state.vote) return state;
  const vote = confirmVote(state.vote, playerId);
  return vote === state.vote ? state : { ...state, vote };
}

/**
 * Fa avanzare il draft: quando il voto di turno è chiuso (scadenza, conferme di tutti o team senza membri)
 * registra la scelta e passa al secondo; senza voti la carta è scelta a caso (deterministico con `rng`).
 * Restituisce lo stesso oggetto se non cambia nulla.
 */
export function draftTick(state: DraftState, now: number, rng: () => number): DraftState {
  let s = state;
  while (s.phase === "picking" && s.vote && (s.vote.members.length === 0 || isVoteDone(s.vote, now))) {
    const outcome = resolveVote(s.vote, { mode: "random" }, rng);
    const uid = outcome.picked[0];
    const card = s.offered.find((c) => c.uid === uid) ?? null;
    const side = pickerSide(s);
    const picks: [HandCard | null, HandCard | null] = [s.picks[0], s.picks[1]];
    picks[side] = card;
    const offered = s.offered.filter((c) => c.uid !== uid);
    if (s.step === 0 && offered.length > 0) {
      const next = { ...s, picks, offered, step: 1 as const };
      s = { ...next, vote: voteFor(next, 1, now) };
    } else {
      s = { ...s, picks, offered, phase: "done", vote: null };
    }
  }
  return s;
}

/** Esito: carta presa da ciascun lato e carte avanzate (da rimettere nel mazzo). */
export function draftResult(state: DraftState): { picks: [HandCard | null, HandCard | null]; leftover: HandCard[] } {
  return { picks: state.picks, leftover: state.offered };
}

// ---- Viste ----

export type DraftPlayerView =
  | { phase: "done" }
  | { phase: "picking"; role: "picker"; cards: HandCard[]; vote: MemberVoteView; first: boolean }
  /** Chi non sta scegliendo non riceve nessuna carta: solo quante ne restano e a chi tocca. */
  | { phase: "picking"; role: "waiting"; offeredCount: number; picker: Side };

export function draftViewFor(state: DraftState, side: Side, playerId: string): DraftPlayerView {
  if (state.phase === "done" || !state.vote) return { phase: "done" };
  if (pickerSide(state) === side && state.members[side].includes(playerId)) {
    return { phase: "picking", role: "picker", cards: state.offered, vote: memberView(state.vote, playerId), first: state.step === 0 };
  }
  return { phase: "picking", role: "waiting", offeredCount: state.offered.length, picker: pickerSide(state) };
}

/** Vista pubblica (schermo, spettatori): chi sta scegliendo, quante carte (dorsi) e quanti hanno già deciso. */
export function draftPublicView(state: DraftState): { phase: "picking" | "done"; picker: Side | null; offeredCount: number; progress: { members: number; decided: number; deadline: number } | null } {
  if (state.phase === "done" || !state.vote) return { phase: "done", picker: null, offeredCount: 0, progress: null };
  return { phase: "picking", picker: pickerSide(state), offeredCount: state.offered.length, progress: publicVoteView(state.vote) };
}
