/**
 * Calcoli puri di «Lunghezza d'Onda»: fasce del bersaglio, mediana della squadra, scommesse e punti di un turno.
 * Le posizioni vanno da 0 (estremo sinistro) a 100 (estremo destro).
 */

export type Direction = "left" | "right";

/** Arrotonda una posizione a 0,5 e la tiene tra 0 e 100. */
export function clampPos(pos: number): number {
  return Math.min(100, Math.max(0, Math.round(pos * 2) / 2));
}

/** Fascia colpita: 4 al centro (entro mezza fascia), poi 3 e 2 ai lati, 0 fuori dal bersaglio. */
export function zoneOf(pos: number, target: number, zoneWidth: number): 0 | 2 | 3 | 4 {
  const d = Math.abs(pos - target);
  if (d <= zoneWidth / 2) return 4;
  if (d <= zoneWidth * 1.5) return 3;
  if (d <= zoneWidth * 2.5) return 2;
  return 0;
}

/** Mediana (con un numero pari di valori, la media dei due centrali, arrotondata a 0,5); `null` senza valori. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? v[mid]! : clampPos((v[mid - 1]! + v[mid]!) / 2);
}

/** Scommessa di una squadra a maggioranza dei membri che hanno votato; pareggio o nessun voto = nessuna scommessa. */
export function majority(dirs: Direction[]): Direction | null {
  const left = dirs.filter((d) => d === "left").length;
  const right = dirs.length - left;
  return left > right ? "left" : right > left ? "right" : null;
}

/** La scommessa è giusta se il centro del bersaglio sta da quella parte della posizione della squadra (a pari posizione nessuno ha ragione). */
export function counterCorrect(dir: Direction, teamPos: number, target: number): boolean {
  return dir === "left" ? target < teamPos : target > teamPos;
}

export interface GuessScore {
  playerId: string;
  pos: number;
  zone: 0 | 2 | 3 | 4;
  points: number;
}

/**
 * «Tutti contro tutti»: ognuno prende `fascia × unit`; il Sensitivo la media dei punti di chi ha giocato
 * (arrotondata), 0 se nessuno ha giocato.
 */
export function scoreFreeForAll(
  dials: { playerId: string; pos: number }[],
  target: number,
  zoneWidth: number,
  unit: number,
): { guesses: GuessScore[]; psychicPoints: number } {
  const guesses = dials.map((d) => {
    const zone = zoneOf(d.pos, target, zoneWidth);
    return { playerId: d.playerId, pos: d.pos, zone, points: zone * unit };
  });
  const psychicPoints = guesses.length === 0 ? 0 : Math.round(guesses.reduce((sum, g) => sum + g.points, 0) / guesses.length);
  return { guesses, psychicPoints };
}

export interface CounterScore {
  teamId: string;
  dir: Direction | null;
  correct: boolean;
  points: number;
}

/**
 * «A squadre»: la squadra di turno prende la fascia della sua mediana (0 senza posizione); ogni altra squadra
 * che scommette giusto prende `counterPoints`, ma niente se la squadra di turno ha fatto 4.
 */
export function scoreTeams(
  teamPos: number | null,
  target: number,
  zoneWidth: number,
  counters: { teamId: string; dir: Direction | null }[],
  counterPoints: number,
): { zone: 0 | 2 | 3 | 4; counters: CounterScore[] } {
  const zone = teamPos === null ? 0 : zoneOf(teamPos, target, zoneWidth);
  return {
    zone,
    counters: counters.map(({ teamId, dir }) => {
      const correct = teamPos !== null && dir !== null && counterCorrect(dir, teamPos, target);
      return { teamId, dir, correct, points: correct && zone !== 4 ? counterPoints : 0 };
    }),
  };
}
