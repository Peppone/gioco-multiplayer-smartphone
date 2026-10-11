import { eq, sql } from "drizzle-orm";
import type { LeaderRow, Leaderboards } from "@gioco/shared";
import { type Db, eventPlayers, eventTeams, players, scoreEntries, teams } from "./db.js";

export interface NewScoreEntry {
  eventId: string;
  matchId: string | null;
  roundId: string | null;
  playerId: string | null;
  teamId: string | null;
  points: number;
  reason: string;
}

/** Assegna il rango con pari merito (1, 2, 2, 4…) a righe già ordinate per punti. */
export function assignRanks<T extends { points: number }>(rows: T[]): (T & { rank: number })[] {
  let rank = 0;
  return rows.map((r, i) => {
    if (i === 0 || r.points !== rows[i - 1]!.points) rank = i + 1;
    return { ...r, rank };
  });
}

/**
 * Registro punteggi. Ogni voce ha un giocatore e/o un team: la classifica individuale somma per
 * giocatore, quella a squadre somma per team (le voci dei giocatori portano il team del momento).
 */
export class ScoreService {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  record(entries: NewScoreEntry[]): void {
    if (entries.length === 0) return;
    const ts = this.now();
    this.db.transaction((tx) => {
      for (const e of entries) tx.insert(scoreEntries).values({ ...e, ts }).run();
    });
  }

  leaderboards(eventId: string): Leaderboards {
    const playerTotals = new Map(
      this.db
        .select({ id: scoreEntries.playerId, total: sql<number>`sum(${scoreEntries.points})` })
        .from(scoreEntries)
        .where(eq(scoreEntries.eventId, eventId))
        .groupBy(scoreEntries.playerId)
        .all()
        .map((r) => [r.id, r.total]),
    );
    const teamTotals = new Map(
      this.db
        .select({ id: scoreEntries.teamId, total: sql<number>`sum(${scoreEntries.points})` })
        .from(scoreEntries)
        .where(eq(scoreEntries.eventId, eventId))
        .groupBy(scoreEntries.teamId)
        .all()
        .map((r) => [r.id, r.total]),
    );

    const playerRows = this.db
      .select({ id: players.id, name: players.nickname, avatar: players.avatar, color: players.color })
      .from(eventPlayers)
      .innerJoin(players, eq(players.id, eventPlayers.playerId))
      .where(eq(eventPlayers.eventId, eventId))
      .all();
    const teamRows = this.db
      .select({ id: teams.id, name: teams.name, avatar: teams.emblem, color: teams.color })
      .from(eventTeams)
      .innerJoin(teams, eq(teams.id, eventTeams.teamId))
      .where(eq(eventTeams.eventId, eventId))
      .all();

    const build = (rows: Omit<LeaderRow, "points" | "rank">[], totals: Map<string | null, number>) =>
      assignRanks(
        rows
          .map((r) => ({ ...r, points: totals.get(r.id) ?? 0 }))
          .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)),
      );

    return { players: build(playerRows, playerTotals), teams: build(teamRows, teamTotals) };
  }
}
