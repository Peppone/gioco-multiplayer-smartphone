import type { RoundResult, ScoreDelta } from "@gioco/shared";

/** Risposte che arrivano entro questo margine dopo la scadenza contano se la pressione era in tempo. */
export const GRACE_MS = 500;

/** Classifica per punti decrescenti; a pari punti stesso rango (1, 2, 2, 4…). */
export function rankByPoints(totals: Record<string, number>, playerIds: string[]): RoundResult {
  const rows = playerIds
    .map((playerId) => ({ playerId, points: totals[playerId] ?? 0 }))
    .sort((a, b) => b.points - a.points || a.playerId.localeCompare(b.playerId));
  let rank = 0;
  return {
    ranking: rows.map((r, i) => {
      if (i === 0 || r.points !== rows[i - 1]!.points) rank = i + 1;
      return { ...r, rank };
    }),
  };
}

export function totalsToScores(totals: Record<string, number>, reason: string): ScoreDelta[] {
  return Object.entries(totals)
    .filter(([, points]) => points !== 0)
    .map(([playerId, points]) => ({ playerId, teamId: null, points, reason }));
}

/** Punti da `maxPoints` (risposta istantanea) a `minPoints` (ultimo istante), in proporzione al tempo impiegato. */
export function speedPoints(minPoints: number, maxPoints: number, openedAt: number, deadline: number, answeredAt: number): number {
  const duration = Math.max(1, deadline - openedAt);
  const elapsed = Math.min(Math.max(answeredAt - openedAt, 0), duration);
  return Math.round(minPoints + (maxPoints - minPoints) * (1 - elapsed / duration));
}

/** Aggiunge `delta` ai punti di `id` senza modificare l'oggetto originale. */
export function addTo(totals: Record<string, number>, id: string, delta: number): Record<string, number> {
  return { ...totals, [id]: (totals[id] ?? 0) + delta };
}
