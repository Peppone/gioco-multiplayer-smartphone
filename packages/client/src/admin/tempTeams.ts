import type { TempTeam, TempTeamsInput } from "@gioco/shared";

/** Squadra temporanea in preparazione nel pannello della regia. */
export interface DraftTeam {
  name: string;
  color: string;
  members: string[];
  captain?: string;
}

export const TEMP_PALETTE = ["#e63946", "#1d7aff", "#2ca02c", "#f4b400", "#8e44ad", "#ff7f0e", "#17becf", "#e84393"];
export const MAX_TEMP_TEAMS = 8;

/** Mescola (Fisher-Yates) senza toccare l'originale. */
export function shuffled<T>(items: T[], rng: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const emptyTeam = (i: number): DraftTeam => ({ name: `Squadra ${i + 1}`, color: TEMP_PALETTE[i % TEMP_PALETTE.length]!, members: [] });

/** Divide i giocatori a sorte in `count` squadre di dimensione quasi uguale (la differenza è al massimo di un giocatore). */
export function splitRandom(playerIds: string[], count: number, rng: () => number = Math.random): DraftTeam[] {
  const n = Math.max(1, Math.min(MAX_TEMP_TEAMS, Math.floor(count)));
  const teams = Array.from({ length: n }, (_, i) => emptyTeam(i));
  shuffled(playerIds, rng).forEach((id, i) => teams[i % n]!.members.push(id));
  return teams;
}

/** Sposta un giocatore in un'altra squadra (o fuori da tutte, con `to` nullo); se era il capitano della vecchia perde il ruolo. */
export function moveMember(draft: DraftTeam[], playerId: string, to: number | null): DraftTeam[] {
  return draft.map((team, i) => {
    const without = team.members.filter((id) => id !== playerId);
    const members = i === to ? [...without, playerId] : without;
    const captain = team.captain === playerId && i !== to ? undefined : team.captain;
    return { ...team, members, captain };
  });
}

/** Imposta (o toglie, se è già lui) il capitano di una squadra. */
export function toggleCaptain(draft: DraftTeam[], teamIndex: number, playerId: string): DraftTeam[] {
  return draft.map((team, i) => (i === teamIndex ? { ...team, captain: team.captain === playerId ? undefined : playerId } : team));
}

export function addTeam(draft: DraftTeam[]): DraftTeam[] {
  return draft.length >= MAX_TEMP_TEAMS ? draft : [...draft, emptyTeam(draft.length)];
}

/** Toglie una squadra: i suoi giocatori restano senza squadra. */
export function removeTeam(draft: DraftTeam[], teamIndex: number): DraftTeam[] {
  return draft.filter((_, i) => i !== teamIndex);
}

/** Squadre già attive, per modificarle. */
export function fromTemp(temp: TempTeam[]): DraftTeam[] {
  return temp.map(({ name, color, members, captain }) => ({ name, color, members: [...members], captain }));
}

/** Perché le squadre in preparazione non si possono ancora applicare, o `null` se vanno bene. */
export function problem(draft: DraftTeam[]): string | null {
  const filled = draft.filter((t) => t.members.length > 0);
  if (filled.length === 0) return "Metti almeno un giocatore in una squadra.";
  const names = new Set<string>();
  for (const t of filled) {
    const name = t.name.trim();
    if (name === "") return "Ogni squadra ha bisogno di un nome.";
    if (name.length > 24) return `Il nome «${name.slice(0, 24)}…» è troppo lungo (massimo 24 caratteri).`;
    if (names.has(name.toLowerCase())) return `Due squadre si chiamano «${name}».`;
    names.add(name.toLowerCase());
  }
  return null;
}

/** Il comando da inviare: le squadre vuote si scartano. */
export function toInput(draft: DraftTeam[]): TempTeamsInput {
  return draft
    .filter((t) => t.members.length > 0)
    .map((t) => ({
      name: t.name.trim(),
      color: t.color,
      members: t.members,
      ...(t.captain && t.members.includes(t.captain) && { captain: t.captain }),
    }));
}
