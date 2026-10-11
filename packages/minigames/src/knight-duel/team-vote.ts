import { randInt } from "./rng.js";

/**
 * Voto di team con timer, riusabile per ogni decisione collettiva (draft, battaglia, in futuro altro).
 * Ogni membro può scegliere fino a `max` opzioni; i compagni vedono le scelte altrui in tempo reale.
 * Vince la maggioranza: le `max` opzioni con più voti; in parità prevale quella votata per prima.
 */
export interface TeamVote {
  options: string[];
  /** Quante opzioni al massimo escono dal voto (e può scegliere ciascun membro). */
  max: number;
  members: string[];
  /** Scelte correnti di ciascun membro, in ordine di selezione (`seq` globale crescente). */
  picks: Record<string, { option: string; seq: number }[]>;
  /** Membri che hanno confermato: se confermano tutti il voto si chiude prima della scadenza. */
  ready: string[];
  seq: number;
  deadline: number;
}

export type VoteFallback =
  /** Nessun voto: si sceglie a caso (una sola opzione). */
  | { mode: "random" }
  /** Nessun voto: la prima opzione disponibile della lista (es. una carta difensiva); altrimenti a caso. */
  | { mode: "prudent"; prudent: string[] }
  /** Nessun voto: non si sceglie nulla. */
  | { mode: "none" };

export function createVote(p: { options: string[]; max: number; members: string[]; deadline: number }): TeamVote {
  return {
    options: [...p.options],
    max: Math.max(1, p.max),
    members: [...p.members],
    picks: Object.fromEntries(p.members.map((m) => [m, []])),
    ready: [],
    seq: 0,
    deadline: p.deadline,
  };
}

/**
 * Un membro seleziona o deseleziona un'opzione. Se ha già `max` scelte, la più vecchia lascia il posto
 * (con `max = 1` equivale a cambiare idea). Modificare la propria scelta annulla la conferma.
 */
export function castVote(vote: TeamVote, playerId: string, option: string): TeamVote {
  if (!vote.members.includes(playerId) || !vote.options.includes(option)) return vote;
  const mine = vote.picks[playerId] ?? [];
  let next: { option: string; seq: number }[];
  if (mine.some((p) => p.option === option)) {
    next = mine.filter((p) => p.option !== option);
  } else {
    next = [...mine, { option, seq: vote.seq }];
    if (next.length > vote.max) next = next.slice(next.length - vote.max);
  }
  return {
    ...vote,
    picks: { ...vote.picks, [playerId]: next },
    ready: vote.ready.filter((m) => m !== playerId),
    seq: vote.seq + 1,
  };
}

/** Conferma la propria scelta (anche vuota: equivale ad astenersi). */
export function confirmVote(vote: TeamVote, playerId: string): TeamVote {
  if (!vote.members.includes(playerId) || vote.ready.includes(playerId)) return vote;
  return { ...vote, ready: [...vote.ready, playerId] };
}

/** Il voto è chiuso a scadenza o quando tutti i membri hanno confermato. */
export const isVoteDone = (vote: TeamVote, now: number): boolean =>
  now >= vote.deadline || (vote.members.length > 0 && vote.members.every((m) => vote.ready.includes(m)));

export interface Tally {
  option: string;
  count: number;
  /** Ordine del primo voto ancora attivo: spareggio, vince il più basso. */
  firstSeq: number;
}

/** Conteggio dei voti per opzione (solo opzioni con almeno un voto), dalla più votata. */
export function tally(vote: TeamVote): Tally[] {
  const map = new Map<string, Tally>();
  for (const picks of Object.values(vote.picks)) {
    for (const { option, seq } of picks) {
      const t = map.get(option) ?? { option, count: 0, firstSeq: seq };
      t.count++;
      t.firstSeq = Math.min(t.firstSeq, seq);
      map.set(option, t);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.firstSeq - b.firstSeq);
}

export interface VoteOutcome {
  picked: string[];
  /** `votes`: decisi dai voti · `fallback`: nessun voto, si è usata la regola predefinita. */
  source: "votes" | "fallback";
  /** Almeno due opzioni a pari voti si contendevano l'ultimo posto: ha deciso l'ordine di voto. */
  tieBroken: boolean;
}

/** Esito del voto. Con `rng` (seme) i fallback casuali sono deterministici. */
export function resolveVote(vote: TeamVote, fallback: VoteFallback, rng: () => number): VoteOutcome {
  const ranked = tally(vote);
  if (ranked.length > 0) {
    const picked = ranked.slice(0, vote.max);
    const last = picked[picked.length - 1]!;
    // Parità per l'ultimo posto: un'opzione esclusa aveva lo stesso numero di voti ed è stata votata dopo.
    const tieBroken = ranked.slice(vote.max).some((t) => t.count === last.count);
    return { picked: picked.map((t) => t.option), source: "votes", tieBroken };
  }
  if (fallback.mode === "none" || vote.options.length === 0) return { picked: [], source: "fallback", tieBroken: false };
  if (fallback.mode === "prudent") {
    const safe = fallback.prudent.find((o) => vote.options.includes(o));
    if (safe) return { picked: [safe], source: "fallback", tieBroken: false };
  }
  return { picked: [vote.options[randInt(rng, vote.options.length)]!], source: "fallback", tieBroken: false };
}

// ---- Viste ----

export interface MemberVoteView {
  options: string[];
  max: number;
  deadline: number;
  /** Le mie scelte. */
  mine: string[];
  confirmed: boolean;
  /** Le scelte dei compagni (informazione privata del team: gli avversari non la ricevono mai). */
  mates: { playerId: string; picks: string[]; confirmed: boolean }[];
}

export function memberView(vote: TeamVote, playerId: string): MemberVoteView {
  const sel = (id: string) => (vote.picks[id] ?? []).map((p) => p.option);
  return {
    options: vote.options,
    max: vote.max,
    deadline: vote.deadline,
    mine: sel(playerId),
    confirmed: vote.ready.includes(playerId),
    mates: vote.members.filter((m) => m !== playerId).map((m) => ({ playerId: m, picks: sel(m), confirmed: vote.ready.includes(m) })),
  };
}

/** Vista pubblica (schermo e avversari): solo quanti hanno già deciso, mai cosa. */
export function publicVoteView(vote: TeamVote): { members: number; decided: number; deadline: number } {
  return {
    members: vote.members.length,
    decided: vote.members.filter((m) => vote.ready.includes(m)).length,
    deadline: vote.deadline,
  };
}
