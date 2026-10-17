import { z } from "zod";
import type { MinigameType, RoundResult, ScoreDelta } from "@gioco/shared";
import { deriveSeed, makeRng, shuffle } from "../knight-duel/rng.js";
import { GRACE_MS, rankByPoints } from "../util.js";
import {
  type Bout,
  type Env,
  NPC,
  type Wallet,
  acceptsInput,
  advanceBout,
  boutDue,
  chooseDeck,
  costsOf,
  counter,
  forfeit,
  hasSide,
  otherSide,
  play,
  react,
  reactionsFor,
  riskChoice,
  setExtraLife,
  startBout,
  swapCards,
} from "./bout.js";
import { type ShadowConfig, sampleShadowConfig, shadowConfigSchema } from "./config.js";
import { type PairingFighter, pairTurn } from "./pairing.js";

export { DEFAULT_LEGENDARY_DECK, DEFAULT_NORMAL_DECK, shadowConfigSchema } from "./config.js";
export type { ShadowConfig } from "./config.js";

const cardSchema = z.enum(["attack", "defense", "trick"]);

const inputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("extraLife"), spend: z.boolean() }),
  z.object({ type: z.literal("play"), card: cardSchema, bet: z.boolean().optional() }),
  z.object({ type: z.literal("react"), action: z.enum(["pass", "shield", "trap", "swap", "counter"]), card: cardSchema.optional() }),
  z.object({ type: z.literal("byeChoice"), choice: z.enum(["bye", "npc"]) }),
  z.object({ type: z.literal("deck"), deck: z.enum(["normal", "legendary"]) }),
  z.object({ type: z.literal("riskChoice"), pay: z.enum(["tokens", "life"]) }),
  z.object({ type: z.literal("predict"), winnerId: z.string().min(1).max(100) }),
]);

const commandSchema = z.union([
  z.object({ type: z.enum(["skip", "pause", "end"]) }),
  z.object({ type: z.string().regex(/^withdraw:.{1,100}$/) }),
]);

type Input = z.infer<typeof inputSchema>;
type Command = z.infer<typeof commandSchema>;

export type FighterStatus = "W" | "L" | "out";

export interface Fighter {
  id: string;
  nickname: string;
  teamId: string | null;
  status: FighterStatus;
  tokens: number;
  /** Effetto delle carte ricompensa sulle vite del prossimo scontro. */
  nextLives: number;
  lastOpponent: string | null;
  oddLastTurn: boolean;
  boutsWon: number;
  outAtTurn: number | null;
  withdrawn: boolean;
}

export interface ShadowState {
  cfg: ShadowConfig;
  seed: number;
  /** Contatore dei flussi casuali: ogni operazione deriva un nuovo generatore dal seme. */
  rngN: number;
  order: string[];
  fighters: Record<string, Fighter>;
  phase: "intro" | "bye" | "bouts" | "pause" | "done";
  turn: number;
  openedAt: number;
  deadline: number;
  /** Istante in cui la regia ha messo in pausa (null = in corso). */
  paused: number | null;
  /** Coppie del turno, in attesa della scelta del giocatore rimasto solo. */
  pairs: [string, string][];
  byeId: string | null;
  byeChoice: "bye" | "npc" | null;
  bouts: Bout[];
  spotlightId: string | null;
  /** Pronostici degli eliminati sullo scontro in evidenza: giocatore → vincitore previsto. */
  predictions: Record<string, string>;
  predictionHits: Record<string, number>;
  finalOrder: string[] | null;
}

// --- utilità di stato ---

/** I numeri del regolamento di questa partita: le regole spiegate nell'app li leggono da qui. */
function rulesOf(cfg: ShadowConfig) {
  const deck = (cards: ShadowConfig["normalDeck"]) => cards.map((c) => ({ label: c.label, qty: c.qty, tokens: c.tokens, nextLives: c.nextLives, either: c.either }));
  return {
    startLives: cfg.startLives,
    maxLives: cfg.maxLives,
    startTokens: cfg.startTokens,
    maxTokens: cfg.maxTokens,
    allStartLoser: cfg.allStartLoser,
    costs: { ...costsOf(cfg), extraLife: cfg.extraLifeCost },
    decks: { normal: deck(cfg.normalDeck), legendary: deck(cfg.legendaryDeck) },
    points: { placement: cfg.placementPoints, placementMin: cfg.placementMin, boutWin: cfg.boutWinPoints, prediction: cfg.predictionPoints },
  };
}

const clone = (s: ShadowState): ShadowState => structuredClone(s);
const nick = (s: ShadowState, id: string): string => (id === NPC ? "NPC" : (s.fighters[id]?.nickname ?? "?"));
const aliveIds = (s: ShadowState): string[] => s.order.filter((id) => s.fighters[id]!.status !== "out");

function makeEnv(s: ShadowState, now: number): Env {
  const rng = makeRng(deriveSeed(s.seed, s.rngN++));
  const maxTokens = s.cfg.maxTokens;
  const wallet: Wallet = {
    tokens: (id) => s.fighters[id]?.tokens ?? 0,
    spend(id, n) {
      const f = s.fighters[id];
      if (f) f.tokens = Math.max(0, f.tokens - n);
    },
    gain(id, n) {
      const f = s.fighters[id];
      if (f) f.tokens = Math.min(maxTokens, Math.max(0, f.tokens + n));
    },
    addNextLives(id, n) {
      const f = s.fighters[id];
      if (f) f.nextLives = Math.max(-3, Math.min(3, f.nextLives + n));
    },
  };
  return { cfg: s.cfg, wallet, rng, now };
}

/** Classifica attuale dal migliore al peggiore: prima chi è ancora in gioco, poi gli eliminati dall'ultimo al primo. */
function standings(s: ShadowState): string[] {
  const f = (id: string) => s.fighters[id]!;
  const alive = aliveIds(s).sort(
    (a, b) =>
      (f(a).status === "W" ? 0 : 1) - (f(b).status === "W" ? 0 : 1) ||
      f(b).boutsWon - f(a).boutsWon ||
      f(b).tokens - f(a).tokens ||
      a.localeCompare(b),
  );
  const out = s.order
    .filter((id) => f(id).status === "out")
    .sort((a, b) => (f(b).outAtTurn ?? 0) - (f(a).outAtTurn ?? 0) || f(b).boutsWon - f(a).boutsWon || a.localeCompare(b));
  return [...alive, ...out];
}

/** Punti di piazzamento: i primi dalla lista, poi a scalare fino al minimo per il primo eliminato. */
export function placementPoints(cfg: ShadowConfig, rank: number, total: number): number {
  const top = cfg.placementPoints;
  if (rank <= top.length) return top[rank - 1]!;
  const last = top[top.length - 1]!;
  if (total <= top.length) return cfg.placementMin;
  const t = (total - rank) / (total - top.length);
  return Math.max(cfg.placementMin, Math.round(cfg.placementMin + (last - cfg.placementMin) * t));
}

function totals(s: ShadowState): Record<string, number> {
  const order = s.finalOrder ?? standings(s);
  return Object.fromEntries(
    order.map((id, i) => [
      id,
      placementPoints(s.cfg, i + 1, order.length) + s.fighters[id]!.boutsWon * s.cfg.boutWinPoints + (s.predictionHits[id] ?? 0) * s.cfg.predictionPoints,
    ]),
  );
}

// --- turni ---

function finish(s: ShadowState, now: number): void {
  s.phase = "done";
  s.openedAt = now;
  s.deadline = now;
  s.finalOrder = standings(s);
}

function startTurn(s: ShadowState, now: number): void {
  if (aliveIds(s).length <= 1 || s.turn >= s.cfg.maxTurns) return finish(s, now);
  s.turn += 1;
  const env = makeEnv(s, now);
  const fighters: PairingFighter[] = aliveIds(s).map((id) => {
    const f = s.fighters[id]!;
    return { id, status: f.status === "L" ? "L" : "W", lastOpponent: f.lastOpponent, oddLastTurn: f.oddLastTurn };
  });
  const { pairs, odd } = pairTurn(fighters, env.rng);
  for (const id of aliveIds(s)) s.fighters[id]!.oddLastTurn = id === odd;
  s.pairs = pairs;
  s.byeId = odd;
  s.byeChoice = null;
  s.bouts = [];
  s.spotlightId = null;
  s.predictions = {};
  if (odd) {
    s.phase = "bye";
    s.openedAt = now;
    s.deadline = now + s.cfg.byeSec * 1000;
  } else {
    startBouts(s, now);
  }
}

function startBouts(s: ShadowState, now: number): void {
  const env = makeEnv(s, now);
  s.phase = "bouts";
  s.bouts = [];
  const make = (a: string, b: string, npcPlayerId: string | null) => {
    const lifeDelta: Record<string, number> = {};
    for (const id of [a, b]) {
      if (id === NPC) continue;
      lifeDelta[id] = s.fighters[id]!.nextLives;
      s.fighters[id]!.nextLives = 0;
      s.fighters[id]!.lastOpponent = id === a ? b : a;
    }
    s.bouts.push(startBout(env, { id: `t${s.turn}-${s.bouts.length + 1}`, a, b, npcPlayerId, lifeDelta }));
  };
  for (const [x, y] of s.pairs) {
    if (s.fighters[x]!.status === "out" || s.fighters[y]!.status === "out") continue; // ritirato nel frattempo
    make(x, y, null);
  }
  if (s.byeId && s.byeChoice === "npc" && s.fighters[s.byeId]!.status !== "out") {
    const free = shuffle(
      s.order.filter((id) => s.fighters[id]!.status === "out" && !s.fighters[id]!.withdrawn),
      env.rng,
    );
    make(s.byeId, NPC, free[0] ?? null);
  }
  // scontro in evidenza: due L, poi il più teso; l'NPC non si pronostica
  const candidates = s.bouts.filter((b) => b.b !== NPC);
  if (candidates.length > 0) {
    const score = (b: Bout) => [b.a, b.b].filter((id) => s.fighters[id]!.status === "L").length * 2 + env.rng();
    s.spotlightId = [...candidates].sort((x, y) => score(y) - score(x))[0]!.id;
  }
  s.predictions = {};
}

/** Applica a W/L e ai punti l'esito degli scontri appena conclusi; poi chiude il turno se sono tutti finiti. */
function settle(s: ShadowState, now: number): void {
  for (const b of s.bouts) {
    if (b.winnerId === null || b.settled) continue;
    b.settled = true;
    if (b.loserId && b.loserId !== NPC) {
      const f = s.fighters[b.loserId]!;
      if (f.status === "W") f.status = "L";
      else if (f.status === "L") {
        f.status = "out";
        f.outAtTurn = s.turn;
      }
    }
    if (b.winnerId !== NPC) s.fighters[b.winnerId]!.boutsWon += 1;
    if (b.id === s.spotlightId) {
      for (const [pid, guess] of Object.entries(s.predictions)) {
        if (guess === b.winnerId) s.predictionHits[pid] = (s.predictionHits[pid] ?? 0) + 1;
      }
    }
  }
  if (s.phase === "bouts" && s.bouts.every((b) => b.phase === "done")) {
    if (aliveIds(s).length <= 1 || s.turn >= s.cfg.maxTurns) finish(s, now);
    else {
      s.phase = "pause";
      s.openedAt = now;
      s.deadline = now + s.cfg.turnPauseSec * 1000;
    }
  }
}

function decideBye(s: ShadowState, choice: "bye" | "npc", now: number): void {
  s.byeChoice = choice;
  startBouts(s, now);
  settle(s, now);
}

/** Fa avanzare tutto ciò che è scaduto. */
function step(s: ShadowState, now: number): void {
  if (s.phase === "bye" && now >= s.deadline + GRACE_MS) decideBye(s, "bye", now);
  else if ((s.phase === "pause" || s.phase === "intro") && now >= s.deadline) {
    startTurn(s, now);
    settle(s, now);
  }
  if (s.phase === "bouts") {
    for (const b of s.bouts) {
      if (boutDue(b, now)) advanceBout(b, makeEnv(s, now));
    }
    settle(s, now);
  }
}

const isDue = (s: ShadowState, now: number): boolean =>
  s.phase === "bye"
    ? now >= s.deadline + GRACE_MS
    : s.phase === "pause" || s.phase === "intro"
      ? now >= s.deadline
      : s.phase === "bouts" && s.bouts.some((b) => boutDue(b, now));

/** Lo scontro in cui è il giocatore: come giocatore, oppure come NPC. */
function boutOf(s: ShadowState, playerId: string): { bout: Bout; side: string } | null {
  for (const bout of s.bouts) {
    if (hasSide(bout, playerId)) return { bout, side: playerId };
    if (bout.npcPlayerId === playerId) return { bout, side: NPC };
  }
  return null;
}

function shiftTimes(s: ShadowState, delta: number): void {
  s.openedAt += delta;
  s.deadline += delta;
  for (const b of s.bouts) {
    b.openedAt += delta;
    b.deadline += delta;
  }
}

// --- viste ---

function sideView(s: ShadowState, b: Bout, id: string) {
  const f = id === NPC ? null : s.fighters[id]!;
  return {
    id,
    nickname: nick(s, id),
    status: f?.status ?? ("L" as FighterStatus),
    tokens: f?.tokens ?? 0,
    lives: b.lives[id]!,
    extraLife: b.extraSpent[id] === true,
    blocked: b.blocked[id] ?? null,
    // le scelte segrete non escono mai: si sa solo chi ha già deciso
    picked: b.phase === "choose" ? !!b.picks[id] : false,
    reacted: b.phase === "react" ? !!b.reacts[id] : false,
  };
}

function boutView(s: ShadowState, b: Bout) {
  return {
    id: b.id,
    phase: b.phase,
    openedAt: b.openedAt,
    deadline: b.deadline,
    exchanges: b.exchanges,
    sides: [sideView(s, b, b.a), sideView(s, b, b.b)],
    npcPlayer: b.npcPlayerId ? nick(s, b.npcPlayerId) : null,
    reveal: b.reveal,
    waitingReact: b.phase === "react" ? b.eligible.filter((id) => !b.reacts[id]).length : 0,
    swapBy: b.swapBy,
    counterBy: b.counterBy,
    last: b.last,
    winnerId: b.winnerId,
    loserId: b.loserId,
    reward: b.reward,
    spotlight: b.id === s.spotlightId,
  };
}

/** Lo scontro da mostrare in grande: quello in evidenza, o il più avanzato tra quelli ancora in corso. */
function focusBout(s: ShadowState): Bout | null {
  const spot = s.bouts.find((b) => b.id === s.spotlightId);
  if (spot && spot.phase !== "done") return spot;
  const running = s.bouts.filter((b) => b.phase !== "done");
  const lowest = (b: Bout) => Math.min(...Object.values(b.lives));
  return [...running].sort((x, y) => lowest(x) - lowest(y))[0] ?? spot ?? null;
}

function fightersView(s: ShadowState) {
  return s.order.map((id) => {
    const f = s.fighters[id]!;
    return { id, nickname: f.nickname, status: f.status, tokens: f.tokens, boutsWon: f.boutsWon };
  });
}

function podium(s: ShadowState) {
  const order = s.finalOrder ?? standings(s);
  const pts = totals(s);
  return order.map((id, i) => ({ id, nickname: nick(s, id), rank: i + 1, points: pts[id] ?? 0, boutsWon: s.fighters[id]!.boutsWon }));
}

function pausedOrNull(s: ShadowState) {
  return s.paused !== null;
}

export const shadowTournament: MinigameType<ShadowConfig, ShadowState, Input, Command> = {
  id: "shadow-tournament",
  title: "Shadow Tournament (torneo a eliminazione)",
  defaultTheme: "manga",
  configSchema: shadowConfigSchema as unknown as z.ZodType<ShadowConfig>,
  inputSchema,
  commandSchema,
  sampleConfig: sampleShadowConfig,

  init(config, ctx, now) {
    const fighters: Record<string, Fighter> = {};
    for (const p of ctx.players) {
      fighters[p.id] = {
        id: p.id,
        nickname: p.nickname,
        teamId: p.teamId,
        status: config.allStartLoser ? "L" : "W",
        tokens: config.startTokens,
        nextLives: 0,
        lastOpponent: null,
        oddLastTurn: false,
        boutsWon: 0,
        outAtTurn: null,
        withdrawn: false,
      };
    }
    const s: ShadowState = {
      cfg: config,
      seed: ctx.seed,
      rngN: 0,
      order: ctx.players.map((p) => p.id),
      fighters,
      phase: "pause",
      turn: 0,
      openedAt: now,
      deadline: now,
      paused: null,
      pairs: [],
      byeId: null,
      byeChoice: null,
      bouts: [],
      spotlightId: null,
      predictions: {},
      predictionHits: {},
      finalOrder: null,
    };
    if (config.introSec > 0) {
      s.phase = "intro";
      s.deadline = now + config.introSec * 1000;
    } else {
      startTurn(s, now);
      settle(s, now);
    }
    return s;
  },

  onInput(state, playerId, input, meta) {
    const f = state.fighters[playerId];
    if (!f || state.paused !== null) return state;
    const now = meta.receivedAt;

    if (input.type === "predict") {
      const spot = state.bouts.find((b) => b.id === state.spotlightId);
      const open = spot && spot.exchanges === 0 && (spot.phase === "extraLife" || spot.phase === "choose");
      if (state.phase !== "bouts" || !open || f.status !== "out") return state;
      if (boutOf(state, playerId) || (input.winnerId !== spot.a && input.winnerId !== spot.b)) return state;
      const next = clone(state);
      next.predictions[playerId] = input.winnerId;
      return next;
    }

    if (input.type === "byeChoice") {
      if (state.phase !== "bye" || state.byeId !== playerId || now > state.deadline + GRACE_MS) return state;
      const next = clone(state);
      decideBye(next, input.choice, now);
      return next;
    }

    const found = boutOf(state, playerId);
    if (!found || !acceptsInput(found.bout, now)) return state;
    const next = clone(state);
    const bout = next.bouts.find((b) => b.id === found.bout.id)!;
    const side = found.side;
    const env = makeEnv(next, now);
    switch (input.type) {
      case "extraLife":
        setExtraLife(bout, env, side, input.spend);
        break;
      case "play":
        play(bout, env, side, input.card, input.bet ?? false);
        break;
      case "react":
        if (bout.phase === "counter") counter(bout, env, side, input.action === "counter");
        else if (input.action === "swap") {
          if (input.card) react(bout, env, side, { action: "swap", card: input.card });
        } else if (input.action !== "counter") react(bout, env, side, { action: input.action });
        break;
      case "deck":
        chooseDeck(bout, env, side, input.deck);
        break;
      case "riskChoice":
        riskChoice(bout, env, side, input.pay);
        break;
    }
    settle(next, now);
    return next;
  },

  onTick(state, now) {
    if (state.paused !== null || !isDue(state, now)) return state;
    const next = clone(state);
    step(next, now);
    return next;
  },

  onHostCommand(state, command, now) {
    const type = command.type;
    if (state.phase === "done") return state;
    if (type === "pause") {
      const next = clone(state);
      if (next.paused === null) next.paused = now;
      else {
        shiftTimes(next, now - next.paused);
        next.paused = null;
      }
      return next;
    }
    if (type === "end") {
      const next = clone(state);
      finish(next, now);
      return next;
    }
    if (type === "skip") {
      const next = clone(state);
      next.deadline = Math.min(next.deadline, now - GRACE_MS - 1);
      for (const b of next.bouts) b.deadline = Math.min(b.deadline, now - GRACE_MS - 1);
      step(next, now);
      return next;
    }
    if (type.startsWith("withdraw:")) {
      const id = type.slice("withdraw:".length);
      const f = state.fighters[id];
      if (!f || f.status === "out") return state;
      const next = clone(state);
      const env = makeEnv(next, now);
      const found = boutOf(next, id);
      if (found && found.side !== NPC) forfeit(found.bout, env, id);
      if (next.byeId === id && next.phase === "bye") next.byeChoice = "bye";
      next.fighters[id]!.status = "out";
      next.fighters[id]!.outAtTurn = next.turn;
      next.fighters[id]!.withdrawn = true;
      if (next.phase === "bye" && next.byeId === id) startBouts(next, now);
      settle(next, now);
      return next;
    }
    return state;
  },

  isFinished: (state) => state.phase === "done",

  result: (state): RoundResult => rankByPoints(totals(state), state.order),

  scores(state): ScoreDelta[] {
    return Object.entries(totals(state))
      .filter(([, points]) => points !== 0)
      .map(([playerId, points]) => ({ playerId, teamId: null, points, reason: "Shadow Tournament" }));
  },

  // Solo informazioni pubbliche: carte, Scommesse, vite extra e reazioni scelte restano nello stato fino alla rivelazione.
  screenView(state) {
    const focus = focusBout(state);
    const bye = state.byeId ? { id: state.byeId, nickname: nick(state, state.byeId), choice: state.byeChoice } : null;
    return {
      phase: state.phase,
      turn: state.turn,
      paused: pausedOrNull(state),
      openedAt: state.openedAt,
      deadline: state.deadline,
      alive: aliveIds(state).length,
      total: state.order.length,
      fighters: fightersView(state),
      bye,
      bouts: state.bouts.map((b) => boutView(state, b)),
      focusId: focus?.id ?? null,
      costs: costsOf(state.cfg),
      rules: state.phase === "intro" ? rulesOf(state.cfg) : null,
      podium: state.phase === "done" ? podium(state) : null,
    };
  },

  viewFor(state, playerId) {
    const f = state.fighters[playerId];
    const common = {
      phase: state.phase,
      turn: state.turn,
      paused: pausedOrNull(state),
      openedAt: state.openedAt,
      deadline: state.deadline,
      alive: aliveIds(state).length,
      total: state.order.length,
      costs: { ...costsOf(state.cfg), extraLife: state.cfg.extraLifeCost },
      maxTokens: state.cfg.maxTokens,
      rules: rulesOf(state.cfg),
    };
    if (!f) return { ...common, role: "spectator" as const };
    const me = { id: f.id, nickname: f.nickname, status: f.status, tokens: f.tokens, nextLives: f.nextLives, boutsWon: f.boutsWon, hits: state.predictionHits[f.id] ?? 0 };

    if (state.phase === "done") {
      const pod = podium(state);
      return { ...common, role: "done" as const, me, podium: pod, myRank: pod.find((p) => p.id === f.id)?.rank ?? null, myPoints: pod.find((p) => p.id === f.id)?.points ?? 0 };
    }

    const found = boutOf(state, playerId);
    if (found) {
      const { bout, side } = found;
      const asNpc = side === NPC;
      const mine = bout.picks[side];
      const eligibleExtra = bout.phase === "extraLife" && !asNpc && f.tokens >= state.cfg.extraLifeCost;
      return {
        ...common,
        role: "bout" as const,
        me,
        asNpc,
        mySide: side,
        opponentId: otherSide(bout, side),
        bout: boutView(state, bout),
        my: {
          pick: mine ?? null,
          canBet: !asNpc && f.tokens >= state.cfg.betCost,
          blockedCard: bout.blocked[side] ?? null,
          canExtraLife: eligibleExtra && !(side in bout.extra),
          extraDecided: eligibleExtra && side in bout.extra ? bout.extra[side] : null,
          reactions: reactionsFor(bout, state.cfg, f.tokens, side),
          swapCards: swapCards(bout, side),
          reacted: !!bout.reacts[side],
          canCounter: bout.phase === "counter" && bout.counterBy === side,
          counterCost: state.cfg.counterCost,
          wonBout: bout.winnerId === null ? null : bout.winnerId === side,
          canChooseDeck: bout.phase === "reward" && bout.winnerId === side,
          riskChoice: bout.phase === "risk" && bout.winnerId === side ? { tokens: bout.reward?.tokens ?? 0, nextLives: bout.reward?.nextLives ?? 0, canPayTokens: f.tokens + (bout.reward?.tokens ?? 0) >= 0 } : null,
        },
      };
    }

    if (state.phase === "bye" && state.byeId === playerId) return { ...common, role: "bye" as const, me };

    if (f.status === "out") {
      const spot = state.bouts.find((b) => b.id === state.spotlightId);
      const canPredict = state.phase === "bouts" && !!spot && spot.exchanges === 0 && (spot.phase === "extraLife" || spot.phase === "choose");
      return {
        ...common,
        role: "out" as const,
        me,
        spotlight: spot ? boutView(state, spot) : null,
        canPredict,
        prediction: state.predictions[playerId] ?? null,
      };
    }
    return {
      ...common,
      role: "wait" as const,
      me,
      byeNow: state.byeId === playerId ? (state.byeChoice ?? "bye") : null,
      bye: state.byeId ? { id: state.byeId, nickname: nick(state, state.byeId) } : null,
    };
  },

  hostView(state) {
    const live = state.phase !== "done";
    return {
      info: {
        phase: state.phase,
        turn: state.turn,
        paused: state.paused !== null,
        alive: aliveIds(state).length,
        total: state.order.length,
        fighters: fightersView(state),
        // la regia vede anche le scelte segrete
        bouts: state.bouts.map((b) => ({ ...boutView(state, b), picks: b.picks, extra: b.extra, reacts: b.reacts })),
      },
      actions: [
        { id: "skip", label: "Salta timer", enabled: live },
        { id: "pause", label: state.paused !== null ? "Riprendi" : "Pausa", enabled: live },
        { id: "end", label: "Termina torneo (podio attuale)", enabled: live, danger: true },
        ...(live
          ? aliveIds(state).map((id) => ({ id: `withdraw:${id}`, label: `Ritira ${nick(state, id)}`, enabled: true, danger: true }))
          : []),
      ],
    };
  },
};
