import type { RoundResult, ScoreDelta } from "@gioco/shared";

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
