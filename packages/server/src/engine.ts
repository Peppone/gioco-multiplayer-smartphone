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
  TempTeam,
  TempTeamsInput,
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
  /** Solo per i minigiochi che completano la configurazione all'avvio (`buildConfig`): quella scritta in libreria, per rifarlo con squadre temporanee. */
  rawConfig?: unknown;
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
  /** Giocatori e squadre della serata cambiati durante un round: valgono dalla fine del round (assente se non ci sono modifiche in attesa). */
  next?: { roster: ParticipantInfo[]; teams: TeamRow[] };
  /** Squadre temporanee della regia: sostituiscono quelle della serata nei prossimi round a squadre. */
  temp?: TempTeam[];
  /** Giocatori e squadre come li ha visti il round in corso, se ha usato le squadre temporanee. */
  roundRoster?: ParticipantInfo[];
  roundTeams?: TeamRow[];
}

interface TeamRow {
  id: string;
  name: string;
  color: string;
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

  /** Id della partita che occupa l'engine, anche conclusa ma non ancora chiusa con «Torna alla lobby». */
  get currentMatchId(): string | null {
    return this.live?.matchId ?? null;
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

  private readonly lookup: InstanceLookup = (id) => {
    const row = this.db.select().from(minigameInstances).where(eq(minigameInstances.id, id)).get();
    return row ? { typeId: row.typeId, title: row.title, theme: row.theme as ThemeId, config: JSON.parse(row.configJson) as unknown } : undefined;
  };

  // ---- Avvio ----

  startMatch(matchId: string): EngineResult {
    if (this.live && this.live.phase !== "ended") return fail("C'è già una partita in corso: concludila prima.");

    const match = this.db.select().from(matches).where(eq(matches.id, matchId)).get();
    if (!match) return fail("Partita non trovata.");
    if (match.status !== "pending") return fail("Partita già avviata o conclusa: creane una nuova.");
    const event = this.db.select().from(events).where(eq(events.id, match.eventId)).get();
    if (!event) return fail("Serata non trovata.");

    const { roster, teams: teamRows } = this.loadParticipants(event.id);
    if (roster.length === 0) return fail("Nessun giocatore assegnato alla serata.");
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
    for (const round of rounds) {
      const plugin = this.deps.registry[round.typeId]!;
      if (!plugin.buildConfig) continue;
      const built = plugin.buildConfig(round.config, this.lookup, { players: roster, teams: teamRows });
      if (!built.ok) return fail(`«${round.title}»: ${built.error}`);
      round.rawConfig = round.config;
      round.config = built.config;
    }

    this.db.update(matches).set({ status: "running" }).where(eq(matches.id, matchId)).run();
    // Una serata con una partita avviata è attiva: così la regia la ritrova tra le «attive».
    if (event.status === "draft") this.db.update(events).set({ status: "live" }).where(eq(events.id, event.id)).run();
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

  // ---- Giocatori della serata ----

  /** Giocatori e squadre della serata come stanno ora nel database. */
  private loadParticipants(eventId: string): { roster: ParticipantInfo[]; teams: TeamRow[] } {
    const roster: ParticipantInfo[] = this.db
      .select({ id: players.id, nickname: players.nickname, teamId: eventPlayers.teamId, captain: eventPlayers.captain })
      .from(eventPlayers)
      .innerJoin(players, eq(players.id, eventPlayers.playerId))
      .where(eq(eventPlayers.eventId, eventId))
      .all()
      .map(({ captain, ...p }): ParticipantInfo => (captain === 1 && p.teamId ? { ...p, captain: true } : p));
    const teamRows = this.db
      .select({ id: teams.id, name: teams.name, color: teams.color })
      .from(eventTeams)
      .innerJoin(teams, eq(teams.id, eventTeams.teamId))
      .where(eq(eventTeams.eventId, eventId))
      .all();
    return { roster, teams: teamRows };
  }

  private applyParticipants(l: Live, found: { roster: ParticipantInfo[]; teams: TeamRow[] }): void {
    l.roster = found.roster;
    l.teamNames = new Map(found.teams.map((t) => [t.id, t.name]));
    l.teamColors = new Map(found.teams.map((t) => [t.id, t.color]));
    delete l.next;
    this.invalidateScores();
  }

  /**
   * Allinea i giocatori della partita alla serata (la regia ne ha aggiunti, tolti o spostati di squadra). Tra un round e l'altro vale
   * subito; durante un round vale alla fine, perché i plugin hanno già i giocatori nel loro stato. Se `eventId` è di un'altra serata
   * non fa nulla.
   */
  syncRoster(eventId?: string): void {
    const l = this.live;
    if (!l || l.phase === "ended" || (eventId !== undefined && eventId !== l.eventId)) return;
    const found = this.loadParticipants(l.eventId);
    const changed = JSON.stringify([found.roster, found.teams]) !== JSON.stringify([l.roster, [...l.teamNames].map(([id, name]) => ({ id, name, color: l.teamColors.get(id) }))]);
    if (l.phase === "round") {
      if (changed) l.next = found;
      else delete l.next;
    } else if (changed) {
      this.applyParticipants(l, found);
    }
    this.touch();
  }

  // ---- Comandi della regia ----

  hostCommand(cmd: HostCommand): EngineResult {
    if (cmd.type === "start") return this.startMatch(cmd.matchId);
    const l = this.live;
    if (!l) return fail("Nessuna partita in corso.");

    switch (cmd.type) {
      case "temp-teams":
        return this.setTempTeams(l, cmd.teams);

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

  /**
   * Squadre temporanee: valgono dal prossimo round a squadre (i round in corso hanno già le loro) e finché la regia non le toglie.
   * I punti restano dei giocatori e delle squadre della serata, a cui continuano ad appartenere.
   */
  private setTempTeams(l: Live, input: TempTeamsInput | null): EngineResult {
    if (l.phase === "ended") return fail("La partita è conclusa.");
    if (input === null) {
      delete l.temp;
      this.touch();
      return OK;
    }
    const known = new Set((l.next?.roster ?? l.roster).map((p) => p.id));
    const placed = new Set<string>();
    const names = new Set<string>();
    for (const t of input) {
      const name = t.name.toLowerCase();
      if (names.has(name)) return fail(`Due squadre si chiamano «${t.name}».`);
      names.add(name);
      for (const id of t.members) {
        if (!known.has(id)) return fail("Una squadra ha un giocatore che non è in serata.");
        if (placed.has(id)) return fail("Un giocatore è in due squadre.");
        placed.add(id);
      }
      if (t.captain && !t.members.includes(t.captain)) return fail(`Il capitano di «${t.name}» deve essere uno dei suoi giocatori.`);
    }
    l.temp = input.map((t, i) => ({
      id: `temp-${i + 1}`,
      name: t.name,
      color: t.color,
      members: [...new Set(t.members)],
      ...(t.captain && { captain: t.captain }),
    }));
    this.touch();
    return OK;
  }

  /** Giocatori e squadre che vede il round: quelle temporanee se ci sono e il minigioco usa le squadre, altrimenti quelle della serata. */
  private participantsFor(l: Live, plugin: AnyMinigame): { players: ParticipantInfo[]; teams: TeamRow[]; temporary: boolean } {
    if (!l.temp || !plugin.teamBased) {
      return { players: l.roster, teams: [...l.teamNames].map(([id, name]) => ({ id, name, color: l.teamColors.get(id) ?? "#888888" })), temporary: false };
    }
    const inRoster = new Set(l.roster.map((p) => p.id));
    const teams: TeamRow[] = [];
    const teamOf = new Map<string, string>();
    const captains = new Set<string>();
    for (const t of l.temp) {
      const members = t.members.filter((id) => inRoster.has(id));
      if (members.length === 0) continue; // tutti i suoi giocatori sono usciti dalla serata
      teams.push({ id: t.id, name: t.name, color: t.color });
      for (const id of members) teamOf.set(id, t.id);
      if (t.captain && members.includes(t.captain)) captains.add(t.captain);
    }
    const players = l.roster.map((p): ParticipantInfo => ({ id: p.id, nickname: p.nickname, teamId: teamOf.get(p.id) ?? null, ...(captains.has(p.id) && { captain: true as const }) }));
    return { players, teams, temporary: true };
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
    if (l.roster.length === 0) return fail("Nessun giocatore in serata: aggiungine dalla regia.");
    const { maxPlayers: max, minPlayers: min } = this.plugin(round);
    if (min !== undefined && l.roster.length < min) {
      return fail(`${round.title}: servono almeno ${min} giocatori, in serata ce ne sono ${l.roster.length}.`);
    }
    if (max !== undefined && l.roster.length > max) {
      return fail(`${round.title}: massimo ${max} giocatori, in serata ce ne sono ${l.roster.length}.`);
    }
    const plugin = this.plugin(round);
    const seen = this.participantsFor(l, plugin);
    let config = round.config;
    // I minigiochi che fissano sfidanti o squadre all'avvio (il duello) si ricompongono con le squadre temporanee.
    if (seen.temporary && plugin.buildConfig && round.rawConfig !== undefined) {
      const built = plugin.buildConfig(round.rawConfig, this.lookup, { players: seen.players, teams: seen.teams });
      if (!built.ok) return fail(`«${round.title}»: ${built.error}`);
      config = built.config;
    }
    const random = this.deps.random ?? Math.random;
    l.roundIndex++;
    l.roundState = plugin.init(
      config,
      { players: seen.players, teams: seen.teams, seed: Math.floor(random() * 2 ** 31), seen: l.seen ?? [] },
      this.deps.now(),
    );
    if (seen.temporary) {
      l.roundRoster = seen.players;
      l.roundTeams = seen.teams;
    } else {
      delete l.roundRoster;
      delete l.roundTeams;
    }
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
    // I punti vanno ai giocatori e alle squadre della serata, anche se il round è stato giocato con squadre temporanee.
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
    delete l.roundRoster;
    delete l.roundTeams;
    if (l.next) this.applyParticipants(l, l.next); // i punti del round sono già registrati con le squadre di prima
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
    if (!me) {
      // Aggiunto alla serata durante un round: entra dal prossimo.
      const joining = l.next?.roster.some((p) => p.id === playerId);
      return { phase: l.phase, matchName: l.matchName, inRoster: false, ...(joining && { joining }) };
    }
    const row = this.leaderboards(l).players.find((r) => r.id === playerId);
    // In un round giocato con squadre temporanee il giocatore appartiene a quella temporanea.
    const teamId = l.phase === "round" && l.roundRoster ? (l.roundRoster.find((p) => p.id === playerId)?.teamId ?? null) : me.teamId;
    const teamName = teamId ? (l.roundTeams?.find((t) => t.id === teamId)?.name ?? l.teamNames.get(teamId) ?? null) : null;
    return {
      phase: l.phase,
      matchName: l.matchName,
      inRoster: true,
      roundNumber: l.roundIndex + 1,
      frame: this.frame(l, (p) => p.viewFor(l.roundState, playerId, teamId)),
      me: { points: row?.points ?? 0, rank: row?.rank ?? null, teamId, teamName },
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
      eventId: l.eventId,
      ...(l.next && { rosterPending: true }),
      ...(l.temp && { tempTeams: l.temp }),
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
