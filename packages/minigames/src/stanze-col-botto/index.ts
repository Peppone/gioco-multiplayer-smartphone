import { z } from "zod";
import type { MinigameType, ParticipantInfo, ScoreDelta } from "@gioco/shared";
import { deriveSeed, makeRng, shuffle } from "../knight-duel/rng.js";
import { GRACE_MS, rankByPoints } from "../util.js";

/**
 * Stanze col botto: deduzione sociale in due stanze, nello stile di Two Rooms and a Boom, senza carte.
 * Il telefono è la carta personaggio: l'app abbina i giocatori alle due stanze, distribuisce i ruoli, tiene il tempo,
 * gestisce i leader (voto, nomina, abdicazione), gli ostaggi, le condivisioni delle carte e la rivelazione finale.
 * La trattativa resta a voce. Regole e decisioni in docs/PIANO-STANZE-COL-BOTTO.md.
 */

export type Team = "blue" | "red" | "grey";
export type RoomId = 0 | 1;
export type CharacterId = "president" | "bomber" | "blue-member" | "red-member" | "gambler";
export type Phase = "pairing" | "deal" | "round" | "lock" | "hostages" | "exchange" | "gamble" | "reveal" | "done";
export type ShareKind = "card-share" | "color-share" | "card-reveal" | "color-reveal" | "public-card" | "public-color";
export type RoomAssignment = "random" | "qr" | "host";
/** Come si propone lo «Scambia»: dall'app (tocca un nome), con la scansione reciproca dei QR, o entrambi. */
export type ShareMethod = "app" | "qr" | "both";

export interface Card {
  team: Team;
  character: CharacterId;
}

const sec = (title: string, description?: string) => ({ title, ...(description && { description }) });

const customRoundSchema = z.object({
  seconds: z.number().int().min(10).max(900).default(120).meta(sec("Durata (s)")),
  hostages6to10: z.number().int().min(0).max(15).default(1).meta(sec("Ostaggi con 6–10 giocatori")),
  hostages11to21: z.number().int().min(0).max(15).default(1).meta(sec("Ostaggi con 11–21 giocatori")),
  hostages22plus: z.number().int().min(0).max(15).default(1).meta(sec("Ostaggi con 22 o più giocatori")),
});

export const stanzeColBottoConfigSchema = z
  .object({
    firstRoomName: z.string().trim().min(1).max(20).default("Stanza A").meta(sec("Nome della prima stanza", "Mostrato su telefoni e schermo (es. Salotto)")),
    secondRoomName: z.string().trim().min(1).max(20).default("Stanza B").meta(sec("Nome della seconda stanza", "Mostrato su telefoni e schermo (es. Cucina)")),
    roomAssignment: z.enum(["random", "qr", "host"]).default("random").meta({ ...sec("Abbinamento alle stanze", "A caso, con i QR mostrati sullo schermo, oppure deciso dalla regia"), enumLabels: { random: "A caso", qr: "Con i QR", host: "Dalla regia" } }),
    roundMode: z.enum(["base", "long", "custom"]).default("base").meta({ ...sec("Round", "Base: 3 round da 3-2-1 minuti. Lungo: 5 round da 5-4-3-2-1 (solo con più di 10 giocatori). Personalizzato: tabella qui sotto"), enumLabels: { base: "Base (3-2-1 min)", long: "Lungo (5-4-3-2-1 min)", custom: "Personalizzato" } }),
    customRounds: z.array(customRoundSchema).max(8).default([]).meta({ title: "Round personalizzati", itemLabel: "Round", description: "Solo con «Personalizzato»" }),
    colorShare: z.enum(["auto", "always", "never"]).default("auto").meta({ ...sec("Mostrare solo il colore", "Automatico: ammesso solo con più di 10 giocatori, come nel gioco originale"), enumLabels: { auto: "Automatico", always: "Sempre", never: "Mai" } }),
    shareMethod: z.enum(["app", "qr", "both"]).default("app").meta({ ...sec("Come si scambiano le carte", "Dall'app: si tocca un nome. Con i QR: ci si inquadra a vicenda i telefoni, così la stanza vede che lo scambio è avvenuto. «Solo con i QR» toglie dall'app anche «Mostra» e «Mostra a tutti»: le carte si vedono solo inquadrandosi a vicenda"), enumLabels: { app: "Dall'app", qr: "Solo con i QR", both: "Dall'app o con i QR" } }),
    lockSeconds: z.number().int().min(5).max(120).default(20).meta(sec("Tempo per eleggere un leader a fine round (s)", "Se una stanza ne è senza, allo scadere lo estrae il server")),
    hostageSeconds: z.number().int().min(5).max(180).default(20).meta(sec("Tempo per confermare gli ostaggi (s)", "Allo scadere completa le scelte il server")),
    startAfterFirstSeconds: z.number().int().min(0).max(60).default(5).meta(sec("Avvio del round dopo il primo leader (s)", "Il round successivo parte questi secondi dopo che il primo leader preme «Avvia il round»")),
    startAfterExchangeSeconds: z.number().int().min(1).max(120).default(15).meta(sec("Avvio del round dopo lo scambio (s)", "Il round successivo parte comunque dopo questo tempo")),
    gambleSeconds: z.number().int().min(5).max(120).default(20).meta(sec("Tempo per la previsione del Giocatore d'azzardo (s)")),
    winPoints: z.number().int().min(0).max(10_000).default(100).meta(sec("Punti a ogni membro della squadra vincitrice")),
    gamblerPoints: z.number().int().min(0).max(10_000).default(100).meta(sec("Punti al Giocatore d'azzardo che indovina")),
  })
  .superRefine((c, ctx) => {
    if (c.roundMode === "custom" && c.customRounds.length === 0) {
      ctx.addIssue({ code: "custom", message: "Con i round personalizzati serve almeno un round", path: ["customRounds"] });
    }
  });

export type StanzeColBottoConfig = z.infer<typeof stanzeColBottoConfigSchema>;

const id = z.string().min(1).max(64);
const inputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join-room"), code: z.string().trim().min(1).max(12) }),
  z.object({ type: z.literal("appoint"), targetId: id }),
  /** `null` ritira il voto. */
  z.object({ type: z.literal("vote-leader"), targetId: id.nullable() }),
  z.object({ type: z.literal("abdicate"), targetId: id }),
  z.object({ type: z.literal("abdicate-answer"), accept: z.boolean() }),
  z.object({ type: z.literal("pick-hostages"), playerIds: z.array(id).max(15) }),
  z.object({ type: z.literal("confirm-hostages") }),
  z.object({ type: z.literal("start-round") }),
  z.object({ type: z.literal("share-offer"), kind: z.enum(["card", "color"]), targetId: id }),
  z.object({ type: z.literal("share-answer"), seq: z.number().int().min(1), accept: z.boolean() }),
  /** Ho inquadrato il QR di un compagno: lo scambio avviene quando anche lui inquadra il mio. */
  z.object({ type: z.literal("scan-peer"), code: z.string().trim().min(1).max(12), kind: z.enum(["card", "color"]) }),
  /** «Mostra» a senso unico; `targetId: null` = a tutta la stanza. */
  z.object({ type: z.literal("reveal"), kind: z.enum(["card", "color"]), targetId: id.nullable() }),
  z.object({ type: z.literal("gamble"), team: z.enum(["blue", "red"]) }),
]);
const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("deal") }),
  z.object({ type: z.literal("shuffle-rooms") }),
  z.object({ type: z.literal("set-assignment"), mode: z.enum(["random", "qr", "host"]) }),
  z.object({ type: z.literal("move-player"), playerId: id, room: z.union([z.literal(0), z.literal(1)]) }),
  z.object({ type: z.literal("set-leader"), room: z.union([z.literal(0), z.literal(1)]), playerId: id }),
  z.object({ type: z.literal("set-hostages"), room: z.union([z.literal(0), z.literal(1)]), playerIds: z.array(id).max(15) }),
  z.object({ type: z.literal("set-blind"), blind: z.boolean() }),
  z.object({ type: z.literal("start-round") }),
  z.object({ type: z.literal("end-round") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("next") }),
]);
type Input = z.infer<typeof inputSchema>;
type Command = z.infer<typeof commandSchema>;

export interface Share {
  seq: number;
  kind: ShareKind;
  from: string;
  /** Null per le rivelazioni a tutta la stanza. */
  to: string | null;
  /** Chi ha visto, fissato al momento (per le condivisioni: i due giocatori). */
  audience: string[];
  room: RoomId;
  round: number;
  at: number;
  status: "pending" | "accepted" | "declined" | "expired";
}

/** «Ho inquadrato il QR di `to`»: da solo non rivela nulla, serve anche la scansione nel verso opposto. */
export interface Scan {
  from: string;
  to: string;
  kind: "card" | "color";
  at: number;
}

export interface RoomState {
  leader: string | null;
  leaderLocked: boolean;
  /** Elettore → candidato (solo della stessa stanza). */
  leaderVotes: Record<string, string>;
  abdicateOffer: { to: string; at: number } | null;
  /** Chi ha accettato la leadership in questo round e non può restituirla fino al prossimo. */
  abdicatedThisRound: string[];
  hostagePicks: string[];
  hostagesConfirmed: boolean;
  /** Il leader ha premuto «Avvia il round» (fase `exchange`). */
  startPressedAt: number | null;
}

export interface Exchange {
  round: number;
  moved: { playerId: string; from: RoomId; to: RoomId }[];
}

export interface StanzeColBottoState {
  cfg: StanzeColBottoConfig;
  seed: number;
  participants: ParticipantInfo[];
  /** Ordine fisso dei giocatori. */
  players: string[];
  phase: Phase;
  round: number;
  rounds: { seconds: number; hostages: number }[];
  /** Carte: vuoto finché non si distribuiscono (fase `deal`). */
  cards: Record<string, Card>;
  /** Stanza di ognuno; in `pairing` solo per chi è già abbinato. */
  room: Record<string, RoomId>;
  rooms: [RoomState, RoomState];
  assignment: RoomAssignment;
  /** Codici dei QR di stanza, nuovi a ogni partita. */
  roomCodes: [string, string];
  /** Chi ha provato a entrare in una stanza piena: giocatore → stanza rifiutata. */
  joinRefused: Record<string, RoomId>;
  shuffles: number;
  /** Leader visibili a tutti: si aggiornano quando entrambe le stanze hanno bloccato il leader. */
  revealedLeaders: [string | null, string | null];
  revealedRound: number | null;
  exchanges: Exchange[];
  shares: Share[];
  nextSeq: number;
  /** QR personali per lo scambio con i QR: un codice a testa, che ruota; si accetta anche quello appena scaduto. */
  qrCodes: Record<string, string>;
  qrPrev: Record<string, string>;
  qrEpoch: number;
  qrAt: number;
  scans: Scan[];
  phaseStartedAt: number;
  phaseEndsAt: number | null;
  pausedRemainingMs: number | null;
  gamblerGuess: "blue" | "red" | null;
  /** Modalità cieca della regia (§6): `hostView` non contiene segreti. */
  blind: boolean;
  /** La modalità cieca è stata disattivata a partita iniziata: lo schermo avvisa che la regia vede le carte. */
  blindBroken: boolean;
  outcome: { winner: "blue" | "red"; reason: string; sameRoom: boolean } | null;
}

const OFFER_MS = 20_000;
/** Ogni QR personale vale 20 s (più altri 20 da «scaduto»): una foto di un QR non serve a lungo. */
const QR_TTL_MS = 20_000;
/** Tempo entro cui anche l'altro deve inquadrare il mio QR. */
const SCAN_MS = 30_000;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const nick = (s: StanzeColBottoState, pid: string) => s.participants.find((p) => p.id === pid)?.nickname ?? "?";
const rng = (s: StanzeColBottoState, salt: number) => makeRng(deriveSeed(s.seed, salt));
const other = (r: RoomId): RoomId => (r === 0 ? 1 : 0);
const roomNamesOf = (cfg: Pick<StanzeColBottoConfig, "firstRoomName" | "secondRoomName">): [string, string] => [cfg.firstRoomName, cfg.secondRoomName];
const playersIn = (s: StanzeColBottoState, r: RoomId) => s.players.filter((p) => s.room[p] === r);
const dealt = (s: StanzeColBottoState) => s.phase !== "pairing";
const lastRound = (s: StanzeColBottoState) => s.round >= s.rounds.length - 1;
const setRoom = (s: StanzeColBottoState, r: RoomId, patch: Partial<RoomState>): StanzeColBottoState => ({
  ...s,
  rooms: r === 0 ? [{ ...s.rooms[0], ...patch }, s.rooms[1]] : [s.rooms[0], { ...s.rooms[1], ...patch }],
});

// ---- Tabelle dei round ----

/** Con più di 10 giocatori ammesso il colore (come l'originale), salvo diversa scelta dell'istanza. */
export function colorAllowed(cfg: Pick<StanzeColBottoConfig, "colorShare">, players: number): boolean {
  return cfg.colorShare === "always" || (cfg.colorShare === "auto" && players > 10);
}

const BASE_SECONDS = [180, 120, 60];
const LONG_SECONDS = [300, 240, 180, 120, 60];
const BASE_HOSTAGES: [number, number, number][] = [
  [1, 1, 1], // 6–10
  [2, 1, 1], // 11–21
  [3, 2, 1], // 22+
];
const LONG_HOSTAGES: number[][] = [
  [2, 2, 1, 1, 1], // 11–13
  [3, 2, 2, 1, 1], // 14–17
  [4, 3, 2, 1, 1], // 18–21
  [5, 4, 3, 2, 1], // 22+
];

/** Durate e ostaggi di ogni round. `long` sotto gli 11 giocatori ripiega su `base`. Gli ostaggi non superano la stanza più piccola meno il leader. */
export function roundTable(cfg: StanzeColBottoConfig, players: number): { seconds: number; hostages: number }[] {
  const cap = Math.max(0, Math.floor(players / 2) - 1);
  const band = players <= 10 ? 0 : players <= 21 ? 1 : 2;
  let rows: { seconds: number; hostages: number }[];
  if (cfg.roundMode === "custom" && cfg.customRounds.length > 0) {
    rows = cfg.customRounds.map((r) => ({ seconds: r.seconds, hostages: [r.hostages6to10, r.hostages11to21, r.hostages22plus][band]! }));
  } else if (cfg.roundMode === "long" && players > 10) {
    const row = players <= 13 ? 0 : players <= 17 ? 1 : players <= 21 ? 2 : 3;
    rows = LONG_SECONDS.map((seconds, i) => ({ seconds, hostages: LONG_HOSTAGES[row]![i]! }));
  } else {
    rows = BASE_SECONDS.map((seconds, i) => ({ seconds, hostages: BASE_HOSTAGES[band]![i]! }));
  }
  return rows.map((r) => ({ ...r, hostages: Math.min(r.hostages, cap) }));
}

// ---- Carte ----

/** Presidente e Bombarolo, poi squadre pari di membri; con un numero dispari entra il Giocatore d'azzardo. */
export function dealCards(players: string[], rand: () => number): Record<string, Card> {
  const deck: Card[] = [
    { team: "blue", character: "president" },
    { team: "red", character: "bomber" },
  ];
  const rest = players.length - 2 - (players.length % 2 === 1 ? 1 : 0);
  for (let i = 0; i < rest / 2; i++) deck.push({ team: "blue", character: "blue-member" }, { team: "red", character: "red-member" });
  if (players.length % 2 === 1) deck.push({ team: "grey", character: "gambler" });
  const order = shuffle(players, rand);
  return Object.fromEntries(order.map((p, i) => [p, deck[i]!]));
}

// ---- Conoscenza: chi sa la carta di chi è una funzione pura del registro `shares` ----

export interface Known {
  playerId: string;
  level: "card" | "color";
  seq: number;
}

const levelOf = (kind: ShareKind): "card" | "color" => (kind === "card-share" || kind === "card-reveal" || kind === "public-card" ? "card" : "color");
const isShare = (kind: ShareKind) => kind === "card-share" || kind === "color-share";

/** Le carte (o i soli colori) degli altri che `viewer` ha visto con condivisioni e rivelazioni accettate. */
export function knownBy(s: StanzeColBottoState, viewer: string): Known[] {
  const best = new Map<string, Known>();
  const add = (playerId: string, level: "card" | "color", seq: number) => {
    const prev = best.get(playerId);
    if (!prev || (level === "card" && prev.level === "color") || (level === prev.level && seq > prev.seq)) best.set(playerId, { playerId, level, seq });
  };
  for (const sh of s.shares) {
    if (sh.status !== "accepted" || !sh.audience.includes(viewer)) continue;
    const level = levelOf(sh.kind);
    if (isShare(sh.kind)) {
      if (sh.to === null) continue;
      add(viewer === sh.from ? sh.to : sh.from, level, sh.seq);
    } else if (sh.from !== viewer) add(sh.from, level, sh.seq);
  }
  return [...best.values()].sort((a, b) => b.seq - a.seq);
}

// ---- Fasi e tempo ----

function enter(s: StanzeColBottoState, phase: Phase, now: number, seconds: number | null): StanzeColBottoState {
  return { ...s, phase, phaseStartedAt: now, phaseEndsAt: seconds === null ? null : now + seconds * 1000, pausedRemainingMs: null, scans: [] };
}

const TIMED: Phase[] = ["round", "lock", "hostages", "exchange", "gamble"];

const freshRoom = (r: RoomState): RoomState => ({ ...r, leaderLocked: false, leaderVotes: {}, abdicateOffer: null, abdicatedThisRound: [], hostagePicks: [], hostagesConfirmed: false, startPressedAt: null });

function startRound(s: StanzeColBottoState, index: number, now: number): StanzeColBottoState {
  const next = enter({ ...s, round: index, rooms: [freshRoom(s.rooms[0]), freshRoom(s.rooms[1])] }, "round", now, s.rounds[index]!.seconds);
  return next;
}

/** Ostaggi da scambiare adesso: quelli del round, ma mai più della stanza più piccola meno il leader. */
export function hostagesNeeded(s: StanzeColBottoState): number {
  const smallest = Math.min(playersIn(s, 0).length, playersIn(s, 1).length);
  return Math.max(0, Math.min(s.rounds[s.round]?.hostages ?? 0, smallest - 1));
}

function enterLock(s: StanzeColBottoState, now: number): StanzeColBottoState {
  const rooms = s.rooms.map((r) => (r.leader ? { ...r, leaderLocked: true, leaderVotes: {}, abdicateOffer: null } : r)) as [RoomState, RoomState];
  const next = { ...s, rooms };
  return rooms.every((r) => r.leader) ? completeLock(next, now) : enter(next, "lock", now, s.cfg.lockSeconds);
}

/** Entrambe le stanze hanno un leader bloccato: i nomi diventano pubblici e si scelgono gli ostaggi. */
function completeLock(s: StanzeColBottoState, now: number): StanzeColBottoState {
  return enter({ ...s, revealedLeaders: [s.rooms[0].leader, s.rooms[1].leader], revealedRound: s.round }, "hostages", now, s.cfg.hostageSeconds);
}

/** Allo scadere del tempo di elezione, estrae a caso il leader delle stanze che ne sono senza. */
function drawLeaders(s: StanzeColBottoState, now: number): StanzeColBottoState {
  let next = s;
  for (const r of [0, 1] as RoomId[]) {
    if (next.rooms[r].leader) continue;
    const pool = playersIn(next, r);
    const pick = pool[Math.floor(rng(next, 200 + next.round * 2 + r)() * pool.length)];
    next = setRoom(next, r, { leader: pick ?? null, leaderLocked: true, leaderVotes: {}, abdicateOffer: null });
  }
  return completeLock(next, now);
}

function setLeader(s: StanzeColBottoState, r: RoomId, pid: string, now: number): StanzeColBottoState {
  const room = s.rooms[r];
  const locked = s.phase === "lock" || room.leaderLocked;
  const next = setRoom(s, r, { leader: pid, leaderVotes: {}, abdicateOffer: null, leaderLocked: locked, hostagePicks: room.hostagePicks.filter((p) => p !== pid) });
  return s.phase === "lock" && next.rooms.every((x) => x.leader) ? completeLock(next, now) : next;
}

/** Fine del round dopo lo scambio: round successivo, oppure previsione/rivelazione. */
function afterExchange(s: StanzeColBottoState, now: number): StanzeColBottoState {
  if (!lastRound(s)) return startRound(s, s.round + 1, now);
  const hasGambler = s.players.some((p) => s.cards[p]?.character === "gambler");
  return hasGambler ? enter(s, "gamble", now, s.cfg.gambleSeconds) : reveal(s, now);
}

function reveal(s: StanzeColBottoState, now: number): StanzeColBottoState {
  const president = s.players.find((p) => s.cards[p]?.character === "president")!;
  const bomber = s.players.find((p) => s.cards[p]?.character === "bomber")!;
  const sameRoom = s.room[president] === s.room[bomber];
  const outcome = sameRoom
    ? { winner: "red" as const, reason: "Il Presidente era nella stanza del Bombarolo: botto!", sameRoom }
    : { winner: "blue" as const, reason: "Il Presidente era lontano dal Bombarolo: nessun botto", sameRoom };
  return { ...enter(s, "reveal", now, null), outcome };
}

// ---- Abbinamento alle stanze ----

const capacity = (s: StanzeColBottoState) => Math.ceil(s.players.length / 2);

function randomPairing(s: StanzeColBottoState, salt: number): Record<string, RoomId> {
  const order = shuffle(s.players, rng(s, salt));
  return Object.fromEntries(order.map((p, i) => [p, (i < capacity(s) ? 0 : 1) as RoomId]));
}

/** Stanze come saranno distribuendo i non abbinati nella più vuota. */
function filledRooms(s: StanzeColBottoState): Record<string, RoomId> {
  const room = { ...s.room };
  const counts: [number, number] = [playersIn(s, 0).length, playersIn(s, 1).length];
  const missing = shuffle(
    s.players.filter((p) => room[p] === undefined),
    rng(s, 5),
  );
  for (const p of missing) {
    const r: RoomId = counts[0] <= counts[1] ? 0 : 1;
    room[p] = r;
    counts[r]++;
  }
  return room;
}

/** Le stanze sono bilanciate (al più un giocatore di differenza) una volta distribuiti i non abbinati. */
export function pairingBalanced(s: StanzeColBottoState): boolean {
  const room = filledRooms(s);
  const a = s.players.filter((p) => room[p] === 0).length;
  return Math.abs(a - (s.players.length - a)) <= 1;
}

function joinRoom(s: StanzeColBottoState, pid: string, code: string): StanzeColBottoState {
  if (s.phase !== "pairing" || s.assignment !== "qr") return s;
  const r = s.roomCodes.findIndex((c) => c === code.trim().toUpperCase());
  if (r < 0) return s;
  const target = r as RoomId;
  if (s.room[pid] === target) return s;
  if (playersIn(s, target).length >= capacity(s)) return { ...s, joinRefused: { ...s.joinRefused, [pid]: target } };
  const { [pid]: _gone, ...refused } = s.joinRefused;
  return { ...s, room: { ...s.room, [pid]: target }, joinRefused: refused };
}

/** Sposta un giocatore (regia): se era leader o aveva voti, la stanza ne tiene conto. */
function movePlayer(s: StanzeColBottoState, pid: string, to: RoomId): StanzeColBottoState {
  if (!s.players.includes(pid) || s.room[pid] === to) return s;
  const clean = (r: RoomState): RoomState => ({
    ...r,
    leader: r.leader === pid ? null : r.leader,
    leaderLocked: r.leader === pid ? false : r.leaderLocked,
    leaderVotes: Object.fromEntries(Object.entries(r.leaderVotes).filter(([v, c]) => v !== pid && c !== pid)),
    abdicateOffer: r.abdicateOffer && (r.abdicateOffer.to === pid || r.leader === pid) ? null : r.abdicateOffer,
    hostagePicks: r.hostagePicks.filter((p) => p !== pid),
  });
  const shares = s.shares.map((sh) => (sh.status === "pending" && (sh.from === pid || sh.to === pid) ? { ...sh, status: "expired" as const } : sh));
  const { [pid]: _gone, ...refused } = s.joinRefused;
  const scans = s.scans.filter((x) => x.from !== pid && x.to !== pid);
  return { ...s, room: { ...s.room, [pid]: to }, rooms: [clean(s.rooms[0]), clean(s.rooms[1])], shares, scans, joinRefused: refused };
}

// ---- Leader ----

const leaderLocked = (s: StanzeColBottoState, r: RoomId) => s.rooms[r].leaderLocked;

/** Il voto e la nomina sono ammessi nel round e, a fine round, nelle stanze ancora senza leader. */
function canElect(s: StanzeColBottoState, r: RoomId): boolean {
  if (s.pausedRemainingMs !== null) return false;
  if (s.phase === "round") return !leaderLocked(s, r);
  return s.phase === "lock" && s.rooms[r].leader === null;
}

export function voteCounts(s: StanzeColBottoState, r: RoomId): Record<string, number> {
  const tally: Record<string, number> = {};
  for (const c of Object.values(s.rooms[r].leaderVotes)) tally[c] = (tally[c] ?? 0) + 1;
  return tally;
}

function voteLeader(s: StanzeColBottoState, pid: string, target: string | null, now: number): StanzeColBottoState {
  const r = s.room[pid];
  if (r === undefined || !canElect(s, r)) return s;
  const votes = { ...s.rooms[r].leaderVotes };
  if (target === null) {
    if (votes[pid] === undefined) return s;
    delete votes[pid];
    return setRoom(s, r, { leaderVotes: votes });
  }
  if (s.room[target] !== r || votes[pid] === target) return s;
  votes[pid] = target;
  const next = setRoom(s, r, { leaderVotes: votes });
  const count = Object.values(votes).filter((c) => c === target).length;
  if (count * 2 > playersIn(s, r).length && s.rooms[r].leader !== target) return setLeader(next, r, target, now);
  return next;
}

function appoint(s: StanzeColBottoState, pid: string, target: string, now: number): StanzeColBottoState {
  const r = s.room[pid];
  if (r === undefined || pid === target || s.room[target] !== r || !canElect(s, r) || s.rooms[r].leader !== null) return s;
  return setLeader(s, r, target, now);
}

function abdicate(s: StanzeColBottoState, pid: string, target: string, at: number): StanzeColBottoState {
  const r = s.room[pid];
  if (r === undefined || s.phase !== "round" || s.pausedRemainingMs !== null) return s;
  const room = s.rooms[r];
  if (room.leader !== pid || room.leaderLocked || pid === target || s.room[target] !== r) return s;
  if (room.abdicatedThisRound.includes(pid)) return s;
  return setRoom(s, r, { abdicateOffer: { to: target, at } });
}

function answerAbdication(s: StanzeColBottoState, pid: string, accept: boolean, now: number): StanzeColBottoState {
  const r = s.room[pid];
  if (r === undefined) return s;
  const offer = s.rooms[r].abdicateOffer;
  if (!offer || offer.to !== pid || s.phase !== "round") return s;
  if (!accept) return setRoom(s, r, { abdicateOffer: null });
  const next = setLeader(s, r, pid, now);
  return setRoom(next, r, { abdicatedThisRound: [...s.rooms[r].abdicatedThisRound, pid] });
}

// ---- Ostaggi e scambio ----

function pickHostages(s: StanzeColBottoState, r: RoomId, ids: string[]): StanzeColBottoState {
  const room = s.rooms[r];
  if (room.hostagesConfirmed || !room.leader) return s;
  const unique = [...new Set(ids)];
  if (unique.length > hostagesNeeded(s) || unique.some((p) => s.room[p] !== r || p === room.leader)) return s;
  if (unique.length === room.hostagePicks.length && unique.every((p, i) => room.hostagePicks[i] === p)) return s;
  return setRoom(s, r, { hostagePicks: unique });
}

function confirmHostages(s: StanzeColBottoState, pid: string, now: number): StanzeColBottoState {
  const r = s.room[pid];
  if (r === undefined || s.phase !== "hostages" || s.pausedRemainingMs !== null) return s;
  const room = s.rooms[r];
  if (room.leader !== pid || room.hostagesConfirmed || room.hostagePicks.length !== hostagesNeeded(s)) return s;
  const next = setRoom(s, r, { hostagesConfirmed: true });
  return next.rooms.every((x) => x.hostagesConfirmed) ? doExchange(next, now) : next;
}

/** Il tempo per gli ostaggi è finito: il server completa a caso le scelte mancanti. */
function fillHostages(s: StanzeColBottoState): StanzeColBottoState {
  let next = s;
  for (const r of [0, 1] as RoomId[]) {
    const room = next.rooms[r];
    if (room.hostagesConfirmed) continue;
    const pool = shuffle(
      playersIn(next, r).filter((p) => p !== room.leader && !room.hostagePicks.includes(p)),
      rng(next, 300 + next.round * 2 + r),
    );
    const picks = [...room.hostagePicks, ...pool].slice(0, hostagesNeeded(next));
    next = setRoom(next, r, { hostagePicks: picks, hostagesConfirmed: true });
  }
  return next;
}

function doExchange(s: StanzeColBottoState, now: number): StanzeColBottoState {
  const moved: Exchange["moved"] = [
    ...s.rooms[0].hostagePicks.map((playerId) => ({ playerId, from: 0 as RoomId, to: 1 as RoomId })),
    ...s.rooms[1].hostagePicks.map((playerId) => ({ playerId, from: 1 as RoomId, to: 0 as RoomId })),
  ];
  const room = { ...s.room };
  for (const m of moved) room[m.playerId] = m.to;
  const shares = s.shares.map((sh) => (sh.status === "pending" ? { ...sh, status: "expired" as const } : sh));
  const next: StanzeColBottoState = { ...s, room, shares, exchanges: [...s.exchanges, { round: s.round, moved }] };
  return { ...enter(next, "exchange", now, s.cfg.startAfterExchangeSeconds), rooms: [{ ...next.rooms[0], leaderVotes: {} }, { ...next.rooms[1], leaderVotes: {} }] };
}

function pressStart(s: StanzeColBottoState, pid: string, at: number): StanzeColBottoState {
  if (s.phase !== "exchange" || s.pausedRemainingMs !== null || s.phaseEndsAt === null || at >= s.phaseEndsAt) return s;
  const r = s.room[pid];
  if (r === undefined || s.rooms[r].leader !== pid || s.rooms[r].startPressedAt !== null) return s;
  const next = setRoom(s, r, { startPressedAt: at });
  if (next.rooms.every((x) => x.startPressedAt !== null)) return afterExchange(next, at);
  return { ...next, phaseEndsAt: Math.min(s.phaseEndsAt, at + s.cfg.startAfterFirstSeconds * 1000) };
}

// ---- Condivisioni e rivelazioni ----

const hasPending = (s: StanzeColBottoState, pid: string) => s.shares.some((sh) => sh.status === "pending" && (sh.from === pid || sh.to === pid));
const allowedKind = (s: StanzeColBottoState, kind: "card" | "color") => kind === "card" || colorAllowed(s.cfg, s.players.length);

function canInteract(s: StanzeColBottoState, pid: string): boolean {
  return s.phase === "round" && s.pausedRemainingMs === null && s.room[pid] !== undefined && s.cards[pid] !== undefined;
}

function addShare(s: StanzeColBottoState, share: Omit<Share, "seq">): StanzeColBottoState {
  return { ...s, shares: [...s.shares, { ...share, seq: s.nextSeq }], nextSeq: s.nextSeq + 1 };
}

/** Dall'app (tocca un nome): «Mostra», «Mostra a tutti» e «Scambia». Con «Solo con i QR» nessuna informazione passa di qui. */
const appSwap = (s: StanzeColBottoState) => s.cfg.shareMethod !== "qr";
const qrSwap = (s: StanzeColBottoState) => s.cfg.shareMethod !== "app";

/** Un codice di 6 caratteri a testa, tutti diversi: derivano dal seme e dall'epoca, quindi sono deterministici. */
function makeCodes(s: StanzeColBottoState, epoch: number): Record<string, string> {
  const next = rng(s, 1000 + epoch);
  const used = new Set<string>();
  const codes: Record<string, string> = {};
  for (const p of s.players) {
    let code: string;
    do code = Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(next() * CODE_ALPHABET.length)]).join("");
    while (used.has(code));
    used.add(code);
    codes[p] = code;
  }
  return codes;
}

/** Durante il round i QR personali ruotano ogni `QR_TTL_MS`; le scansioni rimaste senza risposta decadono. */
function rotateCodes(s: StanzeColBottoState, now: number): StanzeColBottoState {
  if (!qrSwap(s) || s.phase !== "round" || s.pausedRemainingMs !== null) return s;
  const scans = s.scans.filter((x) => now - x.at < SCAN_MS);
  const stale = now - s.qrAt >= QR_TTL_MS;
  if (!stale && scans.length === s.scans.length) return s;
  if (!stale) return { ...s, scans };
  return { ...s, scans, qrPrev: s.qrCodes, qrCodes: makeCodes(s, s.qrEpoch + 1), qrEpoch: s.qrEpoch + 1, qrAt: now };
}

/**
 * Scambio con i QR: ognuno inquadra il QR dell'altro. La prima scansione si ricorda soltanto; quando arriva quella
 * nel verso opposto (entro `SCAN_MS`) lo scambio avviene come un «Scambia» accettato. Se uno dei due ha scelto il solo
 * colore, si scambia il colore.
 */
function scanPeer(s: StanzeColBottoState, pid: string, code: string, kind: "card" | "color", at: number): StanzeColBottoState {
  if (!qrSwap(s) || !canInteract(s, pid) || !allowedKind(s, kind)) return s;
  const wanted = code.trim().toUpperCase();
  const target = s.players.find((p) => p !== pid && (s.qrCodes[p] === wanted || s.qrPrev[p] === wanted));
  if (!target || s.room[target] !== s.room[pid] || s.cards[target] === undefined) return s;
  const open = s.scans.filter((x) => at - x.at < SCAN_MS && x.from !== pid);
  const back = open.find((x) => x.from === target && x.to === pid);
  if (!back) return { ...s, scans: [...open, { from: pid, to: target, kind, at }] };
  const shareKind: ShareKind = kind === "color" || back.kind === "color" ? "color-share" : "card-share";
  return addShare({ ...s, scans: open.filter((x) => x !== back) }, { kind: shareKind, from: target, to: pid, audience: [target, pid], room: s.room[pid]!, round: s.round, at, status: "accepted" });
}

function offerShare(s: StanzeColBottoState, pid: string, kind: "card" | "color", target: string, at: number): StanzeColBottoState {
  if (!appSwap(s) || !canInteract(s, pid) || pid === target || s.room[target] !== s.room[pid] || !allowedKind(s, kind)) return s;
  if (hasPending(s, pid) || hasPending(s, target)) return s;
  return addShare(s, { kind: kind === "card" ? "card-share" : "color-share", from: pid, to: target, audience: [pid, target], room: s.room[pid]!, round: s.round, at, status: "pending" });
}

function answerShare(s: StanzeColBottoState, pid: string, seq: number, accept: boolean): StanzeColBottoState {
  const sh = s.shares.find((x) => x.seq === seq);
  if (!sh || sh.status !== "pending" || sh.to !== pid || !canInteract(s, pid)) return s;
  const status = accept && s.room[sh.from] === s.room[pid] ? "accepted" : accept ? "expired" : "declined";
  return { ...s, shares: s.shares.map((x) => (x.seq === seq ? { ...x, status } : x)) };
}

function revealCard(s: StanzeColBottoState, pid: string, kind: "card" | "color", target: string | null, at: number): StanzeColBottoState {
  if (!appSwap(s) || !canInteract(s, pid) || !allowedKind(s, kind)) return s;
  const r = s.room[pid]!;
  let audience: string[];
  if (target === null) audience = playersIn(s, r).filter((p) => p !== pid);
  else if (target === pid || s.room[target] !== r) return s;
  else audience = [target];
  if (audience.length === 0) return s;
  const shareKind: ShareKind = target === null ? (kind === "card" ? "public-card" : "public-color") : kind === "card" ? "card-reveal" : "color-reveal";
  return addShare(s, { kind: shareKind, from: pid, to: target, audience, room: r, round: s.round, at, status: "accepted" });
}

function expireOffers(s: StanzeColBottoState, now: number): StanzeColBottoState {
  let changed = false;
  const shares = s.shares.map((sh) => {
    if (sh.status === "pending" && now - sh.at >= OFFER_MS) {
      changed = true;
      return { ...sh, status: "expired" as const };
    }
    return sh;
  });
  let next: StanzeColBottoState = changed ? { ...s, shares } : s;
  for (const r of [0, 1] as RoomId[]) {
    const offer = next.rooms[r].abdicateOffer;
    if (offer && now - offer.at >= OFFER_MS) next = setRoom(next, r, { abdicateOffer: null });
  }
  return next;
}

// ---- Tempo ----

function expire(s: StanzeColBottoState, now: number): StanzeColBottoState {
  switch (s.phase) {
    case "round":
      return enterLock(s, now);
    case "lock":
      return drawLeaders(s, now);
    case "hostages":
      return doExchange(fillHostages(s), now);
    case "exchange":
      return afterExchange(s, now);
    case "gamble":
      return reveal(s, now);
    default:
      return s;
  }
}

// ---- Viste ----

const person = (s: StanzeColBottoState, pid: string | null) => (pid ? { id: pid, nickname: nick(s, pid) } : null);

/** Parte pubblica, uguale per tutti: stanze, tempi, leader già rivelati, scambi e nulla di segreto. */
function publicView(s: StanzeColBottoState) {
  const last = s.exchanges.at(-1);
  const inExchange = s.phase === "exchange";
  return {
    phase: s.phase,
    phaseStartedAt: s.phaseStartedAt,
    phaseEndsAt: s.phaseEndsAt,
    pausedRemainingMs: s.pausedRemainingMs,
    roomNames: roomNamesOf(s.cfg),
    round: s.round,
    roundCount: s.rounds.length,
    roundSeconds: s.rounds[s.round]?.seconds ?? 0,
    hostages: s.rounds[s.round]?.hostages ?? 0,
    hostagesNeeded: hostagesNeeded(s),
    rooms: ([0, 1] as RoomId[]).map((r) => playersIn(s, r).map((p) => person(s, p)!)),
    unassigned: s.phase === "pairing" ? s.players.filter((p) => s.room[p] === undefined).map((p) => person(s, p)!) : [],
    leaders: [person(s, s.revealedLeaders[0]), person(s, s.revealedLeaders[1])],
    /** Falso nei round successivi al primo finché non c'è un nuovo blocco: lo schermo scrive «Leader al round precedente». */
    leadersFresh: s.revealedRound === s.round,
    locked: [s.rooms[0].leaderLocked, s.rooms[1].leaderLocked],
    hostagesConfirmed: s.phase === "hostages" ? [s.rooms[0].hostagesConfirmed, s.rooms[1].hostagesConfirmed] : [false, false],
    startPressed: inExchange ? [s.rooms[0].startPressedAt !== null, s.rooms[1].startPressedAt !== null] : [false, false],
    exchange: last && (inExchange || s.phase === "round") && last.round === (inExchange ? s.round : s.round - 1)
      ? { round: last.round, moved: last.moved.map((m) => ({ ...person(s, m.playerId)!, from: m.from, to: m.to })) }
      : null,
    hostSeesCards: s.blindBroken && !s.blind,
    ...(s.phase === "pairing" && { pairing: { mode: s.assignment, codes: s.assignment === "qr" ? s.roomCodes : null, capacity: capacity(s) } }),
  };
}

const colorOnly = (card: Card): { team: Team } => ({ team: card.team });

const revealedCards = (s: StanzeColBottoState) =>
  s.players.map((p) => ({ id: p, nickname: nick(s, p), room: s.room[p] ?? null, card: s.cards[p]! }));

/** Regole di questa partita per la pagina «Regole» del telefono (tutto pubblico). */
export interface RulesInfo {
  players: number;
  rounds: { seconds: number; hostages: number }[];
  colorAllowed: boolean;
  shareMethod: ShareMethod;
  startAfterFirstSeconds: number;
  startAfterExchangeSeconds: number;
}

const rulesOf = (s: StanzeColBottoState): RulesInfo => ({
  players: s.players.length,
  rounds: s.rounds,
  colorAllowed: colorAllowed(s.cfg, s.players.length),
  shareMethod: s.cfg.shareMethod,
  startAfterFirstSeconds: s.cfg.startAfterFirstSeconds,
  startAfterExchangeSeconds: s.cfg.startAfterExchangeSeconds,
});

export const stanzeColBotto: MinigameType<StanzeColBottoConfig, StanzeColBottoState, Input, Command> = {
  id: "stanze-col-botto",
  title: "Stanze col botto",
  defaultTheme: "boom",
  configSchema: stanzeColBottoConfigSchema as unknown as z.ZodType<StanzeColBottoConfig>,
  inputSchema,
  commandSchema,
  minPlayers: 6,
  maxPlayers: 30,
  sampleConfig: {
    firstRoomName: "Salotto",
    secondRoomName: "Cucina",
    roomAssignment: "random",
    roundMode: "base",
    customRounds: [],
    colorShare: "auto",
    shareMethod: "app",
    lockSeconds: 20,
    hostageSeconds: 20,
    startAfterFirstSeconds: 5,
    startAfterExchangeSeconds: 15,
    gambleSeconds: 20,
    winPoints: 100,
    gamblerPoints: 100,
  },

  init(config, ctx, now) {
    const players = ctx.players.map((p) => p.id);
    const codeRng = makeRng(deriveSeed(ctx.seed, 4));
    const code = () => Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(codeRng() * CODE_ALPHABET.length)]).join("");
    const emptyRoom: RoomState = { leader: null, leaderLocked: false, leaderVotes: {}, abdicateOffer: null, abdicatedThisRound: [], hostagePicks: [], hostagesConfirmed: false, startPressedAt: null };
    const base: StanzeColBottoState = {
      cfg: config,
      seed: ctx.seed,
      participants: ctx.players,
      players,
      phase: "pairing",
      round: 0,
      rounds: roundTable(config, players.length),
      cards: {},
      room: {},
      rooms: [emptyRoom, emptyRoom],
      assignment: config.roomAssignment,
      roomCodes: [code(), code()],
      joinRefused: {},
      shuffles: 0,
      revealedLeaders: [null, null],
      revealedRound: null,
      exchanges: [],
      shares: [],
      nextSeq: 1,
      qrCodes: {},
      qrPrev: {},
      qrEpoch: 0,
      qrAt: now,
      scans: [],
      phaseStartedAt: now,
      phaseEndsAt: null,
      pausedRemainingMs: null,
      gamblerGuess: null,
      blind: false,
      blindBroken: false,
      outcome: null,
    };
    const withCodes = config.shareMethod === "app" ? base : { ...base, qrCodes: makeCodes(base, 0) };
    return config.roomAssignment === "random" ? { ...withCodes, room: randomPairing(withCodes, 3) } : withCodes;
  },

  onInput(state, playerId, input, meta) {
    if (!state.players.includes(playerId)) return state;
    const at = meta.receivedAt;
    const room = state.room[playerId];
    const inGrace = state.phase === "round" && state.phaseEndsAt !== null && at < state.phaseEndsAt + GRACE_MS;
    const roundOpen = state.phase === "round" && (state.phaseEndsAt === null || at < state.phaseEndsAt || inGrace);
    switch (input.type) {
      case "join-room":
        return joinRoom(state, playerId, input.code);
      case "appoint":
        return appoint(state, playerId, input.targetId, at);
      case "vote-leader":
        return state.phase === "round" && !roundOpen ? state : voteLeader(state, playerId, input.targetId, at);
      case "abdicate":
        return roundOpen ? abdicate(state, playerId, input.targetId, at) : state;
      case "abdicate-answer":
        return answerAbdication(state, playerId, input.accept, at);
      case "pick-hostages": {
        if (room === undefined || state.rooms[room].leader !== playerId) return state;
        if (!(state.phase === "round" ? roundOpen : state.phase === "lock" || state.phase === "hostages")) return state;
        return pickHostages(state, room, input.playerIds);
      }
      case "confirm-hostages":
        return confirmHostages(state, playerId, at);
      case "start-round":
        return pressStart(state, playerId, at);
      case "share-offer":
        return roundOpen ? offerShare(state, playerId, input.kind, input.targetId, at) : state;
      case "share-answer":
        return answerShare(state, playerId, input.seq, input.accept);
      case "scan-peer":
        return roundOpen ? scanPeer(state, playerId, input.code, input.kind, at) : state;
      case "reveal":
        return roundOpen ? revealCard(state, playerId, input.kind, input.targetId, at) : state;
      case "gamble": {
        if (state.phase !== "gamble" || state.pausedRemainingMs !== null || state.cards[playerId]?.character !== "gambler") return state;
        return reveal({ ...state, gamblerGuess: input.team }, at);
      }
    }
  },

  onTick(state, now) {
    const s = rotateCodes(expireOffers(state, now), now);
    if (s.pausedRemainingMs !== null || s.phaseEndsAt === null || now < s.phaseEndsAt) return s;
    return expire(s, now);
  },

  onHostCommand(state, command, now) {
    switch (command.type) {
      case "deal": {
        if (state.phase !== "pairing" || !pairingBalanced(state)) return state;
        const room = filledRooms(state);
        const cards = dealCards(state.players, rng(state, 2));
        return { ...enter({ ...state, room, cards, joinRefused: {} }, "deal", now, null) };
      }
      case "shuffle-rooms":
        return state.phase === "pairing" ? { ...state, shuffles: state.shuffles + 1, room: randomPairing(state, 100 + state.shuffles + 1), joinRefused: {} } : state;
      case "set-assignment": {
        if (state.phase !== "pairing" || state.assignment === command.mode) return state;
        const next = { ...state, assignment: command.mode };
        return command.mode === "random" ? { ...next, room: randomPairing(next, 100 + state.shuffles + 1), shuffles: state.shuffles + 1 } : next;
      }
      case "move-player":
        return movePlayer(state, command.playerId, command.room);
      case "set-leader": {
        if (!dealt(state) || state.phase === "done" || state.phase === "reveal" || state.room[command.playerId] !== command.room) return state;
        return state.rooms[command.room].leader === command.playerId ? state : setLeader(state, command.room, command.playerId, now);
      }
      case "set-hostages": {
        if (state.blind || !["round", "lock", "hostages"].includes(state.phase)) return state;
        return pickHostages(state, command.room, command.playerIds);
      }
      case "set-blind": {
        if (state.blind === command.blind) return state;
        return { ...state, blind: command.blind, blindBroken: state.blindBroken || (!command.blind && dealt(state)) };
      }
      case "start-round": {
        if (state.phase === "deal") return startRound(state, 0, now);
        return state.phase === "exchange" ? afterExchange(state, now) : state;
      }
      case "end-round":
        return state.phase === "round" ? enterLock(state, now) : state;
      case "pause":
        if (!TIMED.includes(state.phase) || state.pausedRemainingMs !== null || state.phaseEndsAt === null) return state;
        return { ...state, pausedRemainingMs: Math.max(0, state.phaseEndsAt - now), phaseEndsAt: null };
      case "resume":
        return state.pausedRemainingMs === null ? state : { ...state, phaseEndsAt: now + state.pausedRemainingMs, pausedRemainingMs: null };
      case "next":
        return state.phase === "reveal" ? enter(state, "done", now, null) : state;
    }
  },

  isFinished: (state) => state.phase === "done",
  scores: (state) => scoresOf(state),
  result(state) {
    const totals: Record<string, number> = {};
    for (const d of scoresOf(state)) if (d.playerId) totals[d.playerId] = d.points;
    return rankByPoints(totals, state.players);
  },

  screenView(state) {
    const over = state.phase === "reveal" || state.phase === "done";
    return {
      ...publicView(state),
      ...(over && { cards: revealedCards(state), outcome: state.outcome, gamblerGuess: state.gamblerGuess }),
    };
  },

  viewFor(state, playerId) {
    const over = state.phase === "reveal" || state.phase === "done";
    const r = state.room[playerId];
    const card = state.cards[playerId];
    if (!state.players.includes(playerId)) {
      return { ...publicView(state), me: null, rules: rulesOf(state), ...(over && { cards: revealedCards(state), outcome: state.outcome, gamblerGuess: state.gamblerGuess }) };
    }
    if (r === undefined) {
      // Non ancora abbinato (fase `pairing`): sceglie la stanza dal telefono, senza carta.
      return { ...publicView(state), rules: rulesOf(state), me: { id: playerId, room: null, card: null, joinRefused: state.joinRefused[playerId] ?? null } };
    }
    const room = state.rooms[r];
    const known = knownBy(state, playerId).map((k) => {
      const c = state.cards[k.playerId]!;
      return { playerId: k.playerId, nickname: nick(state, k.playerId), seq: k.seq, level: k.level, card: k.level === "card" ? c : colorOnly(c) };
    });
    const exchange = state.exchanges.at(-1);
    const travel = state.phase === "exchange" && exchange ? exchange.moved.find((m) => m.playerId === playerId) : undefined;
    const incoming = state.shares.filter((sh) => sh.status === "pending" && sh.to === playerId);
    const outgoing = state.shares.find((sh) => sh.status === "pending" && sh.from === playerId);
    const inElection = canElect(state, r);
    const swapNow = qrSwap(state) && canInteract(state, playerId);
    const scanOut = state.scans.find((x) => x.from === playerId);
    return {
      ...publicView(state),
      rules: rulesOf(state),
      me: {
        id: playerId,
        room: r,
        card: card ?? null,
        // Il leader della propria stanza è sempre visibile, quello dell'altra solo se già rivelato (sopra, in `leaders`).
        leader: person(state, room.leader),
        isLeader: room.leader === playerId,
        leaderLocked: room.leaderLocked,
        canVote: inElection,
        canAppoint: inElection && room.leader === null,
        myVote: room.leaderVotes[playerId] ?? null,
        votes: voteCounts(state, r),
        abdicateTo: room.leader === playerId ? person(state, room.abdicateOffer?.to ?? null) : null,
        abdicationFrom: room.abdicateOffer?.to === playerId ? person(state, room.leader) : null,
        canAbdicate: room.leader === playerId && state.phase === "round" && !room.abdicatedThisRound.includes(playerId),
        hostagePicks: room.hostagePicks,
        hostagesConfirmed: room.hostagesConfirmed,
        canPickHostages: room.leader === playerId && !room.hostagesConfirmed && (state.phase === "round" || state.phase === "lock" || state.phase === "hostages"),
        canConfirmHostages: room.leader === playerId && state.phase === "hostages" && !room.hostagesConfirmed && room.hostagePicks.length === hostagesNeeded(state),
        canStart: room.leader === playerId && state.phase === "exchange" && room.startPressedAt === null,
        travel: travel ? { from: travel.from, to: travel.to } : null,
        canShare: canInteract(state, playerId),
        colorAllowed: colorAllowed(state.cfg, state.players.length),
        appSwap: appSwap(state),
        // Il QR personale è solo nella vista del suo proprietario: schermo, regia e altri telefoni non lo ricevono mai.
        qrSwap: swapNow,
        qrCode: swapNow ? (state.qrCodes[playerId] ?? null) : null,
        scanOut: swapNow && scanOut ? { to: person(state, scanOut.to)!, kind: scanOut.kind } : null,
        scanIn: swapNow ? state.scans.filter((x) => x.to === playerId).map((x) => person(state, x.from)!) : [],
        incoming: incoming.map((sh) => ({ seq: sh.seq, kind: sh.kind === "card-share" ? "card" : "color", from: person(state, sh.from)!, at: sh.at })),
        outgoing: outgoing ? { seq: outgoing.seq, kind: outgoing.kind === "card-share" ? "card" : "color", to: person(state, outgoing.to)!, at: outgoing.at } : null,
        known,
        canGamble: state.phase === "gamble" && card?.character === "gambler",
        myGuess: card?.character === "gambler" ? state.gamblerGuess : null,
        joinRefused: state.joinRefused[playerId] ?? null,
      },
      ...(over && { cards: revealedCards(state), outcome: state.outcome, gamblerGuess: state.gamblerGuess }),
    };
  },

  hostView(state) {
    const timed = TIMED.includes(state.phase);
    const base = {
      phase: state.phase,
      blind: state.blind,
      assignment: state.assignment,
      round: state.round,
      roundCount: state.rounds.length,
      roomNames: roomNamesOf(state.cfg),
      balanced: state.phase === "pairing" ? pairingBalanced(state) : true,
      players: state.players.map((p) => ({ id: p, nickname: nick(state, p), room: state.room[p] ?? null })),
      leaders: ([0, 1] as RoomId[]).map((r) => ({ revealed: person(state, state.revealedLeaders[r]), locked: state.rooms[r].leaderLocked, confirmed: state.rooms[r].hostagesConfirmed })),
      startPressed: [state.rooms[0].startPressedAt !== null, state.rooms[1].startPressedAt !== null],
      hostagesNeeded: hostagesNeeded(state),
      ...(state.outcome && { outcome: state.outcome }),
    };
    // In modalità cieca la regia vede solo ciò che vede lo schermo comune (§6): niente carte, voti, condivisioni, scelte degli ostaggi.
    const secret = state.blind
      ? {}
      : {
          cards: state.cards,
          rooms: ([0, 1] as RoomId[]).map((r) => ({ leader: person(state, state.rooms[r].leader), votes: state.rooms[r].leaderVotes, picks: state.rooms[r].hostagePicks })),
          shares: state.shares.map((sh) => ({ ...sh, fromNickname: nick(state, sh.from), toNickname: sh.to ? nick(state, sh.to) : null })),
        };
    return {
      info: { ...base, ...secret },
      actions: [
        { id: "deal", label: "Distribuisci le carte", enabled: state.phase === "pairing" && pairingBalanced(state) },
        { id: "shuffle-rooms", label: "Rimescola le stanze", enabled: state.phase === "pairing" },
        { id: "start-round", label: state.phase === "exchange" ? "Avvia il prossimo round" : "Avvia il round", enabled: state.phase === "deal" || state.phase === "exchange" },
        { id: "end-round", label: "Chiudi il round", enabled: state.phase === "round", danger: true },
        { id: "next", label: "Avanti", enabled: state.phase === "reveal" },
        state.pausedRemainingMs !== null
          ? { id: "resume", label: "Riprendi", enabled: true }
          : { id: "pause", label: "Pausa", enabled: timed && state.phaseEndsAt !== null },
      ],
    };
  },
};

function scoresOf(s: StanzeColBottoState): ScoreDelta[] {
  if (!s.outcome) return [];
  const out: ScoreDelta[] = [];
  for (const p of s.players) {
    const card = s.cards[p]!;
    if (card.team === s.outcome.winner && s.cfg.winPoints) out.push({ playerId: p, teamId: null, points: s.cfg.winPoints, reason: "Stanze col botto" });
    else if (card.character === "gambler" && s.gamblerGuess === s.outcome.winner && s.cfg.gamblerPoints) {
      out.push({ playerId: p, teamId: null, points: s.cfg.gamblerPoints, reason: "Stanze col botto: previsione azzeccata" });
    }
  }
  return out;
}
