import { z } from "zod";
import type { MinigameType, ParticipantInfo } from "@gioco/shared";
import { makeRng, shuffle, deriveSeed } from "../knight-duel/rng.js";
import { GRACE_MS, addTo, rankByPoints, totalsToScores } from "../util.js";

/**
 * Zombie Hunt (ispirato ad Alice in Borderland, stagione 3).
 * Le carte hanno un seme (0 ♠, 1 ♥, 2 ♦, 3 ♣) e un valore. Ogni turno ha un seme pubblico, annunciato con un
 * turno di anticipo: chi ha carte di quel seme DEVE giocarne una, e una carta del seme del turno batte
 * qualunque carta di un altro seme (a parità di seme vince il valore più alto).
 * I giocatori vivi sono accoppiati a caso e scelgono in segreto una carta, il fucile o il vaccino.
 * Gli zombie sono segreti e ogni turno scelgono: mordere (infettano chi non spara né vaccina) oppure
 * mimetizzarsi giocando una carta come un umano. Non sono obbligati a mordere.
 * Il fucile (pochi, segreti) abbatte uno zombie e il vaccino lo cura; usati contro un umano costano caro:
 * si perde il duello, si cedono più carte e si perdono punti.
 * Alla fine vince la fazione con più sopravvissuti.
 */

export const SUITS = 4;
const MAX_ROUNDS = 30;

export const zombieHuntConfigSchema = z
  .object({
    rounds: z
      .number()
      .int()
      .min(0)
      .max(30)
      .default(0)
      .meta({ title: "Turni", description: "0 = automatico (poco più di log2 di giocatori/zombie: più turni favoriscono gli zombie). Alla fine vince la fazione con più sopravvissuti" }),
    turnSec: z.number().int().min(5).max(120).default(25).meta({ title: "Tempo per scegliere (s)" }),
    revealSec: z.number().int().min(2).max(20).default(6).meta({ title: "Pausa dopo la rivelazione (s)", description: "Poi si passa da soli al turno successivo" }),
    cardsPerPlayer: z.number().int().min(2).max(12).default(7).meta({ title: "Carte a testa", description: "Pescate a caso da un mazzo con 4 semi (♠ ♥ ♦ ♣)" }),
    maxCard: z.number().int().min(2).max(20).default(10).meta({ title: "Valore massimo delle carte", description: "Ogni seme va da 1 a questo valore" }),
    zombieCount: z.number().int().min(1).max(10).default(2).meta({ title: "Zombie iniziali", description: "Scelti a caso e segreti. Al massimo la metà dei giocatori." }),
    vaccineCount: z.number().int().min(0).max(30).default(0).meta({ title: "Vaccini", description: "0 = automatico (circa uno ogni 5 giocatori). Distribuiti a caso tra gli umani" }),
    shotgunCount: z
      .number()
      .int()
      .min(0)
      .max(30)
      .default(0)
      .meta({ title: "Fucili", description: "0 = automatico (circa uno ogni 3 giocatori). Distribuiti a caso tra gli umani, ognuno sa solo se ha il proprio" }),
    missCards: z.number().int().min(1).max(6).default(3).meta({ title: "Carte cedute se spari o vaccini un umano", description: "Il fucile o il vaccino usati a vuoto fanno perdere il duello e cedere questo numero di carte all'avversario" }),
    missPoints: z.number().int().min(0).max(10_000).default(50).meta({ title: "Penalità di punti per un colpo a vuoto" }),
    duelPoints: z.number().int().min(0).max(10_000).default(20).meta({ title: "Punti per un duello vinto tra umani" }),
    infectionPoints: z.number().int().min(0).max(10_000).default(100).meta({ title: "Punti per ogni infezione (zombie)" }),
    shotPoints: z.number().int().min(0).max(10_000).default(100).meta({ title: "Punti per ogni zombie abbattuto" }),
    curePoints: z.number().int().min(0).max(10_000).default(100).meta({ title: "Punti per ogni zombie curato" }),
    winPoints: z.number().int().min(0).max(10_000).default(300).meta({ title: "Punti ai sopravvissuti della fazione vincente", description: "In caso di parità si dividono a metà" }),
  })
  .refine((c) => c.maxCard >= 2, { message: "Servono almeno due valori", path: ["maxCard"] });

export type ZombieHuntConfig = z.infer<typeof zombieHuntConfigSchema>;

const inputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("play"), suit: z.number().int().min(0).max(SUITS - 1), value: z.number().int().min(1).max(20) }),
  z.object({ type: z.literal("shotgun") }),
  z.object({ type: z.literal("vaccine") }),
  z.object({ type: z.literal("bite") }),
]);
const commandSchema = z.object({ type: z.literal("next") });
type Input = z.infer<typeof inputSchema>;
type Command = z.infer<typeof commandSchema>;

export type Role = "human" | "zombie" | "out";
export interface Card {
  suit: number;
  value: number;
}
export type Choice = ({ kind: "card" } & Card) | { kind: "shotgun" } | { kind: "vaccine" } | { kind: "bite" };

export type Outcome = "win" | "lose" | "draw" | "bye" | "bitten" | "bit" | "shot" | "killed" | "cure" | "healed" | "quiet";

/** Esito privato di un giocatore nel turno (lo vede solo lui). */
export interface PlayerEvent {
  outcome: Outcome;
  opponent: string | null;
  mine: Choice | null;
  theirs: Choice | null;
  /** Carta presa (win) o persa (lose); se sono più di una, la prima. */
  card: Card | null;
  /** Quante carte sono passate di mano (win/lose). */
  count: number;
  points: number;
}

interface Hero {
  role: Role;
  cards: Card[];
  shotgun: boolean;
  vaccine: boolean;
}

export interface TurnSummary {
  infected: number;
  shot: number;
  cured: number;
  eliminated: number;
}

export interface ZombieHuntState {
  cfg: ZombieHuntConfig;
  seed: number;
  participants: ParticipantInfo[];
  heroes: Record<string, Hero>;
  phase: "play" | "reveal" | "done";
  round: number;
  /** Seme di ogni turno (pubblico, annunciato con un turno di anticipo). */
  suits: number[];
  pairs: [string, string][];
  bye: string | null;
  choices: Record<string, Choice>;
  events: Record<string, PlayerEvent>;
  summary: TurnSummary;
  openedAt: number;
  deadline: number;
  revealUntil: number;
  totals: Record<string, number>;
  winner: "humans" | "zombies" | "draw" | null;
}

const EMPTY_SUMMARY: TurnSummary = { infected: 0, shot: 0, cured: 0, eliminated: 0 };

const aliveIds = (s: ZombieHuntState) => s.participants.map((p) => p.id).filter((id) => s.heroes[id]!.role !== "out");
const withRole = (s: ZombieHuntState, role: Role) => s.participants.map((p) => p.id).filter((id) => s.heroes[id]!.role === role);
const nick = (s: ZombieHuntState, id: string) => s.participants.find((p) => p.id === id)?.nickname ?? "?";

const sameCard = (a: Card, b: Card) => a.suit === b.suit && a.value === b.value;
const hasCard = (cards: Card[], c: Card) => cards.some((x) => sameCard(x, c));
const turnSuit = (s: ZombieHuntState) => s.suits[s.round]!;

function removeOne(cards: Card[], card: Card): Card[] {
  const i = cards.findIndex((x) => sameCard(x, card));
  return i < 0 ? cards : [...cards.slice(0, i), ...cards.slice(i + 1)];
}

/** Carte giocabili: obbligo di seguire il seme del turno, se se ne ha. */
export function legalCards(cards: Card[], suit: number): Card[] {
  const follow = cards.filter((c) => c.suit === suit);
  return follow.length > 0 ? follow : cards;
}

/** Forza di una scelta: una carta del seme del turno batte tutte le altre; fucile e vaccino contro un umano valgono 0. */
function power(c: Choice, suit: number): number {
  if (c.kind !== "card") return 0;
  return c.suit === suit ? 100 + c.value : c.value;
}

/** Se non sceglie in tempo lo zombie morde e l'umano gioca la carta più bassa tra quelle che può giocare. */
function defaultChoice(hero: Hero, suit: number): Choice {
  if (hero.role === "zombie") return { kind: "bite" };
  const low = [...legalCards(hero.cards, suit)].sort((a, b) => a.value - b.value || a.suit - b.suit)[0]!;
  return { kind: "card", ...low };
}

function pairUp(state: ZombieHuntState, round: number): { pairs: [string, string][]; bye: string | null } {
  const order = shuffle(aliveIds(state), makeRng(deriveSeed(state.seed, round + 1)));
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < order.length; i += 2) pairs.push([order[i]!, order[i + 1]!]);
  return { pairs, bye: order.length % 2 === 1 ? order[order.length - 1]! : null };
}

function openRound(state: ZombieHuntState, round: number, now: number): ZombieHuntState {
  const { pairs, bye } = pairUp(state, round);
  return {
    ...state,
    phase: "play",
    round,
    pairs,
    bye,
    choices: {},
    events: {},
    summary: EMPTY_SUMMARY,
    openedAt: now,
    deadline: now + state.cfg.turnSec * 1000,
  };
}

/** Giocatori che devono ancora scegliere (uno zombie senza carte può solo mordere: non aspettiamo lui). */
function pending(state: ZombieHuntState): string[] {
  return state.pairs.flat().filter((id) => {
    const h = state.heroes[id]!;
    return !state.choices[id] && (h.role === "human" || (h.role === "zombie" && h.cards.length > 0));
  });
}

function resolveTurn(state: ZombieHuntState, now: number): ZombieHuntState {
  const { cfg } = state;
  const heroes: Record<string, Hero> = {};
  for (const [id, h] of Object.entries(state.heroes)) heroes[id] = { ...h, cards: [...h.cards] };
  let totals = state.totals;
  const events: Record<string, PlayerEvent> = {};
  const summary: TurnSummary = { infected: 0, shot: 0, cured: 0, eliminated: 0 };

  const award = (id: string, points: number) => {
    if (points !== 0) totals = addTo(totals, id, points);
  };
  const setEvent = (id: string, e: Omit<PlayerEvent, "points" | "count"> & { count?: number }, points = 0) => {
    events[id] = { ...e, count: e.count ?? 0, points };
  };
  const suit = turnSuit(state);
  const choiceOf = (id: string): Choice => state.choices[id] ?? defaultChoice(state.heroes[id]!, suit);
  const spend = (id: string, c: Choice) => {
    if (c.kind === "shotgun") heroes[id]!.shotgun = false;
    if (c.kind === "vaccine") heroes[id]!.vaccine = false;
  };

  const strongest = (id: string, n: number): Card[] =>
    [...heroes[id]!.cards].sort((x, y) => power({ kind: "card", ...y }, suit) - power({ kind: "card", ...x }, suit)).slice(0, n);

  /**
   * Duello a carte tra due giocatori (umani, o uno zombie mimetizzato contro un umano). Vince la forza maggiore
   * e prende la carta giocata dal perdente. Fucile o vaccino usati qui sono a vuoto: chi li gioca perde, cede le
   * sue `missCards` carte più forti e perde `missPoints`.
   */
  const duel = (a: string, b: string, ca: Choice, cb: Choice) => {
    spend(a, ca);
    spend(b, cb);
    const va = power(ca, suit);
    const vb = power(cb, suit);
    const give = (id: string, c: Choice, lost: boolean): Card[] =>
      c.kind !== "card" ? strongest(id, cfg.missCards) : lost ? [{ suit: c.suit, value: c.value }] : [];
    const giveA = give(a, ca, va < vb);
    const giveB = give(b, cb, vb < va);
    for (const c of giveA) heroes[a]!.cards = removeOne(heroes[a]!.cards, c);
    for (const c of giveB) heroes[b]!.cards = removeOne(heroes[b]!.cards, c);
    heroes[a]!.cards.push(...giveB);
    heroes[b]!.cards.push(...giveA);
    const report = (me: string, other: string, mine: Choice, theirs: Choice, v: number, w: number, gave: Card[], got: Card[]) => {
      const outcome: Outcome = v > w ? "win" : v < w ? "lose" : "draw";
      const delta = (outcome === "win" ? cfg.duelPoints : 0) - (mine.kind !== "card" ? cfg.missPoints : 0);
      award(me, delta);
      const moved = outcome === "lose" ? gave : got;
      setEvent(me, { outcome, opponent: nick(state, other), mine, theirs, card: moved[0] ?? null, count: moved.length }, delta);
    };
    report(a, b, ca, cb, va, vb, giveA, giveB);
    report(b, a, cb, ca, vb, va, giveB, giveA);
  };

  for (const [a, b] of state.pairs) {
    const ra = state.heroes[a]!.role;
    const rb = state.heroes[b]!.role;

    if (ra === "zombie" && rb === "zombie") {
      setEvent(a, { outcome: "quiet", opponent: nick(state, b), mine: null, theirs: null, card: null });
      setEvent(b, { outcome: "quiet", opponent: nick(state, a), mine: null, theirs: null, card: null });
      continue;
    }

    if (ra === "zombie" || rb === "zombie") {
      const z = ra === "zombie" ? a : b;
      const h = z === a ? b : a;
      const c = choiceOf(h);
      const cz = choiceOf(z);
      const zName = nick(state, z);
      const hName = nick(state, h);
      if (c.kind === "card" && cz.kind === "card") {
        // lo zombie si è mimetizzato: per l'umano è un duello come un altro
        duel(z, h, cz, c);
        continue;
      }
      spend(h, c);
      if (c.kind === "shotgun") {
        heroes[z]!.role = "out";
        summary.shot++;
        summary.eliminated++;
        award(h, cfg.shotPoints);
        setEvent(h, { outcome: "shot", opponent: zName, mine: c, theirs: null, card: null }, cfg.shotPoints);
        setEvent(z, { outcome: "killed", opponent: hName, mine: null, theirs: c, card: null });
      } else if (c.kind === "vaccine") {
        heroes[z]!.role = "human";
        summary.cured++;
        award(h, cfg.curePoints);
        setEvent(h, { outcome: "cure", opponent: zName, mine: c, theirs: null, card: null }, cfg.curePoints);
        setEvent(z, { outcome: "healed", opponent: hName, mine: null, theirs: c, card: null });
      } else {
        heroes[h]!.role = "zombie";
        // da zombie non servono più le armi: restano nello stato ma non si possono usare
        summary.infected++;
        award(z, cfg.infectionPoints);
        setEvent(z, { outcome: "bit", opponent: hName, mine: null, theirs: c, card: null }, cfg.infectionPoints);
        setEvent(h, { outcome: "bitten", opponent: zName, mine: c, theirs: null, card: null });
      }
      continue;
    }

    // umano contro umano
    duel(a, b, choiceOf(a), choiceOf(b));
  }

  if (state.bye) setEvent(state.bye, { outcome: "bye", opponent: null, mine: null, theirs: null, card: null });

  // Un umano senza carte numerate è eliminato.
  for (const id of withRole({ ...state, heroes }, "human")) {
    if (heroes[id]!.cards.length === 0) {
      heroes[id]!.role = "out";
      summary.eliminated++;
    }
  }

  return { ...state, heroes, totals, events, summary, phase: "reveal", revealUntil: now + cfg.revealSec * 1000 };
}

function finish(state: ZombieHuntState): ZombieHuntState {
  const humans = withRole(state, "human");
  const zombies = withRole(state, "zombie");
  const winner = humans.length > zombies.length ? "humans" : zombies.length > humans.length ? "zombies" : "draw";
  let totals = state.totals;
  const half = Math.round(state.cfg.winPoints / 2);
  for (const id of humans) if (winner !== "zombies") totals = addTo(totals, id, winner === "humans" ? state.cfg.winPoints : half);
  for (const id of zombies) if (winner !== "humans") totals = addTo(totals, id, winner === "zombies" ? state.cfg.winPoints : half);
  return { ...state, phase: "done", totals, winner };
}

function advance(state: ZombieHuntState, now: number): ZombieHuntState {
  const humans = withRole(state, "human").length;
  const zombies = withRole(state, "zombie").length;
  if (state.round + 1 >= state.cfg.rounds || humans === 0 || zombies === 0) return finish(state);
  return openRound(state, state.round + 1, now);
}

/**
 * Turni automatici. L'infezione cresce a valanga (all'incirca raddoppia a ogni turno), quindi più turni
 * favoriscono sempre gli zombie: la partita deve finire quando è ancora aperta, cioè dopo ~log2(giocatori/zombie)
 * turni, quando gli zombie sono circa la metà. Tra 3 e 10. (Misurato con simulazioni: con 20 giocatori e
 * 2 zombie, 8 turni davano il 99% di vittorie zombie, 4 turni con i fucili e i vaccini automatici circa 55/45.)
 */
export function autoRounds(players: number, zombies: number): number {
  const spread = Math.ceil(Math.log2(Math.max(2, players / Math.max(1, zombies))));
  return Math.min(10, Math.max(3, spread));
}

/** Fucili automatici: circa uno ogni 3 giocatori, almeno uno. */
export function autoShotguns(players: number): number {
  return Math.max(1, Math.round(players / 3));
}

/** Vaccini automatici: circa uno ogni 5 giocatori, almeno uno. */
export function autoVaccines(players: number): number {
  return Math.max(1, Math.round(players / 5));
}

function counts(state: ZombieHuntState) {
  return { humans: withRole(state, "human").length, zombies: withRole(state, "zombie").length, out: withRole(state, "out").length };
}

export const zombieHunt: MinigameType<ZombieHuntConfig, ZombieHuntState, Input, Command> = {
  id: "zombie-hunt",
  title: "Zombie Hunt",
  defaultTheme: "pixel",
  configSchema: zombieHuntConfigSchema as unknown as z.ZodType<ZombieHuntConfig>,
  inputSchema,
  commandSchema,
  sampleConfig: {
    rounds: 0,
    turnSec: 25,
    revealSec: 6,
    cardsPerPlayer: 7,
    maxCard: 10,
    zombieCount: 2,
    vaccineCount: 0,
    shotgunCount: 0,
    missCards: 3,
    missPoints: 50,
    duelPoints: 20,
    infectionPoints: 100,
    shotPoints: 100,
    curePoints: 100,
    winPoints: 300,
  },

  init(config, ctx, now) {
    const rng = makeRng(ctx.seed);
    const ids = ctx.players.map((p) => p.id);
    const order = shuffle(ids, rng);
    const zombies = new Set(order.slice(0, Math.min(config.zombieCount, Math.floor(ids.length / 2))));
    const humansInOrder = order.filter((id) => !zombies.has(id));
    const vaccines = new Set(humansInOrder.slice(0, config.vaccineCount > 0 ? config.vaccineCount : autoVaccines(ids.length)));
    // Pochi fucili, segreti, solo agli umani (assegnati con un ordine a parte: non coincidono col vaccino per forza).
    const shotguns = new Set(shuffle(humansInOrder, rng).slice(0, config.shotgunCount > 0 ? config.shotgunCount : autoShotguns(ids.length)));
    // Le carte si pescano da mazzi completi (4 semi × valori) mescolati, rifatti quando finiscono.
    let pool: Card[] = [];
    const draw = (): Card => {
      if (pool.length === 0) {
        const deck: Card[] = [];
        for (let suit = 0; suit < SUITS; suit++) for (let value = 1; value <= config.maxCard; value++) deck.push({ suit, value });
        pool = shuffle(deck, rng);
      }
      return pool.pop()!;
    };
    const heroes: Record<string, Hero> = {};
    for (const id of ids) {
      heroes[id] = {
        role: zombies.has(id) ? "zombie" : "human",
        cards: Array.from({ length: config.cardsPerPlayer }, draw).sort((x, y) => x.suit - y.suit || x.value - y.value),
        shotgun: shotguns.has(id),
        vaccine: vaccines.has(id),
      };
    }
    // Semi dei turni: a blocchi di 4 mescolati, così nessun seme resta fuori a lungo.
    const suits: number[] = [];
    while (suits.length <= MAX_ROUNDS) suits.push(...shuffle(Array.from({ length: SUITS }, (_, i) => i), rng));
    const base: ZombieHuntState = {
      cfg: config.rounds > 0 ? config : { ...config, rounds: autoRounds(ids.length, zombies.size) },
      seed: ctx.seed,
      participants: ctx.players,
      heroes,
      phase: "play",
      round: 0,
      suits,
      pairs: [],
      bye: null,
      choices: {},
      events: {},
      summary: EMPTY_SUMMARY,
      openedAt: now,
      deadline: now,
      revealUntil: 0,
      totals: {},
      winner: null,
    };
    return openRound(base, 0, now);
  },

  onInput(state, playerId, input, meta) {
    if (state.phase !== "play") return state;
    const hero = state.heroes[playerId];
    if (!hero || hero.role === "out") return state;
    if (!state.pairs.some((p) => p.includes(playerId))) return state;
    if (state.choices[playerId]) return state; // la prima scelta è definitiva
    if (meta.receivedAt > state.deadline + GRACE_MS) return state;
    let choice: Choice;
    if (input.type === "bite") {
      if (hero.role !== "zombie") return state;
      choice = { kind: "bite" };
    } else if (input.type === "play") {
      if (hero.cards.length === 0) return state;
      const card = { suit: input.suit, value: input.value };
      if (!hasCard(legalCards(hero.cards, turnSuit(state)), card)) return state; // non l'ha, o deve seguire il seme
      choice = { kind: "card", ...card };
    } else if (input.type === "shotgun") {
      if (hero.role !== "human" || !hero.shotgun) return state;
      choice = { kind: "shotgun" };
    } else {
      if (hero.role !== "human" || !hero.vaccine) return state;
      choice = { kind: "vaccine" };
    }
    return { ...state, choices: { ...state.choices, [playerId]: choice } };
  },

  onTick(state, now) {
    if (state.phase === "play") {
      return pending(state).length === 0 || now >= state.deadline + GRACE_MS ? resolveTurn(state, now) : state;
    }
    if (state.phase === "reveal" && now >= state.revealUntil) return advance(state, now);
    return state;
  },

  onHostCommand(state, _command, now) {
    if (state.phase === "play") return resolveTurn(state, now);
    if (state.phase === "reveal") return advance(state, now);
    return state;
  },

  isFinished: (state) => state.phase === "done",
  result: (state) => rankByPoints(state.totals, state.participants.map((p) => p.id)),
  scores: (state) => totalsToScores(state.totals, "Zombie Hunt"),

  // Pubblico: nessun ruolo, nessun nome negli esiti. I ruoli si scoprono solo a fine partita.
  screenView(state) {
    const alive = aliveIds(state).length;
    if (state.phase === "done") {
      const c = counts(state);
      return {
        phase: "done" as const,
        winner: state.winner,
        humans: c.humans,
        zombies: c.zombies,
        players: state.participants.map((p) => ({ id: p.id, nickname: p.nickname, role: state.heroes[p.id]!.role, points: state.totals[p.id] ?? 0 })),
      };
    }
    return {
      phase: state.phase,
      round: state.round + 1,
      rounds: state.cfg.rounds,
      openedAt: state.openedAt,
      deadline: state.deadline,
      suit: turnSuit(state),
      nextSuit: state.round + 1 < state.cfg.rounds ? state.suits[state.round + 1]! : null,
      alive,
      total: state.participants.length,
      chosen: Object.keys(state.choices).length,
      ...(state.phase === "reveal" && { summary: state.summary }),
    };
  },

  viewFor(state, playerId) {
    const hero = state.heroes[playerId];
    if (!hero) return { phase: "done" as const, role: "out" as Role, winner: null, points: 0 };
    if (state.phase === "done") {
      return { phase: "done" as const, role: hero.role, winner: state.winner, points: state.totals[playerId] ?? 0 };
    }
    const pair = state.pairs.find((p) => p.includes(playerId));
    const opponentId = pair ? (pair[0] === playerId ? pair[1] : pair[0]) : null;
    return {
      phase: state.phase,
      round: state.round + 1,
      rounds: state.cfg.rounds,
      openedAt: state.openedAt,
      deadline: state.deadline,
      suit: turnSuit(state),
      nextSuit: state.round + 1 < state.cfg.rounds ? state.suits[state.round + 1]! : null,
      role: hero.role,
      cards: hero.role === "out" ? [] : [...hero.cards],
      shotgun: hero.role === "human" && hero.shotgun,
      vaccine: hero.role === "human" && hero.vaccine,
      opponent: opponentId ? nick(state, opponentId) : null,
      bye: state.bye === playerId,
      choice: state.choices[playerId] ?? null,
      points: state.totals[playerId] ?? 0,
      ...(state.phase === "reveal" && { event: state.events[playerId] ?? null }),
    };
  },

  hostView(state) {
    const c = counts(state);
    return {
      info: {
        phase: state.phase,
        round: state.round + 1,
        rounds: state.cfg.rounds,
        ...c,
        zombieNames: withRole(state, "zombie").map((id) => nick(state, id)),
        pending: state.phase === "play" ? pending(state).length : 0,
      },
      actions: [
        {
          id: "next",
          label: state.phase === "play" ? "Rivela ora" : state.round + 1 >= state.cfg.rounds ? "Concludi" : "Turno successivo",
          enabled: state.phase !== "done",
        },
      ],
    };
  },
};
