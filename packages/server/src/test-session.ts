import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import type { AnyMinigame, TestPlayer, TestSessionInfo, TestSessionInput } from "@gioco/shared";
import type { AdminService } from "./admin-service.js";
import { type Db, events, matchStateSnapshots, matches, players, teams } from "./db.js";
import type { Engine } from "./engine.js";
import type { PlayerService } from "./players.js";
import { type Result, fail, ok } from "./result.js";

const AVATARS = ["🦊", "🐼", "🐸", "🦄", "🐙", "🦁", "🐵", "🐧", "🐯", "🦉", "🐶", "🐱", "🐰", "🐻", "🐨", "🐮", "🐷", "🐔", "🦋", "🐢", "🐳", "🦀", "🐝", "🦖", "🐲", "🦔", "🦦", "🦥", "🐿️", "🦜"];
const COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899"];
const TEAMS = [
  { name: "Rossi (prova)", color: "#ef4444", emblem: "🔴" },
  { name: "Blu (prova)", color: "#3b82f6", emblem: "🔵" },
];
/** Telefoni di prova quando la regia non ne indica il numero: abbastanza per quasi ogni minigioco, senza affollare la pagina. */
const DEFAULT_PLAYERS = 6;
const MAX_PLAYERS = 30;

/**
 * Prova rapida di un minigioco: allestisce da sola una serata «finta» (giocatori di prova, due squadre, una partita con quel
 * solo round), la avvia e la fa sparire a fine prova. Serata, partita e giocatori sono segnati `test`: non compaiono negli
 * elenchi della regia né in lobby, e non lasciano punti né messaggi. Come ogni partita occupa l'unico engine, quindi non si
 * può provare mentre se ne gioca un'altra.
 */
export class TestSession {
  private session: TestSessionInfo | null = null;
  /** La partita di prova, anche prima che la sessione sia completa (serve a chiuderla se l'avvio fallisce). */
  private matchId: string | null = null;

  constructor(
    private readonly db: Db,
    private readonly engine: Engine,
    private readonly admin: AdminService,
    private readonly players: PlayerService,
    private readonly registry: Record<string, AnyMinigame>,
  ) {}

  get(): TestSessionInfo | null {
    return this.session;
  }

  start(input: TestSessionInput): Result<TestSessionInfo> {
    if (this.session) this.stop(); // una nuova prova sostituisce quella in corso
    if (this.engine.currentMatchId) return fail("conflict", "C'è già una partita in corso: concludila prima di fare una prova.");
    this.purge(); // resti di una prova precedente (es. il server si è spento a metà)

    const instance = this.admin.library.getInstance(input.instanceId);
    if (!instance) return fail("not_found", "Istanza non trovata.");
    const plugin = this.registry[instance.typeId];
    if (!plugin) return fail("invalid", "Questo contenuto non è un minigioco: non si può provare.");

    const count = input.players ?? Math.min(Math.max(DEFAULT_PLAYERS, plugin.minPlayers ?? 1), plugin.maxPlayers ?? MAX_PLAYERS, MAX_PLAYERS);
    const withTeams = (input.teams ?? true) && count >= 2;

    const eventId = randomUUID();
    this.db.insert(events).values({ id: eventId, name: `Prova · ${instance.title}`.slice(0, 60), status: "live", createdAt: Date.now(), test: 1 }).run();

    const teamRows = withTeams ? TEAMS.map((t) => ({ id: randomUUID(), ...t, name: this.freeTeamName(t.name) })) : [];
    for (const t of teamRows) this.db.insert(teams).values({ ...t, test: 1 }).run();
    if (teamRows.length > 0) this.admin.setEventTeams(eventId, teamRows.map((t) => t.id));

    const created: TestPlayer[] = [];
    const captained = new Set<string>();
    for (let i = 0; i < count; i++) {
      const team = teamRows.length > 0 ? teamRows[i % teamRows.length]! : null;
      const made = this.players.create(
        { nickname: this.freeNickname(i + 1), avatar: AVATARS[i % AVATARS.length]!, color: COLORS[i % COLORS.length]! },
        { test: true },
      );
      if (!made.ok) return this.abort("Non riesco a creare i giocatori di prova.");
      this.admin.assignPlayer(eventId, made.player.id, team?.id ?? null);
      if (team && !captained.has(team.id)) {
        captained.add(team.id);
        this.admin.setCaptain(eventId, made.player.id, true);
      }
      created.push({ id: made.player.id, nickname: made.player.nickname, token: made.token, teamName: team?.name ?? null, teamColor: team?.color ?? null });
    }

    const match = this.admin.createMatch(eventId, { name: instance.title.slice(0, 60) });
    if (!match.ok) return this.abort("Non riesco a creare la partita di prova.");
    this.matchId = match.value.id;
    const round = this.admin.library.addRound(match.value.id, instance.id);
    if (!round.ok) return this.abort("Non riesco ad aggiungere il round alla partita di prova.");

    // Si parte subito dal primo round: la regia vuole vedere il minigioco, non la schermata «pronta».
    const started = this.engine.startMatch(match.value.id);
    const first = started.ok ? this.engine.hostCommand({ type: "engine", action: "next" }) : started;
    if (!first.ok) return this.abort(first.error);

    this.session = { eventId, matchId: match.value.id, instanceId: instance.id, title: instance.title, typeId: instance.typeId, players: created };
    return ok(this.session);
  }

  /** Chiude la partita di prova (se è ancora in piedi) e cancella tutto ciò che la prova ha creato. */
  stop(): void {
    if (this.matchId && this.engine.currentMatchId === this.matchId) {
      if (this.engine.activeMatchId) this.engine.hostCommand({ type: "engine", action: "end-match" });
      this.engine.hostCommand({ type: "engine", action: "close" });
    }
    this.purge();
  }

  /**
   * Da chiamare ogni tanto: se la partita di prova non occupa più l'engine (la regia ha premuto «Torna alla lobby» dal pannello
   * Live, o ne ha avviata un'altra) la prova è finita e si fa pulizia.
   */
  sweep(): void {
    if (this.session && this.engine.currentMatchId !== this.session.matchId) this.purge();
  }

  /** Cancella ogni serata, giocatore e squadra di prova (anche quelli rimasti da prima di un riavvio). */
  purge(): void {
    this.session = null;
    this.matchId = null;
    const eventIds = this.db.select({ id: events.id }).from(events).where(eq(events.test, 1)).all().map((e) => e.id);
    for (const id of eventIds) {
      const matchIds = this.db.select({ id: matches.id }).from(matches).where(eq(matches.eventId, id)).all().map((m) => m.id);
      if (matchIds.length > 0) this.db.delete(matchStateSnapshots).where(inArray(matchStateSnapshots.matchId, matchIds)).run();
      this.engine.messageStore.deleteForEvent(id);
      this.admin.deleteEvent(id);
    }
    this.db.delete(players).where(eq(players.test, 1)).run();
    this.db.delete(teams).where(eq(teams.test, 1)).run();
  }

  private abort(error: string): Result<never> {
    this.stop();
    return fail("conflict", error);
  }

  private freeNickname(n: number): string {
    let name = `Prova ${n}`;
    while (this.db.select({ id: players.id }).from(players).where(sql`lower(${players.nickname}) = lower(${name})`).get()) name += "·";
    return name.slice(0, 16);
  }

  private freeTeamName(base: string): string {
    let name = base;
    while (this.db.select({ id: teams.id }).from(teams).where(sql`lower(${teams.name}) = lower(${name})`).get()) name += "·";
    return name.slice(0, 24);
  }
}
