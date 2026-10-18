import { asc, eq } from "drizzle-orm";
import type {
  AnyMinigame,
  GameAdminState,
  GameMasterState,
  GamePhase,
  GamePlayerState,
  GameScreenState,
  HostCommand,
  HostView,
  InstanceLookup,
  Leaderboards,
  MinigameFrame,
  ParticipantInfo,
  ThemeId,
} from "@gioco/shared";
import {
  type Db,
  eventPlayers,
  eventTeams,
  events,
  matchRounds,
  matches,
  minigameInstances,
  players,
  teams,
} from "./db.js";
import { MessageStore } from "./message-store.js";
import { type NewScoreEntry, ScoreService } from "./scores.js";

export interface EngineDeps {
  db: Db;
  registry: Record<string, AnyMinigame>;
  scores: ScoreService;
  now: () => number;
  /** Latenza misurata per giocatore, per l'ora equa del buzzer. */
  rttOf: (playerId: string) => number | null;
  random?: () => number;
}

export type EngineResult = { ok: true } | { ok: false; error: string };

interface RoundSpec {
  roundId: string;
  typeId: string;
  title: string;
  theme: ThemeId;
  config: unknown;
}

interface Live {
  eventId: string;
  eventName: string;
  matchId: string;
  matchName: string;
  roster: ParticipantInfo[];
  teamNames: Map<string, string>;
  teamColors: Map<string, string>;
  rounds: RoundSpec[];
  /** Indice del round corrente o ultimo giocato; -1 prima del primo. */
  roundIndex: number;
  phase: GamePhase;
  roundState: unknown;
  /** Contenuti già mostrati dai round conclusi (assente nelle fotografie salvate prima di questa funzione). */
  seen?: string[];
}

/** Stato dell'engine in forma serializzabile (le Map diventano elenchi di coppie). */
export interface EngineSnapshot {
  v: 1;
  live: Omit<Live, "teamNames" | "teamColors"> & { teamNames: [string, string][]; teamColors: [string, string][] };
}

const fail = (error: string): EngineResult => ({ ok: false, error });
const OK: EngineResult = { ok: true };

/**
 * Macchina a stati della partita live: ready → (round → results)* → ended.
 * Tutta la logica sta qui e nei plugin; i client inviano solo intenzioni.
 * I metodi che modificano lo stato restituiscono se serve un nuovo invio ai client.
 */
export class Engine {
  private live: Live | null = null;
  private lbCache: Leaderboards | null = null;
  /** Incrementa a ogni cambiamento: serve a capire se rinviare le viste. */
  version = 0;
  /** Archivio dei messaggi ed eventi dei round con Game Master. */
  readonly messageStore: MessageStore;

  constructor(private readonly deps: EngineDeps) {
    this.messageStore = new MessageStore(deps.db);
  }

  private get db() {
    return this.deps.db;
  }

  private touch(): void {
    this.version++;
  }

  /** Id della partita in corso (non ancora conclusa), se c'è. */
  get activeMatchId(): string | null {
    return this.live && this.live.phase !== "ended" ? this.live.matchId : null;
  }

  /**
   * Fotografia dello stato della partita, per riprenderla dopo un riavvio. Nessuna fotografia a partita
   * conclusa o assente. Gli stati dei plugin sono JSON puro per contratto, quindi basta serializzare.
   */
  snapshot(): EngineSnapshot | null {
    const l = this.live;
    if (!l || l.phase === "ended") return null;
    return { v: 1, live: { ...l, teamNames: [...l.teamNames], teamColors: [...l.teamColors] } };
  }

  /** Ripristina una fotografia. I timer scaduti durante lo spegnimento si risolvono al primo tick. */
  restore(snapshot: EngineSnapshot): void {
    const { teamNames, teamColors, ...rest } = snapshot.live;
    this.live = { ...rest, teamNames: new Map(teamNames), teamColors: new Map(teamColors) };
    this.invalidateScores();
    this.touch();
  }

  private invalidateScores(): void {
    this.lbCache = null;
  }

  private plugin(round: RoundSpec): AnyMinigame {
    return this.deps.registry[round.typeId]!;
  }

  private get currentRound(): RoundSpec | null {
    const l = this.live;
    return l && l.roundIndex >= 0 ? (l.rounds[l.roundIndex] ?? null) : null;
  }

  // ---- Avvio ----

  startMatch(matchId: string): EngineResult {
    if (this.live && this.live.phase !== "ended") return fail("C'è già una partita in corso: concludila prima.");

    const match = this.db.select().from(matches).where(eq(matches.id, matchId)).get();
    if (!match) return fail("Partita non trovata.");
    if (match.status !== "pending") return fail("Partita già avviata o conclusa: creane una nuova.");
    const event = this.db.select().from(events).where(eq(events.id, match.eventId)).get();
    if (!event) return fail("Serata non trovata.");

    const roster: ParticipantInfo[] = this.db
      .select({ id: players.id, nickname: players.nickname, teamId: eventPlayers.teamId })
      .from(eventPlayers)
      .innerJoin(players, eq(players.id, eventPlayers.playerId))
      .where(eq(eventPlayers.eventId, event.id))
      .all();
    if (roster.length === 0) return fail("Nessun giocatore assegnato alla serata.");

    const teamRows = this.db
      .select({ id: teams.id, name: teams.name, color: teams.color })
      .from(eventTeams)
      .innerJoin(teams, eq(teams.id, eventTeams.teamId))
      .where(eq(eventTeams.eventId, event.id))
      .all();
    const teamNames = new Map(teamRows.map((t) => [t.id, t.name]));
    const teamColors = new Map(teamRows.map((t) => [t.id, t.color]));

    const rounds: RoundSpec[] = this.db
      .select({
        roundId: matchRounds.id,
        typeId: minigameInstances.typeId,
        title: minigameInstances.title,
        theme: minigameInstances.theme,
        configJson: minigameInstances.configJson,
      })
      .from(matchRounds)
      .innerJoin(minigameInstances, eq(minigameInstances.id, matchRounds.instanceId))
      .where(eq(matchRounds.matchId, matchId))
      .orderBy(asc(matchRounds.order))
      .all()
      .map((r) => ({
        roundId: r.roundId,
        typeId: r.typeId,
        title: r.title,
        theme: r.theme as ThemeId,
        config: JSON.parse(r.configJson) as unknown,
      }));
    if (rounds.length === 0) return fail("La partita non ha round.");
    const missing = rounds.find((r) => !this.deps.registry[r.typeId]);
    if (missing) return fail(`Tipo di minigioco sconosciuto: ${missing.typeId}`);

    // I round che riferiscono altre istanze o la serata (es. il duello) si completano ora e restano fissati per tutta la partita.
    const lookup: InstanceLookup = (id) => {
      const row = this.db.select().from(minigameInstances).where(eq(minigameInstances.id, id)).get();
      return row ? { typeId: row.typeId, title: row.title, theme: row.theme as ThemeId, config: JSON.parse(row.configJson) as unknown } : undefined;
    };
    for (const round of rounds) {
      const plugin = this.deps.registry[round.typeId]!;
      if (!plugin.buildConfig) continue;
      const built = plugin.buildConfig(round.config, lookup, { players: roster, teams: teamRows });
      if (!built.ok) return fail(`«${round.title}»: ${built.error}`);
      round.config = built.config;
    }

    this.db.update(matches).set({ status: "running" }).where(eq(matches.id, matchId)).run();
    this.live = {
      eventId: event.id,
      eventName: event.name,
      matchId,
      matchName: match.name,
      roster,
      teamNames,
      teamColors,
      rounds,
      roundIndex: -1,
      phase: "ready",
      roundState: null,
    };
    this.invalidateScores();
    this.touch();
    return OK;
  }

  // ---- Comandi della regia ----

  hostCommand(cmd: HostCommand): EngineResult {
    if (cmd.type === "start") return this.startMatch(cmd.matchId);
    const l = this.live;
    if (!l) return fail("Nessuna partita in corso.");

    switch (cmd.type) {
      case "engine":
        if (cmd.action === "next") return this.next(l);
        if (cmd.action === "finish-round") {
          if (l.phase !== "round") return fail("Nessun round in corso.");
          this.finalizeRound(l);
          return OK;
        }
        if (cmd.action === "close") {
          // Dalla classifica finale si torna alla lobby: schermo e telefoni rivedono i QR e chi è connesso.
          if (l.phase !== "ended") return fail("La partita non è ancora conclusa.");
          this.live = null;
          this.invalidateScores();
          this.touch();
          return OK;
        }
        return this.endMatch(l);

      case "plugin":
        return this.pluginCommand(l, cmd.command);

      case "adjust": {
        const playerTeam = cmd.playerId ? l.roster.find((p) => p.id === cmd.playerId) : undefined;
        if (cmd.playerId && !playerTeam) return fail("Giocatore non in serata.");
        if (cmd.teamId && !l.teamNames.has(cmd.teamId)) return fail("Squadra non in serata.");
        if (!cmd.playerId && !cmd.teamId) return fail("Indica un giocatore o una squadra.");
        this.deps.scores.record([
          {
            eventId: l.eventId,
            matchId: l.matchId,
            roundId: null,
            playerId: cmd.playerId,
            teamId: cmd.teamId ?? playerTeam?.teamId ?? null,
            points: cmd.points,
            reason: `Rettifica: ${cmd.reason}`,
          },
        ]);
        this.invalidateScores();
        this.touch();
        return OK;
      }
    }
  }

  private pluginCommand(l: Live, command: unknown): EngineResult {
    const round = this.currentRound;
    if (l.phase !== "round" || !round) return fail("Nessun round in corso.");
    const plugin = this.plugin(round);
    const parsed = plugin.commandSchema.safeParse(command);
    if (!parsed.success) return fail("Comando non valido.");
    const next = plugin.onHostCommand(l.roundState, parsed.data, this.deps.now());
    if (next !== l.roundState) this.setRoundState(l, next);
    return OK;
  }

  /** Comando del Game Master: solo il plugin del round in corso, e solo se il round prevede il ruolo. */
  masterCommand(command: unknown): EngineResult {
    const l = this.live;
    const round = this.currentRound;
    if (!l || l.phase !== "round" || !round) return fail("Nessun round in corso.");
    if (!this.plugin(round).master) return fail("Questo round non ha un Game Master.");
    return this.pluginCommand(l, command);
  }

  /** Il round in corso ha un'interfaccia per il Game Master? */
  get masterAvailable(): boolean {
    const round = this.currentRound;
    return !!this.live && this.live.phase === "round" && !!round && !!this.plugin(round).master;
  }

  /** Configurazione del round in corso come risulta dallo stato attuale, se il plugin la sa esportare (vedi `exportConfig`). */
  exportRoundConfig(): { roundId: string; config: unknown } | null {
    const l = this.live;
    const round = this.currentRound;
    if (!l || l.phase !== "round" || !round || l.roundState === null) return null;
    const plugin = this.plugin(round);
    return plugin.exportConfig ? { roundId: round.roundId, config: plugin.exportConfig(l.roundState) } : null;
  }

  private next(l: Live): EngineResult {
    if (l.phase !== "ready" && l.phase !== "results") return fail("Non si può avanzare ora.");
    if (l.roundIndex + 1 >= l.rounds.length) return this.endMatch(l);

    const round = l.rounds[l.roundIndex + 1]!;
    const { maxPlayers: max, minPlayers: min } = this.plugin(round);
    if (min !== undefined && l.roster.length < min) {
      return fail(`${round.title}: servono almeno ${min} giocatori, in serata ce ne sono ${l.roster.length}.`);
    }
    if (max !== undefined && l.roster.length > max) {
      return fail(`${round.title}: massimo ${max} giocatori, in serata ce ne sono ${l.roster.length}.`);
    }
    const random = this.deps.random ?? Math.random;
    l.roundIndex++;
    l.roundState = this.plugin(round).init(
      round.config,
      {
        players: l.roster,
        teams: [...l.teamNames].map(([id, name]) => ({ id, name, color: l.teamColors.get(id) })),
        seed: Math.floor(random() * 2 ** 31),
        seen: l.seen ?? [],
      },
      this.deps.now(),
    );
    l.phase = "round";
    this.afterRoundChange(l);
    return OK;
  }

  private endMatch(l: Live): EngineResult {
    if (l.phase === "ended") return fail("Partita già conclusa.");
    if (l.phase === "round") this.finalizeRound(l);
    l.phase = "ended";
    l.roundState = null;
    this.db.update(matches).set({ status: "done" }).where(eq(matches.id, l.matchId)).run();
    this.touch();
    return OK;
  }

  // ---- Round ----

  private setRoundState(l: Live, state: unknown): void {
    l.roundState = state;
    this.saveMessages(l);
    this.afterRoundChange(l);
  }

  /** Copia nel database i messaggi ed eventi nuovi o cambiati del round (idempotente). */
  private saveMessages(l: Live): void {
    const round = this.currentRound;
    const plugin = round ? this.plugin(round) : null;
    if (!round || !plugin?.messages || l.roundState === null) return;
    this.messageStore.persist({ eventId: l.eventId, matchId: l.matchId, roundId: round.roundId }, plugin.messages(l.roundState));
  }

  /** Dopo ogni modifica: se il plugin ha esaurito il suo flusso si chiude il round. */
  private afterRoundChange(l: Live): void {
    const round = this.currentRound;
    if (l.phase === "round" && round && this.plugin(round).isFinished(l.roundState)) {
      this.finalizeRound(l);
      return;
    }
    this.touch();
  }

  /** Registra i punti del round (una sola volta) e passa alla fase risultati. */
  private finalizeRound(l: Live): void {
    const round = this.currentRound!;
    this.saveMessages(l);
    const teamOf = new Map(l.roster.map((p) => [p.id, p.teamId]));
    const entries: NewScoreEntry[] = this.plugin(round)
      .scores(l.roundState)
      .map((d) => ({
        eventId: l.eventId,
        matchId: l.matchId,
        roundId: round.roundId,
        playerId: d.playerId,
        teamId: d.teamId ?? (d.playerId ? (teamOf.get(d.playerId) ?? null) : null),
        points: d.points,
        reason: d.reason,
      }));
    this.deps.scores.record(entries);
    this.invalidateScores();
    const shown = this.plugin(round).shownItems?.(l.roundState);
    if (shown?.length) l.seen = [...new Set([...(l.seen ?? []), ...shown])];
    l.phase = "results";
    l.roundState = null;
    this.touch();
  }

  // ---- Input dei giocatori e tempo ----

  /** Restituisce true se lo stato è cambiato. */
  input(playerId: string, payload: unknown, clientTime: number): boolean {
    const l = this.live;
    const round = this.currentRound;
    if (!l || l.phase !== "round" || !round) return false;
    if (!l.roster.some((p) => p.id === playerId)) return false;

    const plugin = this.plugin(round);
    const parsed = plugin.inputSchema.safeParse(payload);
    if (!parsed.success) return false;

    const next = plugin.onInput(l.roundState, playerId, parsed.data, {
      receivedAt: this.deps.now(),
      claimedTime: clientTime,
      rtt: this.deps.rttOf(playerId),
    });
    if (next === l.roundState) return false;
    this.setRoundState(l, next);
    return true;
  }

  /** Da chiamare di frequente (es. ogni 100 ms). Restituisce true se lo stato è cambiato. */
  tick(): boolean {
    const l = this.live;
    const round = this.currentRound;
    if (!l || l.phase !== "round" || !round) return false;
    const next = this.plugin(round).onTick(l.roundState, this.deps.now());
    if (next === l.roundState) return false;
    this.setRoundState(l, next);
    return true;
  }

  // ---- Viste filtrate ----

  private leaderboards(l: Live): Leaderboards {
    return (this.lbCache ??= this.deps.scores.leaderboards(l.eventId));
  }

  private frame(l: Live, view: (p: AnyMinigame) => unknown): MinigameFrame | undefined {
    const round = this.currentRound;
    if (l.phase !== "round" || !round) return undefined;
    return { typeId: round.typeId, title: round.title, theme: round.theme, view: view(this.plugin(round)) };
  }

  screenState(): GameScreenState {
    const l = this.live;
    if (!l) return { phase: "idle", roundNumber: 0, roundCount: 0 };
    return {
      phase: l.phase,
      eventName: l.eventName,
      matchName: l.matchName,
      roundNumber: l.roundIndex + 1,
      roundCount: l.rounds.length,
      frame: this.frame(l, (p) => p.screenView(l.roundState)),
      leaderboards: l.phase === "round" ? undefined : this.leaderboards(l),
    };
  }

  playerState(playerId: string): GamePlayerState {
    const l = this.live;
    if (!l) return { phase: "idle", inRoster: false };
    const me = l.roster.find((p) => p.id === playerId);
    if (!me) return { phase: l.phase, matchName: l.matchName, inRoster: false };
    const row = this.leaderboards(l).players.find((r) => r.id === playerId);
    return {
      phase: l.phase,
      matchName: l.matchName,
      inRoster: true,
      roundNumber: l.roundIndex + 1,
      frame: this.frame(l, (p) => p.viewFor(l.roundState, playerId, me.teamId)),
      me: {
        points: row?.points ?? 0,
        rank: row?.rank ?? null,
        teamId: me.teamId,
        teamName: me.teamId ? (l.teamNames.get(me.teamId) ?? null) : null,
      },
    };
  }

  /** Vista del Game Master: solo il round in corso, e solo se il plugin lo prevede. I giocatori li completa il server. */
  masterState(): Omit<GameMasterState, "players"> {
    const l = this.live;
    if (!l) return { phase: "idle" };
    const round = this.currentRound;
    const base = { phase: l.phase, matchName: l.matchName };
    if (l.phase !== "round" || !round || !this.plugin(round).master) return base;
    return { ...base, roundTitle: round.title, typeId: round.typeId, host: this.plugin(round).hostView(l.roundState) };
  }

  adminState(): GameAdminState {
    const l = this.live;
    const base = this.screenState();
    if (!l) return { ...base, rounds: [], engineActions: [] };

    const round = this.currentRound;
    const host: HostView | undefined =
      l.phase === "round" && round ? this.plugin(round).hostView(l.roundState) : undefined;
    const more = l.roundIndex + 1 < l.rounds.length;

    const engineActions: GameAdminState["engineActions"] = [];
    if (l.phase === "ready" || l.phase === "results") {
      engineActions.push({
        id: "next",
        label: more ? `Avvia round ${l.roundIndex + 2}: ${l.rounds[l.roundIndex + 1]!.title}` : "Concludi la partita",
        enabled: true,
      });
    }
    if (l.phase === "round") engineActions.push({ id: "finish-round", label: "Termina il round ora", enabled: true, danger: true });
    if (l.phase !== "ended") engineActions.push({ id: "end-match", label: "Termina la partita", enabled: true, danger: true });
    else engineActions.push({ id: "close", label: "Torna alla lobby", enabled: true });

    return {
      ...base,
      matchId: l.matchId,
      rounds: l.rounds.map((r) => ({ id: r.roundId, title: r.title, typeId: r.typeId })),
      host,
      master: this.masterAvailable,
      engineActions,
    };
  }

  /** Giocatori della partita live, per il broadcast mirato. */
  rosterIds(): string[] {
    return this.live?.roster.map((p) => p.id) ?? [];
  }
}
