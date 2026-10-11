import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type {
  AdminError,
  AdminPlayerDetail,
  AdminPlayerView,
  EventDetail,
  EventInput,
  EventStatus,
  EventSummary,
  MatchView,
  RoundView,
  TeamInput,
  TeamView,
} from "@gioco/shared";
import { type Db, eventPlayers, eventTeams, events, matches, matchRounds, players, scoreEntries, teams } from "./db.js";
import { LibraryService } from "./library-service.js";
import { PlayerService } from "./players.js";
import { type Result, fail, ok } from "./result.js";

export type { Result };



const toTeam = (t: typeof teams.$inferSelect): TeamView => ({
  id: t.id,
  name: t.name,
  color: t.color,
  emblem: t.emblem,
});

const toMatch = (m: typeof matches.$inferSelect, rounds: RoundView[]): MatchView => ({
  id: m.id,
  order: m.order,
  name: m.name,
  status: m.status as MatchView["status"],
  rounds,
});

const toSummary = (e: typeof events.$inferSelect): EventSummary => ({
  id: e.id,
  name: e.name,
  status: e.status as EventStatus,
  createdAt: e.createdAt,
});

/** CRUD di squadre, serate e partite, e assegnazione dei giocatori ai team di una serata. */
export class AdminService {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {
    this.library = new LibraryService(db);
  }

  readonly library: LibraryService;

  // ---- Giocatori ----

  listPlayers(): AdminPlayerView[] {
    return this.db
      .select({ id: players.id, nickname: players.nickname, avatar: players.avatar, color: players.color })
      .from(players)
      .orderBy(asc(players.nickname))
      .all();
  }

  /** Elenco dei giocatori con il PIN, per la regia (mai incluso nelle altre liste né nelle viste di schermo e telefoni). */
  listPlayerDetails(): AdminPlayerDetail[] {
    return this.db
      .select({ id: players.id, nickname: players.nickname, avatar: players.avatar, color: players.color, pin: players.pin, createdAt: players.createdAt })
      .from(players)
      .orderBy(asc(players.nickname))
      .all();
  }

  /** Genera un nuovo PIN per un giocatore (anche per chi è stato creato prima e non ha un PIN leggibile). */
  resetPlayerPin(id: string): Result<AdminPlayerDetail> {
    if (!new PlayerService(this.db).resetPin(id)) return fail("not_found", "Giocatore non trovato");
    const detail = this.listPlayerDetails().find((p) => p.id === id);
    return detail ? ok(detail) : fail("not_found", "Giocatore non trovato");
  }

  // ---- Squadre ----

  listTeams(): TeamView[] {
    return this.db.select().from(teams).orderBy(asc(teams.name)).all().map(toTeam);
  }

  private teamNameTaken(name: string, exceptId?: string): boolean {
    const row = this.db
      .select({ id: teams.id })
      .from(teams)
      .where(sql`lower(${teams.name}) = lower(${name})`)
      .get();
    return row !== undefined && row.id !== exceptId;
  }

  createTeam(input: TeamInput): Result<TeamView> {
    if (this.teamNameTaken(input.name)) return fail("conflict");
    const row = { id: randomUUID(), ...input };
    this.db.insert(teams).values(row).run();
    return ok(toTeam(row));
  }

  updateTeam(id: string, input: TeamInput): Result<TeamView> {
    if (!this.db.select().from(teams).where(eq(teams.id, id)).get()) return fail("not_found");
    if (this.teamNameTaken(input.name, id)) return fail("conflict");
    this.db.update(teams).set(input).where(eq(teams.id, id)).run();
    return ok(toTeam({ id, ...input }));
  }

  deleteTeam(id: string): Result<null> {
    if (!this.db.select().from(teams).where(eq(teams.id, id)).get()) return fail("not_found");
    this.db.transaction((tx) => {
      tx.update(eventPlayers).set({ teamId: null }).where(eq(eventPlayers.teamId, id)).run();
      tx.delete(eventTeams).where(eq(eventTeams.teamId, id)).run();
      tx.delete(teams).where(eq(teams.id, id)).run();
    });
    return ok(null);
  }

  // ---- Serate ----

  listEvents(): EventSummary[] {
    return this.db.select().from(events).orderBy(sql`${events.createdAt} desc`).all().map(toSummary);
  }

  createEvent(input: EventInput): EventSummary {
    const row = { id: randomUUID(), name: input.name, status: "draft", createdAt: this.now() };
    this.db.insert(events).values(row).run();
    return toSummary(row);
  }

  getEvent(id: string): Result<EventDetail> {
    const e = this.db.select().from(events).where(eq(events.id, id)).get();
    if (!e) return fail("not_found");
    return ok({
      ...toSummary(e),
      teamIds: this.db.select().from(eventTeams).where(eq(eventTeams.eventId, id)).all().map((r) => r.teamId),
      players: this.db
        .select()
        .from(eventPlayers)
        .where(eq(eventPlayers.eventId, id))
        .all()
        .map((r) => ({ playerId: r.playerId, teamId: r.teamId })),
      matches: this.db.select().from(matches).where(eq(matches.eventId, id)).orderBy(asc(matches.order)).all().map((m) => toMatch(m, this.library.rounds(m.id))),
    });
  }

  patchEvent(id: string, patch: { name?: string; status?: EventStatus }): Result<EventSummary> {
    const e = this.db.select().from(events).where(eq(events.id, id)).get();
    if (!e) return fail("not_found");
    const next = { ...e, ...(patch.name && { name: patch.name }), ...(patch.status && { status: patch.status }) };
    this.db.update(events).set({ name: next.name, status: next.status }).where(eq(events.id, id)).run();
    return ok(toSummary(next));
  }

  deleteEvent(id: string): Result<null> {
    if (!this.db.select().from(events).where(eq(events.id, id)).get()) return fail("not_found");
    this.db.transaction((tx) => {
      const matchIds = tx.select({ id: matches.id }).from(matches).where(eq(matches.eventId, id)).all().map((m) => m.id);
      if (matchIds.length > 0) tx.delete(matchRounds).where(inArray(matchRounds.matchId, matchIds)).run();
      tx.delete(scoreEntries).where(eq(scoreEntries.eventId, id)).run();
      tx.delete(matches).where(eq(matches.eventId, id)).run();
      tx.delete(eventPlayers).where(eq(eventPlayers.eventId, id)).run();
      tx.delete(eventTeams).where(eq(eventTeams.eventId, id)).run();
      tx.delete(events).where(eq(events.id, id)).run();
    });
    return ok(null);
  }

  /** Imposta le squadre della serata; chi era in una squadra rimossa resta senza team. */
  setEventTeams(eventId: string, teamIds: string[]): Result<EventDetail> {
    if (!this.db.select().from(events).where(eq(events.id, eventId)).get()) return fail("not_found");
    const unique = [...new Set(teamIds)];
    if (unique.length > 0) {
      const found = this.db.select({ id: teams.id }).from(teams).where(inArray(teams.id, unique)).all();
      if (found.length !== unique.length) return fail("not_found");
    }
    this.db.transaction((tx) => {
      tx.delete(eventTeams).where(eq(eventTeams.eventId, eventId)).run();
      for (const teamId of unique) tx.insert(eventTeams).values({ eventId, teamId }).run();
      const stale = tx.select().from(eventPlayers).where(eq(eventPlayers.eventId, eventId)).all();
      for (const p of stale) {
        if (p.teamId && !unique.includes(p.teamId)) {
          tx.update(eventPlayers)
            .set({ teamId: null })
            .where(and(eq(eventPlayers.eventId, eventId), eq(eventPlayers.playerId, p.playerId)))
            .run();
        }
      }
    });
    return this.getEvent(eventId);
  }

  /** Aggiunge il giocatore alla serata (se non c'è) e lo assegna a un team della serata o a nessuno. */
  assignPlayer(eventId: string, playerId: string, teamId: string | null): Result<EventDetail> {
    if (!this.db.select().from(events).where(eq(events.id, eventId)).get()) return fail("not_found");
    if (!this.db.select().from(players).where(eq(players.id, playerId)).get()) return fail("not_found");
    if (teamId !== null) {
      const inEvent = this.db
        .select()
        .from(eventTeams)
        .where(and(eq(eventTeams.eventId, eventId), eq(eventTeams.teamId, teamId)))
        .get();
      if (!inEvent) return fail("conflict");
    }
    this.db
      .insert(eventPlayers)
      .values({ eventId, playerId, teamId })
      .onConflictDoUpdate({ target: [eventPlayers.eventId, eventPlayers.playerId], set: { teamId } })
      .run();
    return this.getEvent(eventId);
  }

  removePlayer(eventId: string, playerId: string): Result<EventDetail> {
    if (!this.db.select().from(events).where(eq(events.id, eventId)).get()) return fail("not_found");
    this.db
      .delete(eventPlayers)
      .where(and(eq(eventPlayers.eventId, eventId), eq(eventPlayers.playerId, playerId)))
      .run();
    return this.getEvent(eventId);
  }

  // ---- Partite ----

  createMatch(eventId: string, input: { name: string }): Result<MatchView> {
    if (!this.db.select().from(events).where(eq(events.id, eventId)).get()) return fail("not_found");
    const last = this.db
      .select({ max: sql<number | null>`max(${matches.order})` })
      .from(matches)
      .where(eq(matches.eventId, eventId))
      .get();
    const row = {
      id: randomUUID(),
      eventId,
      order: (last?.max ?? 0) + 1,
      name: input.name,
      status: "pending",
      mode: "classic", // colonne rimaste per compatibilità con i database esistenti
      modeConfigJson: "{}",
    };
    this.db.insert(matches).values(row).run();
    return ok(toMatch(row, []));
  }

  patchMatch(id: string, patch: { name?: string }): Result<MatchView> {
    const m = this.db.select().from(matches).where(eq(matches.id, id)).get();
    if (!m) return fail("not_found");
    const next = { ...m, ...(patch.name && { name: patch.name }) };
    this.db.update(matches).set({ name: next.name }).where(eq(matches.id, id)).run();
    return ok(toMatch(next, this.library.rounds(id)));
  }

  /** Elimina la partita e richiude i buchi nell'ordine delle successive. */
  deleteMatch(id: string): Result<null> {
    const m = this.db.select().from(matches).where(eq(matches.id, id)).get();
    if (!m) return fail("not_found");
    this.db.transaction((tx) => {
      tx.delete(matchRounds).where(eq(matchRounds.matchId, id)).run();
      tx.delete(matches).where(eq(matches.id, id)).run();
      tx.update(matches)
        .set({ order: sql`${matches.order} - 1` })
        .where(and(eq(matches.eventId, m.eventId), sql`${matches.order} > ${m.order}`))
        .run();
    });
    return ok(null);
  }
}
