import { z } from "zod";
import type { MinigameType, ParticipantInfo, RoundMessage } from "@gioco/shared";
import { makeRng, shuffle } from "../knight-duel/rng.js";
import { rankByPoints } from "../util.js";
import { type StanzeConfig, SAMPLE_CONFIG, stanzeConfigSchema } from "./config.js";
import { MAX_TIMERS, type TimerState, elapsedMs, formatDuration, lapsAt, newTimer, pauseTimer, resetTimer, startTimer } from "./timers.js";
import { type CellId, DIRS, type Dir, directionBetween, findWordPath, isCell, neighbor } from "./map.js";

/**
 * Stanze Segrete: gioco di ruolo con un Game Master (una persona, non il software).
 * I giocatori sono chiusi in un complesso di stanze a griglia, ognuna con una lettera nascosta. Il GM decide dove
 * stanno, cosa possono fare (capacità accese e spente al volo), chi può vedere le lettere e per quanto tempo, approva
 * ogni spostamento, manda messaggi segreti ed eventi da accettare. Il software fa da tavolo e da messaggero.
 */

export { SAMPLE_CONFIG, stanzeConfigSchema, type StanzeConfig } from "./config.js";
export * from "./map.js";
export * from "./timers.js";

export const MAX_PLAYERS = 10;
/** Messaggi tenuti nello stato (viste e snapshot leggeri); il database li tiene tutti. */
const KEEP_MESSAGES = 300;
const KEEP_LOG = 200;
const HOST_MESSAGES = 120;
const HOST_LOG = 60;

export type PlayerId = string;
export type Action = "move" | "peek" | "sight" | "message" | "guess" | `custom:${string}`;
export type Outcome = "in-gioco" | "fuggito" | "eliminato";

export interface Grant {
  id: string;
  playerId: PlayerId;
  action: Action;
  /** Solo per «sight»: quale lettera può guardare. */
  sightScope?: "own-room" | CellId;
  /** Solo per «move» e «peek»: le direzioni lasciate aperte. */
  directions?: Dir[];
  usesLeft: number | null;
  expiresAt: number | null;
}

export interface Sighting {
  playerId: PlayerId;
  cellId: CellId;
  until: number;
}

export interface Request {
  id: number;
  playerId: PlayerId;
  kind: "move" | "peek" | "custom" | "guess";
  direction?: Dir;
  actionId?: string;
  word?: string;
  at: number;
}

export interface Message {
  id: number;
  from: "master" | PlayerId;
  toKind: "master" | "player" | "room" | "all";
  toPlayer: PlayerId | null;
  toCell: CellId | null;
  /** Chi riceve il messaggio del GM (fissato all'invio). Vuoto per i messaggi dei giocatori. */
  recipients: PlayerId[];
  text: string;
  at: number;
  /** Letture dei destinatari (messaggi del GM). */
  readBy: Record<PlayerId, number>;
  /** Lettura da parte del GM (messaggi dei giocatori). */
  masterReadAt: number | null;
  replyTo: number | null;
  allowReply: boolean;
  maxReplies: number;
  replies: Record<PlayerId, number>;
}

export interface GameEvent {
  id: number;
  text: string;
  at: number;
  to: "all" | PlayerId[];
  /** Destinatari fissati all'invio → istante di accettazione. */
  accepted: Record<PlayerId, number | null>;
  cancelled: boolean;
}

export interface Feedback {
  kind: "approved" | "refused" | "cancelled" | "letter" | "solved";
  cell: CellId | null;
  at: number;
}

/** Un oggetto nel complesso: i giocatori della stanza sanno che esiste solo se `enabled`, e cos'è solo i `revealedTo`. */
/** Definizione di un oggetto: dalla configurazione, oppure aggiunto dal Master durante la partita. `ref` è il riferimento numerico che vedono i telefoni (mai l'id). */
export interface ItemDef {
  id: string;
  ref: number;
  name: string;
  icon: string;
  text: string;
  note: string;
}

export interface ItemState {
  id: string;
  cell: CellId | null;
  enabled: boolean;
  revealedTo: PlayerId[];
}

/** Oggetto come lo vede un giocatore: sconosciuto, oppure con nome, icona e testo se il Master glielo ha palesato. */
export type PhoneItem = { ref: number; known: false } | { ref: number; known: true; name: string; icon: string; text: string };

export interface LogEntry {
  at: number;
  text: string;
}

export interface StanzeState {
  cfg: StanzeConfig;
  seed: number;
  phase: "setup" | "play" | "reveal" | "done";
  roster: ParticipantInfo[];
  positions: Record<PlayerId, CellId | null>;
  outcome: Record<PlayerId, Outcome>;
  solved: Record<PlayerId, boolean>;
  grants: Grant[];
  closedDoors: { a: CellId; b: CellId }[];
  itemDefs: ItemDef[];
  items: ItemState[];
  nextItemRef: number;
  /** Cronometri del GM (il primo è il tempo di gioco, che parte con «Inizia»). Mai visibili a schermo e telefoni. */
  timers: TimerState[];
  nextTimerId: number;
  sightings: Sighting[];
  requests: Request[];
  messages: Message[];
  events: GameEvent[];
  /** Contatore unico per messaggi ed eventi. */
  nextMessageId: number;
  nextRequestId: number;
  nextGrantId: number;
  lastMessageAt: Record<PlayerId, number>;
  feedback: Record<PlayerId, Feedback>;
  log: LogEntry[];
  publicReveal: boolean;
  /** La mappa (griglia e posizioni) è visibile a schermo e telefoni: di default no, la mostra il GM quando vuole. */
  mapShown: boolean;
}

// ---- Schemi ----

const dirSchema = z.enum(["up", "down", "left", "right"]);
const text = (max = 1000) => z.string().trim().min(1).max(max);
const actionSchema = z.string().regex(/^(move|peek|sight|message|guess|custom:[a-z0-9-]{1,20})$/);
const targetSchema = z.union([
  z.literal("all"),
  z.object({ players: z.array(z.string().min(1)).min(1).max(30) }),
  z.object({ cell: z.number().int().min(0).max(24) }),
]);
type Target = z.infer<typeof targetSchema>;
const cellSchema = z.number().int().min(0).max(24);

const inputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move"), direction: dirSchema }),
  z.object({ type: z.literal("peek"), direction: dirSchema }),
  z.object({ type: z.literal("sight") }),
  z.object({ type: z.literal("message"), text: text() }),
  z.object({ type: z.literal("guess"), word: text(24) }),
  z.object({ type: z.literal("custom"), actionId: z.string().min(1).max(20) }),
  z.object({ type: z.literal("reply"), messageId: z.number().int(), text: text() }),
  z.object({ type: z.literal("cancel"), requestId: z.number().int() }),
  z.object({ type: z.literal("ack"), messageId: z.number().int() }),
  z.object({ type: z.literal("accept-event"), eventId: z.number().int() }),
]);

const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("place"), playerId: z.string().min(1), cellId: cellSchema.nullable() }),
  z.object({ type: z.literal("place-all"), cellId: cellSchema }),
  z.object({ type: z.literal("place-spread") }),
  z.object({
    type: z.literal("grant"),
    target: targetSchema,
    action: actionSchema,
    sightScope: z.union([z.literal("own-room"), cellSchema]).optional(),
    directions: z.array(dirSchema).max(4).optional(),
    durationSec: z.number().int().min(1).max(86_400).optional(),
    uses: z.number().int().min(1).max(999).optional(),
  }),
  z.object({ type: z.literal("revoke"), grantId: z.string().optional(), target: targetSchema.optional(), action: actionSchema.optional() }),
  z.object({ type: z.literal("set-directions"), grantId: z.string().min(1), directions: z.array(dirSchema).max(4) }),
  z.object({ type: z.literal("door"), a: cellSchema, b: cellSchema, open: z.boolean() }),
  z.object({ type: z.literal("show-letter"), target: targetSchema, cellId: cellSchema, seconds: z.number().int().min(1).max(300) }),
  z.object({
    type: z.literal("resolve"),
    requestId: z.number().int(),
    approve: z.boolean(),
    showLetterSec: z.number().int().min(1).max(300).optional(),
    reply: text().optional(),
  }),
  z.object({ type: z.literal("resolve-all-moves"), approve: z.boolean() }),
  z.object({
    type: z.literal("message"),
    to: z.union([z.literal("all"), z.object({ player: z.string().min(1) }), z.object({ cell: cellSchema })]),
    text: text(),
    allowReply: z.boolean().optional(),
    maxReplies: z.number().int().min(1).max(20).optional(),
  }),
  z.object({ type: z.literal("close-reply"), messageId: z.number().int() }),
  z.object({ type: z.literal("read"), messageId: z.number().int() }),
  z.object({ type: z.literal("event"), to: z.union([z.literal("all"), z.array(z.string().min(1)).min(1).max(30)]), text: text() }),
  z.object({ type: z.literal("cancel-event"), eventId: z.number().int() }),
  z.object({ type: z.literal("set-outcome"), playerId: z.string().min(1), outcome: z.enum(["in-gioco", "fuggito", "eliminato"]) }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("item-add"), name: text(30), icon: z.string().trim().min(1).max(8).optional(), text: z.string().trim().max(600).optional(), note: z.string().trim().max(400).optional(), cellId: cellSchema.nullable().optional(), enabled: z.boolean().optional() }),
  z.object({ type: z.literal("item-remove"), itemId: z.string().min(1) }),
  z.object({ type: z.literal("place-item"), itemId: z.string().min(1), cellId: cellSchema.nullable() }),
  z.object({ type: z.literal("enable-item"), itemId: z.string().min(1), enabled: z.boolean() }),
  z.object({ type: z.literal("reveal-item"), itemId: z.string().min(1), to: z.union([z.literal("room"), z.object({ players: z.array(z.string().min(1)).min(1).max(30) })]) }),
  z.object({ type: z.literal("conceal-item"), itemId: z.string().min(1) }),
  z.object({ type: z.literal("timer-add"), label: text(30), intervalSec: z.number().int().min(5).max(86_400).optional() }),
  z.object({ type: z.literal("timer-start"), timerId: z.string().min(1) }),
  z.object({ type: z.literal("timer-pause"), timerId: z.string().min(1) }),
  z.object({ type: z.literal("timer-reset"), timerId: z.string().min(1) }),
  z.object({ type: z.literal("timer-remove"), timerId: z.string().min(1) }),
  z.object({ type: z.literal("show-map"), visible: z.boolean() }),
  z.object({ type: z.literal("public-reveal") }),
  z.object({ type: z.literal("end") }),
]);

export type Input = z.infer<typeof inputSchema>;
export type Command = z.infer<typeof commandSchema>;

// ---- Aiuti ----

const grid = (s: StanzeState) => ({ rows: s.cfg.rows, cols: s.cfg.cols });
const cells = (s: StanzeState) => s.cfg.rows * s.cfg.cols;
const letterOf = (s: StanzeState, c: CellId) => s.cfg.rooms[c]?.letter ?? "?";
const nick = (s: StanzeState, id: string) => s.roster.find((p) => p.id === id)?.nickname ?? "?";
const inRoster = (s: StanzeState, id: string) => s.roster.some((p) => p.id === id);
const unplaced = (s: StanzeState) => s.roster.filter((p) => s.positions[p.id] === null || s.positions[p.id] === undefined);
const roomName = (c: CellId) => `Stanza ${c + 1}`;
const doorKey = (a: CellId, b: CellId) => (a < b ? { a, b } : { a: b, b: a });
const isClosed = (s: StanzeState, a: CellId, b: CellId) => s.closedDoors.some((d) => d.a === Math.min(a, b) && d.b === Math.max(a, b));
const defOf = (s: StanzeState, id: string): ItemDef => s.itemDefs.find((d) => d.id === id)!;
export const MAX_ITEMS = 30;
const normWord = (w: string) => w.trim().toUpperCase().replace(/\s+/g, "");
const live = (s: StanzeState) => s.phase === "setup" || s.phase === "play";

function addLog(s: StanzeState, at: number, line: string): StanzeState {
  return { ...s, log: [...s.log, { at, text: line }].slice(-KEEP_LOG) };
}

function setFeedback(s: StanzeState, id: PlayerId, f: Feedback): StanzeState {
  return { ...s, feedback: { ...s.feedback, [id]: f } };
}

function expand(s: StanzeState, target: Target): PlayerId[] {
  if (target === "all") return s.roster.map((p) => p.id);
  if ("players" in target) return s.roster.map((p) => p.id).filter((id) => target.players.includes(id));
  return s.roster.map((p) => p.id).filter((id) => s.positions[id] === target.cell);
}

const activeGrant = (s: StanzeState, id: PlayerId, action: Action, now: number): Grant | undefined =>
  s.grants.find(
    (g) => g.playerId === id && g.action === action && (g.expiresAt === null || g.expiresAt > now) && (g.usesLeft === null || g.usesLeft > 0),
  );

function useGrant(s: StanzeState, grant: Grant): StanzeState {
  if (grant.usesLeft === null) return s;
  return { ...s, grants: s.grants.map((g) => (g.id === grant.id ? { ...g, usesLeft: g.usesLeft! - 1 } : g)) };
}

/** Stato di una freccia della croce per quel giocatore e quel permesso. */
export type ArrowState = "open" | "blocked" | "wall";
function arrows(s: StanzeState, from: CellId, grant: Grant): Record<Dir, ArrowState> {
  const out = {} as Record<Dir, ArrowState>;
  for (const d of DIRS) {
    const n = neighbor(grid(s), from, d);
    // Il blocco del permesso vale anche verso un muro, così un lucchetto non rivela dove finisce la mappa.
    out[d] = grant.directions && !grant.directions.includes(d) ? "blocked" : n === null ? "wall" : isClosed(s, from, n) ? "blocked" : "open";
  }
  return out;
}

function pushMessage(s: StanzeState, m: Omit<Message, "id">): StanzeState {
  const id = s.nextMessageId;
  return { ...s, nextMessageId: id + 1, messages: [...s.messages, { ...m, id }].slice(-KEEP_MESSAGES) };
}

const cancelRequests = (s: StanzeState, playerId: PlayerId, pred: (r: Request) => boolean, now: number): StanzeState => {
  const gone = s.requests.filter((r) => r.playerId === playerId && pred(r));
  if (gone.length === 0) return s;
  const next = { ...s, requests: s.requests.filter((r) => !gone.includes(r)) };
  return setFeedback(next, playerId, { kind: "cancelled", cell: null, at: now });
};

function grantMatchesRequest(action: Action): (r: Request) => boolean {
  if (action === "move" || action === "peek" || action === "guess") return (r) => r.kind === action;
  if (action.startsWith("custom:")) return (r) => r.kind === "custom" && `custom:${r.actionId}` === action;
  return () => false;
}

// ---- Input dei giocatori ----

function request(s: StanzeState, id: PlayerId, kind: Request["kind"], extra: Partial<Request>, now: number): StanzeState {
  const next = { ...s, nextRequestId: s.nextRequestId + 1, requests: [...s.requests, { id: s.nextRequestId, playerId: id, kind, at: now, ...extra }] };
  return next;
}

function onInput(state: StanzeState, playerId: PlayerId, input: Input, meta: { receivedAt: number }): StanzeState {
  const s = state;
  const now = meta.receivedAt;
  if (!inRoster(s, playerId) || s.phase === "done") return s;

  // Sempre disponibili (anche alla rivelazione): accettare eventi e segnare i messaggi come letti.
  if (input.type === "accept-event") {
    const ev = s.events.find((e) => e.id === input.eventId);
    if (!ev || ev.cancelled || !(playerId in ev.accepted) || ev.accepted[playerId] !== null) return s;
    return { ...s, events: s.events.map((e) => (e === ev ? { ...e, accepted: { ...e.accepted, [playerId]: now } } : e)) };
  }
  if (input.type === "ack") {
    const m = s.messages.find((x) => x.id === input.messageId);
    if (!m || m.from !== "master" || !m.recipients.includes(playerId) || m.readBy[playerId] !== undefined) return s;
    return { ...s, messages: s.messages.map((x) => (x === m ? { ...x, readBy: { ...x.readBy, [playerId]: now } } : x)) };
  }
  if (!live(s)) return s;

  switch (input.type) {
    case "cancel": {
      const r = s.requests.find((x) => x.id === input.requestId && x.playerId === playerId);
      if (!r) return s;
      return { ...s, requests: s.requests.filter((x) => x !== r) };
    }

    case "move":
    case "peek": {
      const grant = activeGrant(s, playerId, input.type, now);
      const from = s.positions[playerId];
      if (!grant || from === null || from === undefined) return s;
      if (s.requests.some((r) => r.playerId === playerId && r.kind === input.type)) return s;
      // Verso un muro la richiesta parte lo stesso (il telefono non distingue): sarà il GM a vederla segnalata e a rifiutarla.
      if (arrows(s, from, grant)[input.direction] === "blocked") return s;
      return request(useGrant(s, grant), playerId, input.type, { direction: input.direction }, now);
    }

    case "sight": {
      const grant = activeGrant(s, playerId, "sight", now);
      if (!grant) return s;
      const cell = grant.sightScope === "own-room" || grant.sightScope === undefined ? s.positions[playerId] : grant.sightScope;
      if (cell === null || cell === undefined || !isCell(grid(s), cell)) return s;
      if (s.sightings.some((x) => x.playerId === playerId)) return s; // un'occhiata alla volta
      const next = { ...useGrant(s, grant), sightings: [...s.sightings, { playerId, cellId: cell, until: now + s.cfg.defaultSightSec * 1000 }] };
      return addLog(next, now, `${nick(s, playerId)} guarda la lettera della ${roomName(cell)}`);
    }

    case "message":
    case "reply": {
      const grant = input.type === "message" ? activeGrant(s, playerId, "message", now) : undefined;
      if (input.type === "message" && !grant) return s;
      const last = s.lastMessageAt[playerId];
      if (last !== undefined && now - last < s.cfg.messageCooldownSec * 1000) return s;
      const body = input.text.slice(0, s.cfg.messageMaxLength);
      let replyTo: number | null = null;
      let base = s;
      if (input.type === "reply") {
        const orig = s.messages.find((m) => m.id === input.messageId);
        if (!orig || orig.from !== "master" || !orig.recipients.includes(playerId) || !orig.allowReply) return s;
        if ((orig.replies[playerId] ?? 0) >= orig.maxReplies) return s;
        replyTo = orig.id;
        base = { ...s, messages: s.messages.map((m) => (m === orig ? { ...m, replies: { ...m.replies, [playerId]: (m.replies[playerId] ?? 0) + 1 } } : m)) };
      } else base = useGrant(s, grant!);
      const next = pushMessage(base, {
        from: playerId, toKind: "master", toPlayer: null, toCell: null, recipients: [], text: body, at: now,
        readBy: {}, masterReadAt: null, replyTo, allowReply: false, maxReplies: 0, replies: {},
      });
      return { ...next, lastMessageAt: { ...next.lastMessageAt, [playerId]: now } };
    }

    case "guess": {
      const grant = activeGrant(s, playerId, "guess", now);
      if (!grant) return s;
      return request(useGrant(s, grant), playerId, "guess", { word: normWord(input.word) }, now);
    }

    case "custom": {
      if (!s.cfg.customActions.some((a) => a.id === input.actionId)) return s;
      const grant = activeGrant(s, playerId, `custom:${input.actionId}`, now);
      if (!grant) return s;
      return request(useGrant(s, grant), playerId, "custom", { actionId: input.actionId }, now);
    }
  }
}

// ---- Comandi del GM ----

function place(s: StanzeState, playerId: PlayerId, cell: CellId | null, now: number): StanzeState {
  if (!inRoster(s, playerId)) return s;
  if (cell !== null && !isCell(grid(s), cell)) return s;
  if (s.positions[playerId] === cell) return s;
  // Le richieste di spostamento e sbirciata riguardavano la vecchia stanza.
  const requests = s.requests.filter((r) => !(r.playerId === playerId && (r.kind === "move" || r.kind === "peek")));
  const next = { ...s, positions: { ...s.positions, [playerId]: cell }, requests };
  return addLog(next, now, cell === null ? `${nick(s, playerId)} tolto dalla mappa` : `${nick(s, playerId)} → ${roomName(cell)}`);
}

function grantTo(s: StanzeState, cmd: Extract<Command, { type: "grant" }>, now: number): StanzeState {
  const action = cmd.action as Action;
  if (action.startsWith("custom:") && !s.cfg.customActions.some((a) => `custom:${a.id}` === action)) return s;
  const ids = expand(s, cmd.target);
  if (ids.length === 0) return s;
  let next = s;
  let seq = s.nextGrantId;
  const fresh: Grant[] = ids.map((playerId) => ({
    id: `g${seq++}`,
    playerId,
    action,
    ...(action === "sight" && { sightScope: cmd.sightScope ?? "own-room" }),
    ...((action === "move" || action === "peek") && { directions: cmd.directions && cmd.directions.length > 0 ? cmd.directions : [...DIRS] }),
    usesLeft: cmd.uses ?? null,
    expiresAt: cmd.durationSec ? now + cmd.durationSec * 1000 : null,
  }));
  next = { ...next, nextGrantId: seq, grants: [...next.grants.filter((g) => !(ids.includes(g.playerId) && g.action === action)), ...fresh] };
  return addLog(next, now, `Abilitato «${action}» a ${ids.map((i) => nick(s, i)).join(", ")}`);
}

function revoke(s: StanzeState, cmd: Extract<Command, { type: "revoke" }>, now: number): StanzeState {
  let victims: Grant[];
  if (cmd.grantId) victims = s.grants.filter((g) => g.id === cmd.grantId);
  else if (cmd.target) {
    const ids = expand(s, cmd.target);
    victims = s.grants.filter((g) => ids.includes(g.playerId) && (!cmd.action || g.action === cmd.action));
  } else return s;
  if (victims.length === 0) return s;
  let next: StanzeState = { ...s, grants: s.grants.filter((g) => !victims.includes(g)) };
  for (const g of victims) {
    next = cancelRequests(next, g.playerId, grantMatchesRequest(g.action), now);
    if (g.action === "sight") next = { ...next, sightings: next.sightings.filter((x) => x.playerId !== g.playerId) };
  }
  return addLog(next, now, `Disabilitato: ${[...new Set(victims.map((g) => `${g.action} (${nick(s, g.playerId)})`))].join(", ")}`);
}

function resolve(s: StanzeState, requestId: number, approve: boolean, now: number, opts: { showLetterSec?: number; reply?: string } = {}): StanzeState {
  const r = s.requests.find((x) => x.id === requestId);
  if (!r) return s;
  let next: StanzeState = { ...s, requests: s.requests.filter((x) => x !== r) };
  const who = nick(s, r.playerId);
  let cell: CellId | null = null;

  if (r.kind === "move") {
    const from = s.positions[r.playerId];
    const to = from === null || from === undefined || !r.direction ? null : neighbor(grid(s), from, r.direction);
    if (approve && to !== null) {
      next = { ...next, positions: { ...next.positions, [r.playerId]: to } };
      cell = to;
      next = addLog(next, now, `${who} si sposta nella ${roomName(to)}`);
    } else if (approve) approve = false; // la stanza di partenza non c'è più: non si sposta
    else next = addLog(next, now, `Spostamento di ${who} rifiutato`);
  } else if (r.kind === "peek") {
    const from = s.positions[r.playerId];
    const to = from === null || from === undefined || !r.direction ? null : neighbor(grid(s), from, r.direction);
    if (approve && to !== null && opts.showLetterSec) {
      next = { ...next, sightings: [...next.sightings.filter((x) => x.playerId !== r.playerId), { playerId: r.playerId, cellId: to, until: now + opts.showLetterSec * 1000 }] };
      cell = to;
      next = addLog(next, now, `${who} sbircia nella ${roomName(to)}`);
    } else next = addLog(next, now, `Sbirciata di ${who} ${approve ? "evasa" : "rifiutata"}`);
  } else if (r.kind === "guess") {
    const right = normWord(r.word ?? "") === normWord(s.cfg.solution);
    if (approve) next = { ...next, solved: { ...next.solved, [r.playerId]: true } };
    next = addLog(next, now, `${who} propone «${r.word}» (${right ? "giusta" : "sbagliata"}): ${approve ? "convalidata" : "respinta"}`);
  } else next = addLog(next, now, `Azione «${r.actionId}» di ${who} ${approve ? "accolta" : "rifiutata"}`);

  next = setFeedback(next, r.playerId, { kind: approve ? (r.kind === "guess" ? "solved" : r.kind === "peek" && cell !== null ? "letter" : "approved") : "refused", cell, at: now });
  if (opts.reply) {
    next = pushMessage(next, {
      from: "master", toKind: "player", toPlayer: r.playerId, toCell: null, recipients: [r.playerId], text: opts.reply.slice(0, 1000), at: now,
      readBy: {}, masterReadAt: null, replyTo: null, allowReply: false, maxReplies: 0, replies: {},
    });
  }
  return next;
}

function begin(s: StanzeState, now: number): StanzeState {
  if (s.phase !== "setup" || unplaced(s).length > 0) return s;
  // Parte il tempo di gioco, il primo cronometro del GM.
  const timers = s.timers.map((t) => (t.id === "t0" ? startTimer(t, now) : t));
  return addLog({ ...s, phase: "play", timers }, now, "Si comincia");
}

function onHostCommand(state: StanzeState, cmd: Command, now: number): StanzeState {
  const s = state;
  if (s.phase === "done") return s;

  // Dopo la rivelazione restano solo l'esito e la chiusura.
  if (s.phase === "reveal") {
    if (cmd.type === "set-outcome" && inRoster(s, cmd.playerId)) return { ...s, outcome: { ...s.outcome, [cmd.playerId]: cmd.outcome } };
    return cmd.type === "end" ? { ...s, phase: "done" } : s;
  }

  switch (cmd.type) {
    case "place":
      return place(s, cmd.playerId, cmd.cellId, now);
    case "place-all": {
      if (!isCell(grid(s), cmd.cellId)) return s;
      return s.roster.reduce((acc, p) => place(acc, p.id, cmd.cellId, now), s);
    }
    case "place-spread": {
      const order = shuffle(Array.from({ length: cells(s) }, (_, i) => i), makeRng(s.seed));
      return s.roster.reduce((acc, p, i) => place(acc, p.id, order[i % order.length]!, now), s);
    }
    case "grant":
      return grantTo(s, cmd, now);
    case "revoke":
      return revoke(s, cmd, now);
    case "set-directions": {
      const g = s.grants.find((x) => x.id === cmd.grantId);
      if (!g || (g.action !== "move" && g.action !== "peek")) return s;
      return { ...s, grants: s.grants.map((x) => (x === g ? { ...x, directions: cmd.directions } : x)) };
    }
    case "door": {
      const g = grid(s);
      if (!isCell(g, cmd.a) || !isCell(g, cmd.b) || directionBetween(g, cmd.a, cmd.b) === null) return s;
      const d = doorKey(cmd.a, cmd.b);
      const closed = isClosed(s, d.a, d.b);
      if (closed === !cmd.open) return s;
      const doors = cmd.open ? s.closedDoors.filter((x) => !(x.a === d.a && x.b === d.b)) : [...s.closedDoors, d];
      return addLog({ ...s, closedDoors: doors }, now, `Porta tra ${roomName(d.a)} e ${roomName(d.b)} ${cmd.open ? "aperta" : "chiusa"}`);
    }
    case "show-letter": {
      if (!isCell(grid(s), cmd.cellId)) return s;
      const ids = expand(s, cmd.target);
      if (ids.length === 0) return s;
      const sightings = [
        ...s.sightings.filter((x) => !ids.includes(x.playerId)),
        ...ids.map((playerId) => ({ playerId, cellId: cmd.cellId, until: now + cmd.seconds * 1000 })),
      ];
      return addLog({ ...s, sightings }, now, `Lettera della ${roomName(cmd.cellId)} mostrata a ${ids.map((i) => nick(s, i)).join(", ")}`);
    }
    case "resolve":
      return resolve(s, cmd.requestId, cmd.approve, now, { showLetterSec: cmd.showLetterSec, reply: cmd.reply });
    case "resolve-all-moves":
      return s.requests.filter((r) => r.kind === "move").reduce((acc, r) => resolve(acc, r.id, cmd.approve, now), s);
    case "message": {
      let recipients: PlayerId[];
      let toKind: Message["toKind"];
      let toPlayer: PlayerId | null = null;
      let toCell: CellId | null = null;
      if (cmd.to === "all") {
        toKind = "all";
        recipients = s.roster.map((p) => p.id);
      } else if ("player" in cmd.to) {
        if (!inRoster(s, cmd.to.player)) return s;
        toKind = "player";
        toPlayer = cmd.to.player;
        recipients = [toPlayer];
      } else {
        toKind = "room";
        toCell = cmd.to.cell;
        recipients = expand(s, { cell: cmd.to.cell });
        if (recipients.length === 0) return s;
      }
      return pushMessage(s, {
        from: "master", toKind, toPlayer, toCell, recipients, text: cmd.text, at: now, readBy: {}, masterReadAt: null,
        replyTo: null, allowReply: cmd.allowReply ?? true, maxReplies: cmd.maxReplies ?? 1, replies: {},
      });
    }
    case "close-reply": {
      const m = s.messages.find((x) => x.id === cmd.messageId);
      if (!m || !m.allowReply) return s;
      return { ...s, messages: s.messages.map((x) => (x === m ? { ...x, allowReply: false } : x)) };
    }
    case "read": {
      const m = s.messages.find((x) => x.id === cmd.messageId);
      if (!m || m.from === "master" || m.masterReadAt !== null) return s;
      return { ...s, messages: s.messages.map((x) => (x === m ? { ...x, masterReadAt: now } : x)) };
    }
    case "event": {
      const body = cmd.text.slice(0, s.cfg.eventMaxLength);
      const recipients = cmd.to === "all" ? s.roster.map((p) => p.id) : s.roster.map((p) => p.id).filter((id) => (cmd.to as string[]).includes(id));
      if (recipients.length === 0) return s;
      const accepted: Record<PlayerId, number | null> = {};
      for (const id of recipients) accepted[id] = null;
      const ev: GameEvent = { id: s.nextMessageId, text: body, at: now, to: cmd.to === "all" ? "all" : recipients, accepted, cancelled: false };
      return addLog({ ...s, nextMessageId: s.nextMessageId + 1, events: [...s.events, ev] }, now, `Evento inviato a ${cmd.to === "all" ? "tutti" : recipients.map((i) => nick(s, i)).join(", ")}: ${body}`);
    }
    case "cancel-event": {
      const ev = s.events.find((e) => e.id === cmd.eventId);
      if (!ev || ev.cancelled || Object.values(ev.accepted).every((v) => v !== null)) return s;
      return addLog({ ...s, events: s.events.map((e) => (e === ev ? { ...e, cancelled: true } : e)) }, now, `Evento ${ev.id} annullato`);
    }
    case "set-outcome":
      if (!inRoster(s, cmd.playerId) || s.outcome[cmd.playerId] === cmd.outcome) return s;
      return addLog({ ...s, outcome: { ...s.outcome, [cmd.playerId]: cmd.outcome } }, now, `${nick(s, cmd.playerId)}: ${cmd.outcome}`);
    case "start":
      return begin(s, now);
    case "item-add": {
      if (s.itemDefs.length >= MAX_ITEMS || (cmd.cellId != null && !isCell(grid(s), cmd.cellId))) return s;
      const ref = s.nextItemRef;
      const id = `x${ref}`;
      const def: ItemDef = { id, ref, name: cmd.name, icon: cmd.icon ?? "📦", text: cmd.text ?? "", note: cmd.note ?? "" };
      const cell = cmd.cellId ?? null;
      const item: ItemState = { id, cell, enabled: cmd.enabled ?? false, revealedTo: [] };
      return addLog({ ...s, nextItemRef: ref + 1, itemDefs: [...s.itemDefs, def], items: [...s.items, item] }, now, `Nuovo oggetto: ${def.name}${cell === null ? "" : ` in ${roomName(cell)}`}`);
    }
    case "item-remove": {
      const it = s.items.find((x) => x.id === cmd.itemId);
      if (!it) return s;
      return addLog({ ...s, items: s.items.filter((x) => x !== it), itemDefs: s.itemDefs.filter((d) => d.id !== it.id) }, now, `Oggetto eliminato: ${defOf(s, it.id).name}`);
    }
    case "place-item": {
      const it = s.items.find((x) => x.id === cmd.itemId);
      if (!it || it.cell === cmd.cellId || (cmd.cellId !== null && !isCell(grid(s), cmd.cellId))) return s;
      const name = defOf(s, it.id).name;
      // Spostato in un'altra stanza, l'oggetto torna misterioso per tutti.
      const items = s.items.map((x) => (x === it ? { ...x, cell: cmd.cellId, revealedTo: [] } : x));
      return addLog({ ...s, items }, now, cmd.cellId === null ? `${name}: tolto dalla mappa` : `${name} → ${roomName(cmd.cellId)}`);
    }
    case "enable-item": {
      const it = s.items.find((x) => x.id === cmd.itemId);
      if (!it || it.enabled === cmd.enabled) return s;
      const name = defOf(s, it.id).name;
      return addLog({ ...s, items: s.items.map((x) => (x === it ? { ...x, enabled: cmd.enabled } : x)) }, now, `${name}: ${cmd.enabled ? "chi è nella stanza sa che esiste" : "nascosto ai giocatori"}`);
    }
    case "reveal-item": {
      const it = s.items.find((x) => x.id === cmd.itemId);
      if (!it || it.cell === null) return s;
      // Solo chi è nella stanza dell'oggetto può scoprirlo; "room" = tutti i presenti.
      const present = s.roster.map((p) => p.id).filter((id) => s.positions[id] === it.cell);
      const to = cmd.to;
      const targets = to === "room" ? present : present.filter((id) => to.players.includes(id));
      const fresh = targets.filter((id) => !it.revealedTo.includes(id));
      if (fresh.length === 0) return s;
      const name = defOf(s, it.id).name;
      const items = s.items.map((x) => (x === it ? { ...x, enabled: true, revealedTo: [...x.revealedTo, ...fresh] } : x));
      return addLog({ ...s, items }, now, `${name} palesato a ${fresh.map((i) => nick(s, i)).join(", ")}`);
    }
    case "conceal-item": {
      const it = s.items.find((x) => x.id === cmd.itemId);
      if (!it || it.revealedTo.length === 0) return s;
      return { ...s, items: s.items.map((x) => (x === it ? { ...x, revealedTo: [] } : x)) };
    }
    case "timer-add": {
      if (s.timers.length >= MAX_TIMERS) return s;
      const t = newTimer(`t${s.nextTimerId}`, cmd.label, cmd.intervalSec ?? null);
      return { ...s, nextTimerId: s.nextTimerId + 1, timers: [...s.timers, t] };
    }
    case "timer-start":
    case "timer-pause":
    case "timer-reset":
    case "timer-remove": {
      const t = s.timers.find((x) => x.id === cmd.timerId);
      if (!t) return s;
      if (cmd.type === "timer-remove") return { ...s, timers: s.timers.filter((x) => x !== t) };
      const next = cmd.type === "timer-start" ? startTimer(t, now) : cmd.type === "timer-pause" ? pauseTimer(t, now) : resetTimer(t);
      return next === t ? s : { ...s, timers: s.timers.map((x) => (x === t ? next : x)) };
    }
    case "show-map":
      return s.mapShown === cmd.visible ? s : addLog({ ...s, mapShown: cmd.visible }, now, cmd.visible ? "Mappa mostrata ai giocatori" : "Mappa nascosta");
    case "public-reveal":
      return s.phase === "play" ? { ...freezeTimers(s, now), phase: "reveal", publicReveal: true, mapShown: true } : s;
    case "end":
      return { ...freezeTimers(s, now), phase: "done", publicReveal: true, mapShown: true };
  }
}

/** Ferma tutti i cronometri (rivelazione o fine): il tempo trascorso resta quello della sessione. */
function freezeTimers(s: StanzeState, now: number): StanzeState {
  if (!s.timers.some((t) => t.running)) return s;
  return { ...s, timers: s.timers.map((t) => pauseTimer(t, now)) };
}

/** A ogni intervallo fisso trascorso il GM riceve una riga nel diario e il contatore degli intervalli sale. */
function tickTimers(s: StanzeState, now: number): StanzeState {
  let next = s;
  for (const t of s.timers) {
    const laps = lapsAt(t, now);
    if (!t.running || !t.intervalSec || laps <= t.laps) continue;
    next = addLog({ ...next, timers: next.timers.map((x) => (x.id === t.id ? { ...x, laps } : x)) }, now, `⏱ ${t.label}: trascorsi ${formatDuration(laps * t.intervalSec * 1000)}`);
  }
  return next;
}

function onTick(s: StanzeState, now: number): StanzeState {
  const grantsLeft = s.grants.filter((g) => g.expiresAt === null || g.expiresAt > now);
  const sightsLeft = s.sightings.filter((x) => x.until > now);
  const ticked = tickTimers(s, now);
  if (grantsLeft.length === s.grants.length && sightsLeft.length === s.sightings.length) return ticked;
  return { ...ticked, grants: grantsLeft, sightings: sightsLeft };
}

// ---- Punteggi ----

function totals(s: StanzeState): Record<PlayerId, number> {
  const t: Record<PlayerId, number> = {};
  for (const p of s.roster) t[p.id] = (s.outcome[p.id] === "fuggito" ? s.cfg.escapePoints : 0) + (s.solved[p.id] ? s.cfg.solvePoints : 0);
  return t;
}

// ---- Messaggi per il database ----

function toRoundMessages(s: StanzeState): RoundMessage[] {
  const out: RoundMessage[] = [];
  for (const m of s.messages) {
    const reads = Object.values(m.readBy);
    out.push({
      id: m.id,
      kind: "message",
      fromKind: m.from === "master" ? "master" : "player",
      fromPlayerId: m.from === "master" ? null : m.from,
      toKind: m.toKind,
      toPlayerId: m.toPlayer,
      toCell: m.toCell,
      recipients: m.from === "master" && m.toKind !== "player" ? m.recipients : null,
      text: m.text,
      ts: m.at,
      readAt: m.from === "master" ? (reads.length > 0 ? Math.min(...reads) : null) : m.masterReadAt,
    });
  }
  for (const e of s.events) {
    out.push({
      id: e.id, kind: "event", fromKind: "master", fromPlayerId: null, toKind: e.to === "all" ? "all" : "players", toPlayerId: null, toCell: null,
      recipients: Object.keys(e.accepted), text: e.text, ts: e.at, readAt: null, accepted: e.accepted, cancelled: e.cancelled,
    });
  }
  return out.sort((a, b) => a.id - b.id);
}

// ---- Viste ----

const shortName = (s: StanzeState) => s.roster.map((p) => ({ id: p.id, nickname: p.nickname }));

export interface RulesInfo {
  /** Assenti finché la mappa non è stata mostrata: i giocatori non devono conoscerne la forma. */
  rows?: number;
  cols?: number;
  sightSec: number;
  messageMaxLength: number;
  positionsPublic: boolean;
}

const rulesOf = (s: StanzeState): RulesInfo => ({
  ...(s.mapShown && { rows: s.cfg.rows, cols: s.cfg.cols }), sightSec: s.cfg.defaultSightSec, messageMaxLength: s.cfg.messageMaxLength, positionsPublic: s.cfg.positionsPublic,
});

const revealed = (s: StanzeState) => ({
  letters: s.cfg.rooms.map((r) => r.letter),
  paths: s.cfg.words.map((w) => ({ word: w, cells: findWordPath(grid(s), s.cfg.rooms.map((r) => r.letter), w) ?? [] })),
  outcomes: s.roster.map((p) => ({ id: p.id, nickname: p.nickname, outcome: s.outcome[p.id] ?? "in-gioco", solved: s.solved[p.id] === true })),
});

export const stanzeSegrete: MinigameType<StanzeConfig, StanzeState, Input, Command> = {
  id: "stanze-segrete",
  title: "Stanze Segrete",
  defaultTheme: "retro80",
  configSchema: stanzeConfigSchema as unknown as z.ZodType<StanzeConfig>,
  inputSchema,
  commandSchema,
  sampleConfig: SAMPLE_CONFIG,
  master: true,
  maxPlayers: MAX_PLAYERS,

  init(config, ctx, now) {
    void now;
    return {
      cfg: config,
      seed: ctx.seed,
      phase: "setup",
      roster: ctx.players,
      positions: Object.fromEntries(ctx.players.map((p) => [p.id, null])),
      outcome: Object.fromEntries(ctx.players.map((p) => [p.id, "in-gioco" as Outcome])),
      solved: {},
      grants: [],
      closedDoors: [],
      timers: [newTimer("t0", "Tempo di gioco", config.clockIntervalSec > 0 ? config.clockIntervalSec : null)],
      nextTimerId: 1,
      itemDefs: config.items.map((i, n) => ({ id: i.id, ref: n, name: i.name, icon: i.icon, text: i.text, note: i.note })),
      items: config.items.map((i) => ({ id: i.id, cell: i.cell, enabled: false, revealedTo: [] })),
      nextItemRef: config.items.length,
      sightings: [],
      requests: [],
      messages: [],
      events: [],
      nextMessageId: 1,
      nextRequestId: 1,
      nextGrantId: 1,
      lastMessageAt: {},
      feedback: {},
      log: [],
      publicReveal: false,
      mapShown: false,
    };
  },

  onInput,
  onTick,
  onHostCommand,
  isFinished: (s) => s.phase === "done",
  result: (s) => rankByPoints(totals(s), s.roster.map((p) => p.id)),
  scores(s) {
    const out: ReturnType<typeof stanzeSegrete.scores> = [];
    for (const p of s.roster) {
      if (s.outcome[p.id] === "fuggito" && s.cfg.escapePoints) out.push({ playerId: p.id, teamId: null, points: s.cfg.escapePoints, reason: "Stanze Segrete: fuga" });
      if (s.solved[p.id] && s.cfg.solvePoints) out.push({ playerId: p.id, teamId: null, points: s.cfg.solvePoints, reason: "Stanze Segrete: soluzione" });
    }
    return out;
  },
  messages: toRoundMessages,

  // Pubblico: la griglia, le posizioni (se pubbliche) e nient'altro fino alla rivelazione. Nessun testo dei giocatori.
  screenView(s) {
    // Finché il GM non mostra la mappa lo schermo non sa nulla della sua forma né di dove stanno i giocatori.
    if (!s.mapShown) return { phase: s.phase, mapShown: false as const };
    const base = {
      phase: s.phase,
      mapShown: true as const,
      rows: s.cfg.rows,
      cols: s.cfg.cols,
      players: s.cfg.positionsPublic ? shortName(s) : [],
      positions: s.cfg.positionsPublic ? s.positions : {},
    };
    return s.publicReveal ? { ...base, ...revealed(s) } : base;
  },

  viewFor(s, playerId) {
    const me = s.roster.find((p) => p.id === playerId);
    if (!me) return { phase: s.phase, member: false };
    const pos = s.positions[playerId] ?? null;
    const mine = s.grants.filter((g) => g.playerId === playerId);
    const compass: Partial<Record<"move" | "peek", Record<Dir, ArrowState>>> = {};
    for (const kind of ["move", "peek"] as const) {
      const g = mine.find((x) => x.action === kind && (x.usesLeft === null || x.usesLeft > 0));
      // Le quattro frecce ci sono sempre, anche all'angolo: un muro compare come una freccia aperta, così la forma della mappa non si deduce.
      if (g && pos !== null) {
        const a = arrows(s, pos, g);
        compass[kind] = Object.fromEntries(DIRS.map((d) => [d, a[d] === "wall" ? "open" : a[d]])) as Record<Dir, ArrowState>;
      }
    }
    const sighting = s.sightings.find((x) => x.playerId === playerId);
    const msgs = s.messages
      .filter((m) => m.from === playerId || (m.from === "master" && m.recipients.includes(playerId)))
      .map((m) => ({
        id: m.id,
        mine: m.from === playerId,
        text: m.text,
        at: m.at,
        readAt: m.from === "master" ? (m.readBy[playerId] ?? null) : null,
        replyTo: m.replyTo,
        canReply: m.from === "master" && m.allowReply && (m.replies[playerId] ?? 0) < m.maxReplies,
      }));
    // Solo gli eventi ricevuti da questo giocatore, senza gli altri destinatari.
    const received = s.events.filter((e) => playerId in e.accepted);
    const eventView = (e: GameEvent) => ({ id: e.id, text: e.text, at: e.at, acceptedAt: e.accepted[playerId] ?? null, cancelled: e.cancelled });
    return {
      phase: s.phase,
      member: true,
      mapShown: s.mapShown,
      ...(s.mapShown && { rows: s.cfg.rows, cols: s.cfg.cols }),
      cell: pos,
      outcome: s.outcome[playerId] ?? "in-gioco",
      solved: s.solved[playerId] === true,
      others: s.mapShown && s.cfg.positionsPublic ? s.roster.filter((p) => p.id !== playerId).map((p) => ({ id: p.id, nickname: p.nickname, cell: s.positions[p.id] ?? null })) : [],
      abilities: mine.filter((g) => g.usesLeft === null || g.usesLeft > 0).map((g) => ({
        id: g.id,
        action: g.action,
        label: g.action.startsWith("custom:") ? (s.cfg.customActions.find((a) => `custom:${a.id}` === g.action)?.label ?? g.action) : null,
        usesLeft: g.usesLeft,
        expiresAt: g.expiresAt,
      })),
      compass,
      pending: s.requests.filter((r) => r.playerId === playerId).map((r) => ({ id: r.id, kind: r.kind, direction: r.direction ?? null, actionId: r.actionId ?? null, word: r.word ?? null })),
      // Gli oggetti della stanza: si sa solo che c'è qualcosa; nome, icona e testo solo se il Master li ha palesati a questo giocatore.
      // Il riferimento è un numero (mai l'id): un id come «scopa» direbbe già di che oggetto si tratta.
      items:
        pos === null
          ? []
          : s.items.flatMap((it): PhoneItem[] => {
              if (it.cell !== pos || !it.enabled) return [];
              const def = defOf(s, it.id);
              if (!it.revealedTo.includes(playerId)) return [{ ref: def.ref, known: false }];
              return [{ ref: def.ref, known: true, name: def.name, icon: def.icon, text: def.text }];
            }),
      sighting: sighting ? { cell: sighting.cellId, letter: letterOf(s, sighting.cellId), until: sighting.until } : null,
      feedback: s.feedback[playerId] ?? null,
      messages: msgs,
      pendingEvents: received.filter((e) => !e.cancelled && e.accepted[playerId] === null).map(eventView),
      history: received.filter((e) => e.accepted[playerId] !== null || e.cancelled).map(eventView).reverse(),
      rules: rulesOf(s),
      ...(s.publicReveal && { revealed: true }),
    };
  },

  hostView(s) {
    const left = unplaced(s).length;
    return {
      info: {
        phase: s.phase,
        rows: s.cfg.rows,
        cols: s.cfg.cols,
        rooms: s.cfg.rooms,
        words: s.cfg.words,
        solution: s.cfg.solution,
        customActions: s.cfg.customActions,
        presetEvents: s.cfg.presetEvents,
        defaultSightSec: s.cfg.defaultSightSec,
        eventMaxLength: s.cfg.eventMaxLength,
        messageMaxLength: s.cfg.messageMaxLength,
        roster: shortName(s),
        positions: s.positions,
        outcome: s.outcome,
        solved: s.solved,
        unplaced: left,
        mapShown: s.mapShown,
        grants: s.grants,
        closedDoors: s.closedDoors,
        timers: s.timers,
        items: s.items.map((it) => ({ ...defOf(s, it.id), ...it })),
        sightings: s.sightings,
        requests: s.requests.map((r) => ({ ...r, wall: (r.kind === "move" || r.kind === "peek") && r.direction !== undefined && (s.positions[r.playerId] ?? null) !== null && neighbor(grid(s), s.positions[r.playerId]!, r.direction) === null, nickname: nick(s, r.playerId), correct: r.kind === "guess" ? normWord(r.word ?? "") === normWord(s.cfg.solution) : null })),
        // La vista del GM resta leggera anche con molta posta: gli ultimi messaggi e le ultime righe del diario.
        messages: s.messages.slice(-HOST_MESSAGES),
        events: s.events,
        log: s.log.slice(-HOST_LOG),
      },
      actions: [
        { id: "place-spread", label: "Distribuisci i giocatori", enabled: s.phase === "setup" && left > 0 },
        { id: "start", label: "Inizia", enabled: s.phase === "setup" && left === 0 },
        { id: "public-reveal", label: "Rivela la mappa sullo schermo", enabled: s.phase === "play" },
        s.phase === "reveal"
          ? { id: "end", label: "Concludi", enabled: true }
          : { id: "end", label: "Concludi senza rivelare", enabled: s.phase === "play", danger: true },
      ],
    };
  },
};
