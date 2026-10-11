import { z } from "zod";
import type { MinigameType, ParticipantInfo } from "@gioco/shared";
import { makeRng, shuffle } from "../knight-duel/rng.js";
import { addTo, rankByPoints, totalsToScores } from "../util.js";

/**
 * Caccia ai Fantasmi: re della collina con ruoli nascosti.
 * Nella location ci sono alcune zone, ognuna con un QR code. Chi scansiona una zona la conquista per la propria
 * fazione e, finché la tiene, guadagna punti ogni secondo. I fantasmi (pochi, segreti) infestano le zone, gli
 * acchiappafantasmi le purificano.
 * Lo stato di una zona (libera, infestata, purificata) lo sa solo chi la scansiona di persona: né lo schermo né
 * i telefoni lo mostrano. Chi vuole informazioni deve andare al QR («controlla», senza conquistare) e questo
 * affolla le zone, dove un fantasma può confondersi. Ciò che un giocatore ha visto resta nel suo telefono con
 * l'ora, ma può essere cambiato da altri nel frattempo. I cacciatori devono dedurre dai movimenti reali chi è un
 * fantasma e accusarlo. Un'accusa giusta imprigiona il fantasma (e libera le sue zone), una sbagliata blocca
 * l'accusatore e costa punti. Alla fine vince la fazione che ha tenuto le zone per più secondi, e solo allora
 * lo stato di tutte le zone diventa pubblico.
 */

export type Side = "ghost" | "hunter";

/** Il codice del QR: lettere maiuscole e cifre, così si può anche digitare a mano. */
export const CODE_PATTERN = /^[A-Z0-9]{4,8}$/;

const zoneSchema = z.object({
  name: z.string().trim().min(1).max(30).meta({ title: "Nome della zona", description: "Es. «Cantina», «Giardino»" }),
  code: z
    .string()
    .regex(CODE_PATTERN, "Da 4 a 8 caratteri: lettere maiuscole e cifre")
    .meta({ title: "Codice del QR", description: "Da 4 a 8 caratteri (lettere maiuscole e cifre), diverso per ogni zona. Non facile da indovinare" }),
});

const sec = (title: string, description?: string) => ({ title, ...(description && { description }) });

export const ghostHuntConfigSchema = z
  .object({
    zones: z.array(zoneSchema).min(2).max(8).meta({ title: "Zone", itemLabel: "Zona", description: "I punti con un QR da scansionare. La regia stampa i QR prima di far partire la caccia" }),
    ghostCount: z.number().int().min(0).max(10).default(0).meta(sec("Fantasmi", "0 = automatico (circa uno ogni 5 giocatori). Scelti a caso e segreti")),
    durationSec: z.number().int().min(60).max(1800).default(300).meta(sec("Durata della caccia (s)")),
    headStartSec: z.number().int().min(0).max(300).default(30).meta(sec("Vantaggio dei fantasmi (s)", "All'inizio gli acchiappafantasmi non possono né scansionare né accusare: i fantasmi si nascondono")),
    scanCooldownSec: z.number().int().min(0).max(120).default(8).meta(sec("Pausa tra due scansioni (s)", "Impedisce di scansionare tutte le zone senza muoversi")),
    accuseCooldownSec: z.number().int().min(0).max(120).default(10).meta(sec("Pausa tra due accuse (s)")),
    jailSec: z.number().int().min(5).max(300).default(40).meta(sec("Prigione del fantasma catturato (s)", "Non può scansionare e perde le zone che teneva")),
    stunSec: z.number().int().min(5).max(300).default(20).meta(sec("Blocco per un'accusa sbagliata (s)")),
    zoneLockSec: z.number().int().min(0).max(300).default(30).meta(sec("Blocco di una zona dopo una conquista (s)", "Per questo tempo nessuno può riconquistarla: ogni incursione dei fantasmi vale qualcosa e non si annulla subito")),
    ghostWeight: z.number().min(0).max(10).default(0).meta(sec("Peso dei fantasmi", "0 = automatico (consigliato): cresce quando ci sono poche zone di fantasmi, perché ogni incursione vale di più. 1 = nessun peso. Il vincitore si decide sui secondi di controllo moltiplicati per il peso")),
    holdPointsPerSec: z.number().int().min(0).max(100).default(1).meta(sec("Punti al secondo per zona tenuta", "Vanno a chi ha scansionato per ultimo la zona")),
    flipPoints: z.number().int().min(0).max(10_000).default(20).meta(sec("Punti per una zona strappata al nemico")),
    catchPoints: z.number().int().min(0).max(10_000).default(100).meta(sec("Punti per un fantasma catturato")),
    wrongPenalty: z.number().int().min(0).max(10_000).default(30).meta(sec("Penalità per un'accusa sbagliata")),
    winPoints: z.number().int().min(0).max(10_000).default(200).meta(sec("Punti a ogni membro della fazione vincente", "In caso di parità metà dei punti a tutti")),
    revealSec: z.number().int().min(3).max(120).default(20).meta(sec("Rivelazione finale (s)", "Lo schermo mostra chi era un fantasma e chi ha vinto; poi si passa alla classifica (la regia può anticipare con «Concludi»)")),
  })
  .refine((c) => new Set(c.zones.map((z) => z.code)).size === c.zones.length, { message: "I codici delle zone devono essere tutti diversi", path: ["zones"] });

export type GhostHuntConfig = z.infer<typeof ghostHuntConfigSchema>;

const inputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("scan"), code: z.string().trim().min(1).max(40) }),
  /** Controlla lo stato di una zona senza conquistarla: serve comunque il suo codice, cioè essere lì. */
  z.object({ type: z.literal("look"), code: z.string().trim().min(1).max(40) }),
  z.object({ type: z.literal("accuse"), target: z.string().min(1).max(64) }),
]);
const commandSchema = z.object({ type: z.enum(["start", "end"]) });
type Input = z.infer<typeof inputSchema>;
type Command = z.infer<typeof commandSchema>;

/** Esito dell'ultima azione di un giocatore, mostrato solo a lui. */
export type FeedbackKind = "ok" | "flip" | "own" | "look" | "zoneLocked" | "unknown" | "cooldown" | "headStart" | "locked" | "caught" | "missed" | "already" | "self";
export interface Feedback {
  kind: FeedbackKind;
  zone: number | null;
  /** Stato della zona al momento del controllo o della conquista (solo per il giocatore che l'ha visitata). */
  owner: Side | null;
  /** Da quando la zona è in quello stato. */
  since: number | null;
  at: number;
  /** Fino a quando vale il blocco (cooldown, vantaggio, prigione). */
  until: number | null;
  /** Nome del bersaglio dell'accusa. */
  target: string | null;
  points: number;
}

/** Evento pubblico. Le conquiste delle zone non compaiono: sarebbero informazione che si ottiene solo andando lì. */
export interface GameEvent {
  id: number;
  at: number;
  kind: "catch" | "miss";
  a: string;
  b: string;
}

/** Ciò che un giocatore ha visto di una zona di persona, e quando. */
export interface Seen {
  owner: Side | null;
  since: number;
  at: number;
  /** Fino a quando la zona non si può riconquistare (0 = libera di essere presa). */
  lockUntil: number;
}

export interface Zone {
  owner: Side | null;
  holder: string | null;
  changedAt: number;
  /** Dopo una conquista la zona resta della fazione fino a questo istante. */
  lockUntil: number;
}

export interface GhostHuntState {
  cfg: GhostHuntConfig;
  seed: number;
  participants: ParticipantInfo[];
  roles: Record<string, Side>;
  /** `reveal`: la caccia è finita e si mostrano ruoli e vincitore; `done` chiude il round. */
  phase: "setup" | "play" | "reveal" | "done";
  startedAt: number;
  endsAt: number;
  revealUntil: number;
  huntersFrom: number;
  /** Fino a quando i punti di tenuta sono stati accreditati (a secondi interi). */
  accrueAt: number;
  zones: Zone[];
  /** Per ogni giocatore, l'ultimo stato visto di ogni zona (indice della zona → osservazione). */
  seen: Record<string, Record<number, Seen>>;
  /** Prigione (fantasma) o blocco (cacciatore) fino a questo istante. */
  lockedUntil: Record<string, number>;
  nextScanAt: Record<string, number>;
  nextAccuseAt: Record<string, number>;
  feedback: Record<string, Feedback>;
  events: GameEvent[];
  eventSeq: number;
  /** Secondi di controllo delle zone per fazione, già moltiplicati per il peso della fazione. */
  seconds: Record<Side, number>;
  /** Peso di un secondo di controllo per fazione (i fantasmi sono pochi: il loro peso compensa). */
  weight: Record<Side, number>;
  catches: number;
  totals: Record<string, number>;
  winner: Side | "draw" | null;
}

const MAX_EVENTS = 8;

const nick = (s: GhostHuntState, id: string) => s.participants.find((p) => p.id === id)?.nickname ?? "?";
const idsWith = (s: GhostHuntState, side: Side) => s.participants.map((p) => p.id).filter((id) => s.roles[id] === side);
export const normalizeCode = (raw: string) => raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Peso di un secondo di controllo dei fantasmi: quello scelto, o in automatico `1,1 + 0,4 × zone / fantasmi` (da 1 a 3).
 * Meno fantasmi ci sono per zona, meno incursioni possono fare e più vale ciascuna. La formula è stata ricavata con
 * simulazioni (30 giocatori, 6 fantasmi, 4 zone → 1,37; 12 giocatori, 2 fantasmi, 3 zone → 1,7) puntando a circa 50/50
 * tra cacciatori e fantasmi di pari abilità. NON usare il rapporto cacciatori/fantasmi (4×): i fantasmi vincerebbero sempre.
 */
export function ghostWeight(cfg: { ghostWeight: number; zones: unknown[] }, ghosts: number): number {
  if (cfg.ghostWeight > 0) return cfg.ghostWeight;
  if (ghosts === 0) return 1;
  return Math.round(Math.min(3, Math.max(1, 1.1 + (0.4 * cfg.zones.length) / ghosts)) * 100) / 100;
}

/** Fantasmi automatici: circa uno ogni 5 giocatori, almeno uno. */
export function autoGhosts(players: number): number {
  return Math.max(1, Math.round(players / 5));
}

function pushEvent(s: GhostHuntState, e: Omit<GameEvent, "id">): GhostHuntState {
  const id = s.eventSeq + 1;
  return { ...s, eventSeq: id, events: [...s.events, { ...e, id }].slice(-MAX_EVENTS) };
}

function withFeedback(s: GhostHuntState, playerId: string, f: Partial<Feedback> & Pick<Feedback, "kind" | "at">): GhostHuntState {
  return { ...s, feedback: { ...s.feedback, [playerId]: { zone: null, owner: null, since: null, until: null, target: null, points: 0, ...f } } };
}

function remember(s: GhostHuntState, playerId: string, zone: number, seen: Seen): GhostHuntState {
  return { ...s, seen: { ...s.seen, [playerId]: { ...s.seen[playerId], [zone]: seen } } };
}

/** Accredita i punti di tenuta per i secondi interi trascorsi fino a `to` (mai oltre la fine). */
function accrue(s: GhostHuntState, to: number): GhostHuntState {
  if (s.phase !== "play") return s;
  const secs = Math.floor((Math.min(to, s.endsAt) - s.accrueAt) / 1000);
  if (secs <= 0) return s;
  let totals = s.totals;
  const seconds = { ...s.seconds };
  for (const z of s.zones) {
    if (!z.owner || !z.holder) continue;
    seconds[z.owner] += secs * s.weight[z.owner];
    if (s.cfg.holdPointsPerSec > 0) totals = addTo(totals, z.holder, secs * s.cfg.holdPointsPerSec);
  }
  return { ...s, totals, seconds, accrueAt: s.accrueAt + secs * 1000 };
}

/** Chiude la caccia: assegna i premi di vittoria e apre la rivelazione. `now` è l'istante in cui la si mostra. */
function finish(s: GhostHuntState, now: number): GhostHuntState {
  const { ghost, hunter } = s.seconds;
  const winner: Side | "draw" = ghost > hunter ? "ghost" : hunter > ghost ? "hunter" : "draw";
  let totals = s.totals;
  for (const id of s.participants.map((p) => p.id)) {
    const side = s.roles[id]!;
    const pts = winner === "draw" ? Math.round(s.cfg.winPoints / 2) : winner === side ? s.cfg.winPoints : 0;
    if (pts !== 0) totals = addTo(totals, id, pts);
  }
  return { ...s, phase: "reveal", revealUntil: now + s.cfg.revealSec * 1000, totals, winner };
}

function begin(s: GhostHuntState, now: number): GhostHuntState {
  if (s.phase !== "setup") return s;
  return {
    ...s,
    phase: "play",
    startedAt: now,
    endsAt: now + s.cfg.durationSec * 1000,
    huntersFrom: now + s.cfg.headStartSec * 1000,
    accrueAt: now,
  };
}

/** Il giocatore può agire? Altrimenti il motivo (da mostrargli) e fino a quando. */
function blocked(s: GhostHuntState, id: string, t: number): { kind: FeedbackKind; until: number } | null {
  if (s.roles[id] === "hunter" && t < s.huntersFrom) return { kind: "headStart", until: s.huntersFrom };
  const locked = s.lockedUntil[id] ?? 0;
  if (t < locked) return { kind: "locked", until: locked };
  return null;
}

function scan(s: GhostHuntState, id: string, side: Side, code: string, t: number): GhostHuntState {
  const block = blocked(s, id, t);
  if (block) return withFeedback(s, id, { ...block, at: t });
  const wait = s.nextScanAt[id] ?? 0;
  if (t < wait) return withFeedback(s, id, { kind: "cooldown", at: t, until: wait });
  const zi = s.cfg.zones.findIndex((z) => z.code === normalizeCode(code));
  if (zi < 0) return withFeedback(s, id, { kind: "unknown", at: t });
  const zone = s.zones[zi]!;
  if (zone.owner === side) {
    const known = remember(s, id, zi, { owner: side, since: zone.changedAt, at: t, lockUntil: zone.lockUntil });
    return withFeedback(known, id, { kind: "own", zone: zi, at: t, owner: side, since: zone.changedAt });
  }

  if (t < zone.lockUntil) {
    // La zona è appena stata conquistata: chi è lì lo vede, ma non può riprendersela ancora.
    const known = remember(s, id, zi, { owner: zone.owner, since: zone.changedAt, at: t, lockUntil: zone.lockUntil });
    return withFeedback(known, id, { kind: "zoneLocked", zone: zi, at: t, owner: zone.owner, since: zone.changedAt, until: zone.lockUntil });
  }

  const flipped = zone.owner !== null;
  const points = flipped ? s.cfg.flipPoints : 0;
  const lockUntil = t + s.cfg.zoneLockSec * 1000;
  const zones = s.zones.map((z, i) => (i === zi ? { owner: side, holder: id, changedAt: t, lockUntil } : z));
  const next = remember(
    {
      ...s,
      zones,
      totals: points ? addTo(s.totals, id, points) : s.totals,
      nextScanAt: { ...s.nextScanAt, [id]: t + s.cfg.scanCooldownSec * 1000 },
    },
    id,
    zi,
    { owner: side, since: t, at: t, lockUntil },
  );
  return withFeedback(next, id, { kind: flipped ? "flip" : "ok", zone: zi, at: t, points, owner: side, since: t });
}

/** Controlla una zona senza conquistarla. Come la conquista richiede di avere il codice, cioè di essere sul posto. */
function look(s: GhostHuntState, id: string, code: string, t: number): GhostHuntState {
  const block = blocked(s, id, t);
  if (block) return withFeedback(s, id, { ...block, at: t });
  const zi = s.cfg.zones.findIndex((z) => z.code === normalizeCode(code));
  if (zi < 0) return withFeedback(s, id, { kind: "unknown", at: t });
  const zone = s.zones[zi]!;
  const known = remember(s, id, zi, { owner: zone.owner, since: zone.changedAt, at: t, lockUntil: zone.lockUntil });
  return withFeedback(known, id, { kind: "look", zone: zi, at: t, owner: zone.owner, since: zone.changedAt, until: zone.lockUntil > t ? zone.lockUntil : null });
}

function accuse(s: GhostHuntState, id: string, targetId: string, t: number): GhostHuntState {
  const block = blocked(s, id, t);
  if (block) return withFeedback(s, id, { ...block, at: t });
  if (targetId === id || !s.roles[targetId]) return withFeedback(s, id, { kind: "self", at: t });
  const wait = s.nextAccuseAt[id] ?? 0;
  if (t < wait) return withFeedback(s, id, { kind: "cooldown", at: t, until: wait });
  const targetName = nick(s, targetId);

  if (s.roles[targetId] === "ghost") {
    if (t < (s.lockedUntil[targetId] ?? 0)) return withFeedback(s, id, { kind: "already", at: t, target: targetName });
    const freeUntil = t + s.cfg.jailSec * 1000;
    // Le zone del fantasma catturato tornano libere.
    const zones = s.zones.map((z) => (z.holder === targetId ? { owner: null, holder: null, changedAt: t, lockUntil: 0 } : z));
    let next: GhostHuntState = {
      ...s,
      zones,
      catches: s.catches + 1,
      lockedUntil: { ...s.lockedUntil, [targetId]: freeUntil },
      nextAccuseAt: { ...s.nextAccuseAt, [id]: t + s.cfg.accuseCooldownSec * 1000 },
      totals: s.cfg.catchPoints ? addTo(s.totals, id, s.cfg.catchPoints) : s.totals,
    };
    next = pushEvent(next, { at: t, kind: "catch", a: nick(s, id), b: targetName });
    return withFeedback(next, id, { kind: "caught", at: t, target: targetName, points: s.cfg.catchPoints });
  }

  // Innocente: l'accusatore resta bloccato e perde punti.
  const until = t + s.cfg.stunSec * 1000;
  let next: GhostHuntState = {
    ...s,
    lockedUntil: { ...s.lockedUntil, [id]: until },
    nextAccuseAt: { ...s.nextAccuseAt, [id]: t + s.cfg.accuseCooldownSec * 1000 },
    totals: s.cfg.wrongPenalty ? addTo(s.totals, id, -s.cfg.wrongPenalty) : s.totals,
  };
  next = pushEvent(next, { at: t, kind: "miss", a: nick(s, id), b: targetName });
  return withFeedback(next, id, { kind: "missed", at: t, until, target: targetName, points: -s.cfg.wrongPenalty });
}

const roundSeconds = (s: Record<Side, number>): Record<Side, number> => ({ ghost: Math.round(s.ghost), hunter: Math.round(s.hunter) });

/** I valori delle regole di questa partita, per la pagina «Regole» del telefono. Sono pubblici: nessun segreto. */
export interface RulesInfo {
  zoneCount: number;
  ghostCount: number;
  durationSec: number;
  headStartSec: number;
  scanCooldownSec: number;
  accuseCooldownSec: number;
  jailSec: number;
  stunSec: number;
  holdPointsPerSec: number;
  flipPoints: number;
  catchPoints: number;
  wrongPenalty: number;
  winPoints: number;
  zoneLockSec: number;
  /** Peso effettivo di un secondo di controllo dei fantasmi (già calcolato). */
  ghostWeight: number;
}

const rulesOf = (s: GhostHuntState): RulesInfo => ({
  zoneCount: s.cfg.zones.length,
  ghostCount: idsWith(s, "ghost").length,
  durationSec: s.cfg.durationSec,
  headStartSec: s.cfg.headStartSec,
  scanCooldownSec: s.cfg.scanCooldownSec,
  accuseCooldownSec: s.cfg.accuseCooldownSec,
  jailSec: s.cfg.jailSec,
  stunSec: s.cfg.stunSec,
  holdPointsPerSec: s.cfg.holdPointsPerSec,
  flipPoints: s.cfg.flipPoints,
  catchPoints: s.cfg.catchPoints,
  wrongPenalty: s.cfg.wrongPenalty,
  winPoints: s.cfg.winPoints,
  zoneLockSec: s.cfg.zoneLockSec,
  ghostWeight: s.weight.ghost,
});

/** Le zone per tutti: solo il nome. Lo stato lo conosce chi le ha viste di persona (`seen`) o, a fine caccia, tutti. */
const zoneNames = (s: GhostHuntState) => s.cfg.zones.map((z) => ({ name: z.name }));
const revealedZones = (s: GhostHuntState) => s.zones.map((z, i) => ({ name: s.cfg.zones[i]!.name, owner: z.owner }));

export const ghostHunt: MinigameType<GhostHuntConfig, GhostHuntState, Input, Command> = {
  id: "caccia-fantasmi",
  title: "Caccia ai Fantasmi",
  defaultTheme: "retro80",
  configSchema: ghostHuntConfigSchema as unknown as z.ZodType<GhostHuntConfig>,
  inputSchema,
  commandSchema,
  sampleConfig: {
    zones: [
      { name: "Cantina", code: "K7QD" },
      { name: "Giardino", code: "M2XP" },
      { name: "Soffitta", code: "R9TV" },
      { name: "Cucina", code: "H4WZ" },
    ],
    ghostCount: 0,
    durationSec: 300,
    headStartSec: 30,
    scanCooldownSec: 8,
    accuseCooldownSec: 10,
    jailSec: 40,
    stunSec: 20,
    zoneLockSec: 30,
    ghostWeight: 0,
    holdPointsPerSec: 1,
    flipPoints: 20,
    catchPoints: 100,
    wrongPenalty: 30,
    winPoints: 200,
    revealSec: 20,
  },

  init(config, ctx, now) {
    const ids = ctx.players.map((p) => p.id);
    const wanted = config.ghostCount > 0 ? config.ghostCount : autoGhosts(ids.length);
    const ghosts = new Set(shuffle(ids, makeRng(ctx.seed)).slice(0, Math.min(wanted, Math.floor(ids.length / 2))));
    const roles: Record<string, Side> = {};
    for (const id of ids) roles[id] = ghosts.has(id) ? "ghost" : "hunter";
    return {
      cfg: config,
      seed: ctx.seed,
      participants: ctx.players,
      roles,
      phase: "setup",
      startedAt: now,
      endsAt: now,
      revealUntil: now,
      huntersFrom: now,
      accrueAt: now,
      zones: config.zones.map(() => ({ owner: null, holder: null, changedAt: now, lockUntil: 0 })),
      seen: {},
      lockedUntil: {},
      nextScanAt: {},
      nextAccuseAt: {},
      feedback: {},
      events: [],
      eventSeq: 0,
      seconds: { ghost: 0, hunter: 0 },
      weight: { ghost: ghostWeight(config, ghosts.size), hunter: 1 },
      catches: 0,
      totals: {},
      winner: null,
    };
  },

  onInput(state, playerId, input, meta) {
    if (state.phase !== "play") return state;
    const side = state.roles[playerId];
    if (!side) return state;
    const t = Math.max(meta.receivedAt, state.accrueAt);
    if (t >= state.endsAt) return state; // ci pensa onTick a chiudere
    const s = accrue(state, t);
    if (input.type === "scan") return scan(s, playerId, side, input.code, t);
    if (input.type === "look") return look(s, playerId, input.code, t);
    if (side !== "hunter") return state;
    return accuse(s, playerId, input.target, t);
  },

  onTick(state, now) {
    if (state.phase === "reveal") return now >= state.revealUntil ? { ...state, phase: "done" } : state;
    if (state.phase !== "play") return state;
    if (now >= state.endsAt) return finish(accrue(state, state.endsAt), now);
    return accrue(state, now);
  },

  onHostCommand(state, command, now) {
    if (command.type === "start") return begin(state, now);
    if (state.phase === "play") return finish(accrue(state, now), now);
    if (state.phase === "reveal") return { ...state, phase: "done" };
    return state;
  },

  isFinished: (state) => state.phase === "done",
  result: (state) => rankByPoints(state.totals, state.participants.map((p) => p.id)),
  scores: (state) => totalsToScores(state.totals, "Caccia ai Fantasmi"),

  // Pubblico: nessun ruolo, nessuno stato delle zone, nessun totale che lo lasci intuire (secondi per fazione,
  // punti). Un fantasma è noto solo dopo essere stato catturato. Tutto si scopre alla rivelazione.
  screenView(state) {
    if (state.phase === "reveal" || state.phase === "done") {
      return {
        phase: state.phase,
        winner: state.winner,
        seconds: roundSeconds(state.seconds),
        weight: state.weight.ghost,
        catches: state.catches,
        zones: revealedZones(state),
        players: state.participants.map((p) => ({ id: p.id, nickname: p.nickname, role: state.roles[p.id]!, points: state.totals[p.id] ?? 0 })),
      };
    }
    const caught = idsWith(state, "ghost")
      .filter((id) => (state.lockedUntil[id] ?? 0) > 0)
      .map((id) => ({ nickname: nick(state, id), until: state.lockedUntil[id]! }));
    return {
      phase: state.phase,
      startedAt: state.startedAt,
      endsAt: state.endsAt,
      huntersFrom: state.huntersFrom,
      zones: zoneNames(state),
      ghostsTotal: idsWith(state, "ghost").length,
      playersTotal: state.participants.length,
      catches: state.catches,
      caught,
      events: state.events,
    };
  },

  viewFor(state, playerId) {
    const role = state.roles[playerId] ?? null;
    if (!role) return { phase: "done" as const, role: null, winner: null, points: 0 };
    const over = state.phase === "reveal" || state.phase === "done";
    const me = {
      role,
      // Durante la caccia il totale tradirebbe se si tiene ancora una zona (smette di salire quando la si perde).
      points: over ? (state.totals[playerId] ?? 0) : null,
      lockedUntil: state.lockedUntil[playerId] ?? 0,
      nextScanAt: state.nextScanAt[playerId] ?? 0,
      nextAccuseAt: state.nextAccuseAt[playerId] ?? 0,
      feedback: state.feedback[playerId] ?? null,
    };
    if (state.phase === "reveal" || state.phase === "done") {
      return { phase: state.phase, ...me, winner: state.winner, seconds: roundSeconds(state.seconds) };
    }
    return {
      phase: state.phase,
      ...me,
      startedAt: state.startedAt,
      endsAt: state.endsAt,
      huntersFrom: state.huntersFrom,
      rules: rulesOf(state),
      // Solo il nome e ciò che questo giocatore ha visto di persona (può essere superato).
      zones: zoneNames(state).map((z, i) => ({ ...z, seen: state.seen[playerId]?.[i] ?? null })),
      events: state.events,
      mates: role === "ghost" ? idsWith(state, "ghost").filter((id) => id !== playerId).map((id) => nick(state, id)) : [],
      // Solo i cacciatori accusano. Il flag «in prigione» compare solo per i fantasmi già catturati, che sono pubblici.
      suspects:
        role === "hunter"
          ? state.participants
              .filter((p) => p.id !== playerId)
              .map((p) => ({ id: p.id, nickname: p.nickname, jailedUntil: state.roles[p.id] === "ghost" ? (state.lockedUntil[p.id] ?? 0) : 0 }))
          : [],
    };
  },

  hostView(state) {
    return {
      info: {
        phase: state.phase,
        "Fantasmi (segreto)": idsWith(state, "ghost").map((id) => nick(state, id)).join(", "),
        // Solo la regia vede lo stato di tutte le zone (per giocatori e schermo è segreto).
        Zone: state.zones.map((z, i) => `${state.cfg.zones[i]!.name} ${z.owner === "ghost" ? "👻" : z.owner === "hunter" ? "🔦" : "libera"}`).join(" · "),
        "Fantasmi catturati": state.catches,
        qrCodes: state.cfg.zones.map((z) => ({ name: z.name, code: z.code })),
      },
      actions: [
        { id: "start", label: "Via alla caccia!", enabled: state.phase === "setup" },
        state.phase === "reveal"
          ? { id: "end", label: "Concludi", enabled: true }
          : { id: "end", label: "Termina la caccia", enabled: state.phase === "play", danger: true },
      ],
    };
  },
};
