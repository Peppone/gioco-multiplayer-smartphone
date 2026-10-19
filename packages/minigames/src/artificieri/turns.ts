import type { ParticipantInfo, TeamInfo } from "@gioco/shared";
import { shuffle } from "../knight-duel/rng.js";

/**
 * Squadre e turni di Artificieri: chi gioca in quale squadra, l'ordine dei turni, chi è l'artificiere di ciascun
 * turno e come si divide il manuale tra gli esperti. Funzioni pure e deterministiche (la casualità è un `rng`).
 */

export interface TeamEntry {
  id: string;
  name: string;
  color: string;
  members: string[];
  /** Rotazione degli artificieri: il turno numero k della squadra lo fa `order[k % order.length]`. */
  order: string[];
}

export interface Turn {
  teamId: string;
  defuserId: string;
}

const PALETTE = ["#e5484d", "#3e63dd", "#30a46c", "#f5a524", "#8e4ec6", "#12a594", "#d6409f", "#6e56cf"];

/** Squadre da 3–5 giocatori quando la serata non ha team. */
const RANDOM_TEAM_MAX = 5;

/**
 * Squadre del round: i team della serata che hanno giocatori (per nome); i giocatori senza team non giocano
 * la bomba, ma possono scommettere. Se nessun team ha giocatori, l'app li divide a caso in squadre da 3–5.
 */
export function formTeams(players: ParticipantInfo[], teams: TeamInfo[], rng: () => number): TeamEntry[] {
  const withPlayers = teams
    .filter((t) => players.some((p) => p.teamId === t.id))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const groups =
    withPlayers.length > 0
      ? withPlayers.map((t, i) => ({ id: t.id, name: t.name, color: t.color ?? PALETTE[i % PALETTE.length]!, members: players.filter((p) => p.teamId === t.id).map((p) => p.id) }))
      : randomGroups(players.map((p) => p.id), rng);
  return groups.map((g) => ({ ...g, order: shuffle(g.members, rng) }));
}

function randomGroups(ids: string[], rng: () => number): { id: string; name: string; color: string; members: string[] }[] {
  if (ids.length === 0) return [];
  const count = Math.max(1, Math.ceil(ids.length / RANDOM_TEAM_MAX));
  const mixed = shuffle(ids, rng);
  return Array.from({ length: count }, (_, i) => ({
    id: `squadra-${i + 1}`,
    name: `Squadra ${i + 1}`,
    color: PALETTE[i % PALETTE.length]!,
    members: mixed.filter((_, j) => j % count === i),
  }));
}

/** Giocatori di un team della serata con un solo membro: il manuale non si può dividere, la regia deve sistemare le squadre. */
export function tooSmallTeams(players: ParticipantInfo[], teams: TeamInfo[]): TeamInfo[] {
  return teams.filter((t) => {
    const n = players.filter((p) => p.teamId === t.id).length;
    return n === 1;
  });
}

/** Ordine dei turni: prima la prima bomba di ogni squadra, poi la seconda… */
export function buildQueue(teams: TeamEntry[], bombsPerTeam: number): Turn[] {
  const queue: Turn[] = [];
  for (let b = 0; b < bombsPerTeam; b++) {
    for (const t of teams) queue.push({ teamId: t.id, defuserId: t.order[b % t.order.length]! });
  }
  return queue;
}

/** Il compagno che segue `current` nella rotazione della squadra (per chi è assente). */
export function nextDefuser(team: TeamEntry, current: string): string {
  const i = team.order.indexOf(current);
  return team.order[(i + 1) % team.order.length]!;
}

/**
 * Divide le pagine del manuale tra gli esperti: ogni pagina ad almeno un esperto (a turno, a partire da un
 * ordine mescolato); chi resterebbe senza pagine ne riceve una già assegnata a un altro. Nessun esperto, nessuna pagina.
 */
export function assignPages(pageCount: number, experts: string[], rng: () => number): Record<string, number[]> {
  const out: Record<string, number[]> = Object.fromEntries(experts.map((e) => [e, [] as number[]]));
  if (experts.length === 0 || pageCount === 0) return out;
  const order = shuffle(experts, rng);
  for (let page = 0; page < pageCount; page++) out[order[page % order.length]!]!.push(page);
  order.forEach((e, i) => {
    if (out[e]!.length === 0) out[e]!.push(i % pageCount);
  });
  return out;
}
