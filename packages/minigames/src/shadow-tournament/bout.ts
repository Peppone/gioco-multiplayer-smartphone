import { shuffle } from "../knight-duel/rng.js";
import { GRACE_MS } from "../util.js";
import type { ShadowConfig } from "./config.js";
import {
  type Action,
  CARDS,
  type Card,
  type Costs,
  type Reaction,
  type Result,
  availableReactions,
  canCounter,
  outcome,
  resolveExchange,
} from "./exchange.js";
import { type DeckName, canPayTokens, deckOf, drawCard, effectOf } from "./rewards.js";

/**
 * Lo scontro tra due giocatori (o tra un giocatore e l'NPC). Le funzioni di questo file MODIFICANO l'oggetto
 * ricevuto: il plugin le chiama sempre su una copia di lavoro dello stato, così le funzioni del plugin restano pure.
 */

/** Id del lato «NPC» di uno scontro. */
export const NPC = "npc";

export type BoutPhase = "extraLife" | "choose" | "react" | "counter" | "show" | "reward" | "risk" | "done";

/** Le fasi in cui si aspettano gli input dei giocatori (la scadenza ha un margine di tolleranza). */
const INPUT_PHASES: BoutPhase[] = ["extraLife", "choose", "react", "counter", "reward", "risk"];

export interface Pick {
  card: Card;
  bet: boolean;
}

export interface Reveal {
  cards: Record<string, Card>;
  bets: Record<string, boolean>;
  /** Vincitore dello scambio prima delle reazioni (null = pareggio). */
  winnerId: string | null;
}

export interface LastExchange {
  /** Carte finali (dopo l'eventuale Cambia carta). */
  cards: Record<string, Card>;
  winnerId: string | null;
  loss: number;
  shielded: boolean;
  /** Scambio annullato dalla contromossa. */
  replay: boolean;
  actions: Record<string, Action | "counter">;
}

export interface RewardInfo {
  deck: DeckName;
  label: string;
  tokens: number;
  nextLives: number;
  either: boolean;
}

export interface Bout {
  id: string;
  a: string;
  /** Id del secondo giocatore, oppure `NPC`. */
  b: string;
  npcPlayerId: string | null;
  phase: BoutPhase;
  openedAt: number;
  deadline: number;
  lives: Record<string, number>;
  /** Vite extra decise (segrete finché la fase non finisce). */
  extra: Record<string, boolean>;
  extraSpent: Record<string, boolean>;
  /** Scambi conclusi (i pareggi e quelli annullati non contano). */
  exchanges: number;
  /** Scelte segrete dello scambio in corso: si svuotano alla rivelazione. */
  picks: Record<string, Pick>;
  reveal: Reveal | null;
  reacts: Record<string, Reaction>;
  /** Chi deve ancora reagire (o ha già reagito) in questa fase. */
  eligible: string[];
  counterBy: string | null;
  swapBy: string | null;
  /** La carta che ciascuno non può usare nello scambio in corso (Trappola dell'avversario). */
  blocked: Record<string, Card | null>;
  last: LastExchange | null;
  winnerId: string | null;
  loserId: string | null;
  reward: RewardInfo | null;
  /** Gli effetti di status e punti del vincitore sono già stati applicati dal plugin. */
  settled: boolean;
}

/** Accesso ai token e agli effetti sul prossimo scontro dei giocatori (l'NPC non ha nulla). */
export interface Wallet {
  tokens(id: string): number;
  spend(id: string, amount: number): void;
  gain(id: string, amount: number): void;
  addNextLives(id: string, amount: number): void;
}

export interface Env {
  cfg: ShadowConfig;
  wallet: Wallet;
  rng: () => number;
  now: number;
}

export const costsOf = (cfg: ShadowConfig): Costs => ({
  bet: cfg.betCost,
  shield: cfg.shieldCost,
  trap: cfg.trapCost,
  swap: cfg.swapCost,
  counter: cfg.counterCost,
});

const sidesOf = (b: Bout): [string, string] => [b.a, b.b];
export const otherSide = (b: Bout, side: string): string => (side === b.a ? b.b : b.a);
export const hasSide = (b: Bout, side: string): boolean => side === b.a || side === b.b;
const tokensOf = (env: Env, side: string): number => (side === NPC ? 0 : env.wallet.tokens(side));

export function boutDue(b: Bout, now: number): boolean {
  if (b.phase === "done") return false;
  return now >= b.deadline + (INPUT_PHASES.includes(b.phase) ? GRACE_MS : 0);
}

/** L'input arrivato a `receivedAt` è ancora valido per la fase in corso. */
export const acceptsInput = (b: Bout, receivedAt: number): boolean => INPUT_PHASES.includes(b.phase) && receivedAt <= b.deadline + GRACE_MS;

const allowedCards = (b: Bout, side: string): Card[] => CARDS.filter((c) => c !== b.blocked[side]);

function randomCard(b: Bout, side: string, rng: () => number): Card {
  return shuffle(allowedCards(b, side), rng)[0]!;
}

function resultFor(reveal: Reveal, side: string): Result {
  return reveal.winnerId === null ? "draw" : reveal.winnerId === side ? "win" : "lose";
}

function setPhase(b: Bout, phase: BoutPhase, env: Env, seconds: number): void {
  b.phase = phase;
  b.openedAt = env.now;
  b.deadline = env.now + seconds * 1000;
}

/** `lifeDelta`: effetti delle carte ricompensa sul prossimo scontro, già consumati dal chiamante. */
export function startBout(
  env: Env,
  spec: { id: string; a: string; b: string; npcPlayerId: string | null; lifeDelta: Record<string, number> },
): Bout {
  const { cfg } = env;
  const lives = (side: string) =>
    side === NPC ? cfg.startLives : Math.min(cfg.maxLives, Math.max(1, cfg.startLives + (spec.lifeDelta[side] ?? 0)));
  const b: Bout = {
    id: spec.id,
    a: spec.a,
    b: spec.b,
    npcPlayerId: spec.npcPlayerId,
    phase: "choose",
    openedAt: env.now,
    deadline: env.now,
    lives: { [spec.a]: lives(spec.a), [spec.b]: lives(spec.b) },
    extra: {},
    extraSpent: {},
    exchanges: 0,
    picks: {},
    reveal: null,
    reacts: {},
    eligible: [],
    counterBy: null,
    swapBy: null,
    blocked: { [spec.a]: null, [spec.b]: null },
    last: null,
    winnerId: null,
    loserId: null,
    reward: null,
    settled: false,
  };
  if (extraLifeVoters(b, env).length > 0) setPhase(b, "extraLife", env, cfg.extraLifeSec);
  else beginChoose(b, env);
  return b;
}

// --- vita extra ---

const extraLifeVoters = (b: Bout, env: Env): string[] =>
  sidesOf(b).filter((s) => s !== NPC && tokensOf(env, s) >= env.cfg.extraLifeCost);

export function setExtraLife(b: Bout, env: Env, side: string, spend: boolean): void {
  if (b.phase !== "extraLife" || !extraLifeVoters(b, env).includes(side) || side in b.extra) return;
  b.extra[side] = spend;
  if (extraLifeVoters(b, env).every((s) => s in b.extra)) resolveExtraLife(b, env);
}

function resolveExtraLife(b: Bout, env: Env): void {
  for (const s of extraLifeVoters(b, env)) {
    if (!b.extra[s]) continue;
    env.wallet.spend(s, env.cfg.extraLifeCost);
    b.lives[s] = Math.min(env.cfg.maxLives, b.lives[s]! + 1);
    b.extraSpent[s] = true;
  }
  b.extra = {};
  beginChoose(b, env);
}

// --- scelta della carta ---

function beginChoose(b: Bout, env: Env): void {
  setPhase(b, "choose", env, env.cfg.chooseSec);
  b.picks = {};
  b.reveal = null;
  b.reacts = {};
  b.eligible = [];
  b.last = null;
  // senza un giocatore eliminato a interpretarlo, l'NPC gioca il computer
  if (b.b === NPC && b.npcPlayerId === null) b.picks[NPC] = { card: randomCard(b, NPC, env.rng), bet: false };
}

export function play(b: Bout, env: Env, side: string, card: Card, bet: boolean): void {
  if (b.phase !== "choose" || !hasSide(b, side)) return;
  if (b.blocked[side] === card) return;
  const wantsBet = bet && side !== NPC && tokensOf(env, side) >= env.cfg.betCost;
  b.picks[side] = { card, bet: wantsBet };
  if (sidesOf(b).every((s) => b.picks[s])) revealExchange(b, env);
}

function revealExchange(b: Bout, env: Env): void {
  const [sa, sb] = sidesOf(b);
  for (const s of [sa, sb]) b.picks[s] ??= { card: randomCard(b, s, env.rng), bet: false };
  const cards: Record<string, Card> = {};
  const bets: Record<string, boolean> = {};
  for (const s of [sa, sb]) {
    const p = b.picks[s]!;
    const pays = p.bet && s !== NPC && tokensOf(env, s) >= env.cfg.betCost;
    if (pays) env.wallet.spend(s, env.cfg.betCost);
    cards[s] = p.card;
    bets[s] = pays;
  }
  const w = outcome(cards[sa]!, cards[sb]!);
  b.reveal = { cards, bets, winnerId: w === null ? null : sidesOf(b)[w] };
  b.picks = {};
  b.reacts = {};
  const costs = costsOf(env.cfg);
  b.eligible = sidesOf(b).filter(
    (s) => s !== NPC && availableReactions({ tokens: tokensOf(env, s), bet: bets[s]!, result: resultFor(b.reveal!, s), costs }).length > 0,
  );
  if (b.eligible.length === 0) applyExchange(b, env, null);
  else setPhase(b, "react", env, env.cfg.reactSec);
}

// --- reazioni ---

/** Le reazioni che `side` può scegliere ora (per le viste e per la validazione). */
export function reactionsFor(b: Bout, cfg: ShadowConfig, tokens: number, side: string): Action[] {
  if (b.phase !== "react" || !b.reveal || !b.eligible.includes(side)) return [];
  return availableReactions({ tokens, bet: b.reveal.bets[side] ?? false, result: resultFor(b.reveal, side), costs: costsOf(cfg) });
}

/** Carte in cui `side` può cambiare quella giocata (non la stessa, non quella bloccata). */
export function swapCards(b: Bout, side: string): Card[] {
  const played = b.reveal?.cards[side];
  return allowedCards(b, side).filter((c) => c !== played);
}

export function react(b: Bout, env: Env, side: string, reaction: Reaction): void {
  if (b.phase !== "react" || !b.eligible.includes(side) || b.reacts[side]) return;
  if (reaction.action !== "pass") {
    if (!reactionsFor(b, env.cfg, tokensOf(env, side), side).includes(reaction.action)) return;
    if (reaction.action === "swap" && !swapCards(b, side).includes(reaction.card)) return;
  }
  b.reacts[side] = reaction;
  if (b.eligible.every((s) => b.reacts[s])) finishReact(b, env);
}

function finishReact(b: Bout, env: Env): void {
  const reveal = b.reveal!;
  const swapper = sidesOf(b).find((s) => b.reacts[s]?.action === "swap");
  if (swapper) {
    const opp = otherSide(b, swapper);
    const acted = (b.reacts[opp]?.action ?? "pass") !== "pass";
    if (opp !== NPC && canCounter({ tokens: tokensOf(env, opp), bet: reveal.bets[opp] ?? false, acted, costs: costsOf(env.cfg) })) {
      b.counterBy = opp;
      b.swapBy = swapper;
      setPhase(b, "counter", env, env.cfg.reactSec);
      return;
    }
  }
  applyExchange(b, env, null);
}

export function counter(b: Bout, env: Env, side: string, yes: boolean): void {
  if (b.phase !== "counter" || b.counterBy !== side) return;
  applyExchange(b, env, yes ? side : null);
}

function applyExchange(b: Bout, env: Env, counterSide: string | null): void {
  const [sa, sb] = sidesOf(b);
  const reveal = b.reveal!;
  const reactions: [Reaction, Reaction] = [b.reacts[sa] ?? { action: "pass" }, b.reacts[sb] ?? { action: "pass" }];
  const res = resolveExchange({
    cards: [reveal.cards[sa]!, reveal.cards[sb]!],
    bets: [reveal.bets[sa] ?? false, reveal.bets[sb] ?? false],
    reactions,
    counter: counterSide === null ? null : counterSide === sa ? 0 : 1,
    costs: costsOf(env.cfg),
  });
  sidesOf(b).forEach((s, i) => {
    if (res.spent[i]! > 0 && s !== NPC) env.wallet.spend(s, res.spent[i]!);
  });
  const actions: Record<string, Action | "counter"> = {};
  sidesOf(b).forEach((s, i) => {
    const r = reactions[i]!;
    if (r.action !== "pass") actions[s] = r.action;
  });
  if (counterSide) actions[counterSide] = "counter";

  if (res.replay) {
    b.last = { cards: { ...reveal.cards }, winnerId: null, loss: 0, shielded: false, replay: true, actions };
  } else {
    const winnerId = res.winner === null ? null : sidesOf(b)[res.winner]!;
    if (winnerId !== null) {
      const loser = otherSide(b, winnerId);
      b.lives[loser] = Math.max(0, b.lives[loser]! - res.loss);
    }
    b.blocked = { [sa]: res.blocked[0], [sb]: res.blocked[1] };
    b.exchanges += 1;
    b.last = { cards: { [sa]: res.cards[0], [sb]: res.cards[1] }, winnerId, loss: res.loss, shielded: res.shielded, replay: false, actions };
  }
  b.reveal = null;
  b.reacts = {};
  b.eligible = [];
  b.counterBy = null;
  b.swapBy = null;
  setPhase(b, "show", env, env.cfg.showSec);
}

// --- fine scontro e ricompensa ---

function finishBout(b: Bout, env: Env): void {
  const loser = sidesOf(b).find((s) => b.lives[s]! <= 0)!;
  b.loserId = loser;
  b.winnerId = otherSide(b, loser);
  b.reveal = null;
  b.picks = {};
  if (b.winnerId === NPC) setPhase(b, "done", env, 0);
  else setPhase(b, "reward", env, env.cfg.rewardSec);
}

/** Il giocatore si ritira (o la regia lo ritira): perde lo scontro in corso. */
export function forfeit(b: Bout, env: Env, side: string): void {
  if (!hasSide(b, side) || side === NPC || b.winnerId !== null) return;
  b.lives[side] = 0;
  finishBout(b, env);
}

export function chooseDeck(b: Bout, env: Env, side: string, deck: DeckName): void {
  if (b.phase !== "reward" || b.winnerId !== side || side === NPC) return;
  const card = drawCard(deckOf(env.cfg, deck), env.rng);
  b.reward = { deck, label: card.label, tokens: card.tokens, nextLives: card.nextLives, either: card.either };
  const hasChoice = card.either && card.tokens !== 0 && card.nextLives !== 0 && canPayTokens(card, tokensOf(env, side));
  if (hasChoice) setPhase(b, "risk", env, env.cfg.rewardSec);
  else applyReward(b, env, "tokens");
}

export function riskChoice(b: Bout, env: Env, side: string, pay: "tokens" | "life"): void {
  if (b.phase !== "risk" || b.winnerId !== side) return;
  applyReward(b, env, pay);
}

function applyReward(b: Bout, env: Env, pay: "tokens" | "life"): void {
  const r = b.reward!;
  const eff = effectOf({ label: r.label, qty: 1, tokens: r.tokens, nextLives: r.nextLives, either: r.either }, pay, tokensOf(env, b.winnerId!));
  env.wallet.gain(b.winnerId!, eff.tokens);
  env.wallet.addNextLives(b.winnerId!, eff.nextLives);
  b.reward = { ...r, tokens: eff.tokens, nextLives: eff.nextLives, either: false };
  setPhase(b, "done", env, 0);
}

// --- scadenze ---

/** Chiamata quando la fase in corso è scaduta: applica i valori predefiniti. */
export function advanceBout(b: Bout, env: Env): void {
  switch (b.phase) {
    case "extraLife":
      resolveExtraLife(b, env);
      break;
    case "choose":
      revealExchange(b, env);
      break;
    case "react":
      finishReact(b, env);
      break;
    case "counter":
      applyExchange(b, env, null);
      break;
    case "show":
      if (Object.values(b.lives).some((l) => l <= 0)) finishBout(b, env);
      else beginChoose(b, env);
      break;
    case "reward":
      chooseDeck(b, env, b.winnerId!, "normal");
      break;
    case "risk":
      applyReward(b, env, "tokens");
      break;
    case "done":
      break;
  }
}
