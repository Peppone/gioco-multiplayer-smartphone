import type { ZodType } from "zod";

export type ThemeId = "gameshow" | "pixel" | "manga" | "retro80";

export interface ParticipantInfo {
  id: string;
  nickname: string;
  teamId: string | null;
}

export interface TeamInfo {
  id: string;
  name: string;
  color?: string;
}

/** Cerca un'istanza della libreria per id (la implementa il server leggendo il database). */
export type InstanceLookup = (instanceId: string) => { typeId: string; title: string; theme: ThemeId; config: unknown } | undefined;

export type BuildConfigResult<Config> = { ok: true; config: Config } | { ok: false; error: string };

export interface MinigameContext {
  players: ParticipantInfo[];
  teams: TeamInfo[];
  /** Seme per ogni casualità: gli stati restano deterministici e testabili. */
  seed: number;
}

/** Metadati calcolati dal server per ogni input (mai forniti dal client). */
export interface InputMeta {
  /** Ora server in cui il messaggio è arrivato. */
  receivedAt: number;
  /** Ora della pressione dichiarata dal client, convertita in "ora server" (non fidata). */
  claimedTime: number;
  /** RTT misurato per quel giocatore. Il plugin ricava l'ora equa con `fairTime`. */
  rtt: number | null;
}

/** Punti assegnati a un giocatore e/o a un team (almeno uno dei due). */
export interface ScoreDelta {
  playerId: string | null;
  teamId: string | null;
  points: number;
  reason: string;
}

export interface RoundResult {
  /** Classifica del round (usata anche dalle modalità meta-gioco per assegnare premi). */
  ranking: { playerId: string; rank: number; points: number }[];
}

export interface HostAction {
  id: string;
  label: string;
  enabled: boolean;
  danger?: boolean;
}

/** Vista per la regia: può contenere informazioni segrete (es. la risposta corretta). */
export interface HostView {
  info: unknown;
  actions: HostAction[];
}

/**
 * Plugin di un minigioco. Tutte le funzioni di stato sono pure e deterministiche:
 * se non cambia nulla devono restituire lo stesso oggetto di stato (il server lo usa
 * per capire se serve un nuovo invio ai client).
 * Le viste (React) stanno nel client, registrate per `id`.
 */
export interface MinigameType<Config = unknown, State = unknown, Input = unknown, Command = unknown> {
  id: string;
  title: string;
  defaultTheme: ThemeId;
  configSchema: ZodType<Config>;
  inputSchema: ZodType<Input>;
  commandSchema: ZodType<Command>;
  /** Configurazione di esempio, valida per `configSchema`. */
  sampleConfig: Config;
  /** Punto di partenza dell'editor per una nuova istanza, se diverso dall'esempio: può essere incompleto (la regia lo completa). */
  draftConfig?: unknown;

  /**
   * Solo per i plugin «modalità» (es. il Duello dei Cavalieri), che si scelgono come modalità di una partita
   * invece di essere un round: schema della configurazione impostata dall'admin sulla partita,
   * esempio, e costruzione della configurazione completa leggendo la libreria.
   */
  modeConfigSchema?: ZodType<unknown>;
  sampleModeConfig?: unknown;
  buildConfig?(modeConfig: unknown, lookup: InstanceLookup, roster: { players: ParticipantInfo[]; teams: TeamInfo[] }): BuildConfigResult<Config>;

  init(config: Config, ctx: MinigameContext, now: number): State;
  onInput(state: State, playerId: string, input: Input, meta: InputMeta): State;
  onTick(state: State, now: number): State;
  onHostCommand(state: State, command: Command, now: number): State;
  /** True quando il round ha esaurito il proprio flusso: il server registra i punti. */
  isFinished(state: State): boolean;
  result(state: State): RoundResult;
  scores(state: State): ScoreDelta[];

  /** Solo informazioni pubbliche: lo schermo condiviso lo vedono tutti. */
  screenView(state: State): unknown;
  /** Solo ciò che quel giocatore/team può vedere. */
  viewFor(state: State, playerId: string, teamId: string | null): unknown;
  hostView(state: State): HostView;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyMinigame = MinigameType<any, any, any, any>;
