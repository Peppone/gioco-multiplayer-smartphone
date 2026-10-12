import { z } from "zod";
import type {
  AnyMinigame,
  HostAction,
  MinigameContext,
  MinigameType,
  ParticipantInfo,
  RoundResult,
  ScoreDelta,
  TeamInfo,
} from "@gioco/shared";
import { type BattleEvent, type Knight, type Side, newKnight, other, redactEvent, resolveBattle } from "./battle.js";
import { type Card, type HandCard, cardIndex, describeCard, expandDeck, DEFAULT_DECK } from "./cards.js";
import { type DuelConfig, type DuelMode, duelConfigSchema, duelLibrarySchema, duelModeSchema } from "./config.js";
import { type DraftState, draftCast, draftConfirm, draftPublicView, draftResult, draftTick, draftViewFor, startDraft } from "./draft.js";
import { deriveSeed, makeRng, shuffle } from "./rng.js";
import { type TeamVote, castVote, confirmVote, createVote, isVoteDone, memberView, publicVoteView, resolveVote } from "./team-vote.js";

export * from "./battle.js";
export * from "./cards.js";
export * from "./config.js";
export { type DraftState } from "./draft.js";

// ---- Stato ----

export interface SideInfo {
  id: string;
  name: string;
  color: string;
  members: string[];
}

export type DuelPhase = "minigame-select" | "minigame" | "draft" | "battle" | "battle-result" | "ended" | "done";

export interface DuelState {
  cfg: DuelConfig;
  participants: ParticipantInfo[];
  teams: TeamInfo[];
  sides: [SideInfo, SideInfo];
  /** Seme di base e contatore: ogni uso del caso deriva un seme nuovo (`deriveSeed(seed, step)`). */
  seed: number;
  step: number;
  phase: DuelPhase;
  /** Battaglie già giocate. */
  battleNo: number;
  /** Minigiochi conclusi dall'ultima battaglia. */
  minigamesSince: number;
  poolOrder: number[];
  poolCursor: number;
  knights: [Knight, Knight];
  supply: HandCard[];
  discard: HandCard[];
  /** Malus % ai punti del prossimo minigioco, per lato che lo subisce. */
  sabotage: [number, number];
  /** Carta avversaria svelata dalla Spia, per lato che ha spiato. */
  spied: [HandCard | null, HandCard | null];
  child: { poolIndex: number; state: unknown } | null;
  minigameWinner: Side | null;
  draft: DraftState | null;
  battleVotes: [TeamVote, TeamVote] | null;
  battle: { events: BattleEvent[]; winner: Side | null; shownUntil: number } | null;
  suddenDeath: boolean;
  suddenCount: number;
  outcome: { winner: Side | null; reason: "ko" | "hp" | "sudden" | "coin" } | null;
}

// ---- Input e comandi ----

const inputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("child"), input: z.unknown() }),
  z.object({ type: z.literal("draft-cast"), uid: z.string().min(1).max(64) }),
  z.object({ type: z.literal("draft-confirm") }),
  z.object({ type: z.literal("vote-cast"), uid: z.string().min(1).max(64) }),
  z.object({ type: z.literal("vote-confirm") }),
]);
const commandSchema = z.object({ type: z.string().regex(/^(continue|end|skip-draft|skip-minigame|pick:\d{1,2}|child:[a-z-]{1,24})$/) });
type Input = z.infer<typeof inputSchema>;
type Command = z.infer<typeof commandSchema>;

const SIDE_COLORS = ["#ef4444", "#3b82f6"];
/** Animazione della battaglia: durata minima più un tempo per ogni evento. */
const ANIM_BASE_MS = 1_500;
const ANIM_PER_EVENT_MS = 1_100;
const SUDDEN_DEATH_LIMIT = 10;

export interface CardView {
  id: string;
  name: string;
  icon: string;
  rarity: string;
  initiative: number;
  text: string;
}
const cardView = (c: Card): CardView => ({ id: c.id, name: c.name, icon: c.icon, rarity: c.rarity, initiative: c.initiative, text: describeCard(c) });

/**
 * Crea il plugin «Duello dei Cavalieri». Riceve i plugin dei minigiochi che può orchestrare:
 * il duello non può contenere sé stesso, quindi il registro passato non lo include.
 */
export function createKnightDuel(children: Record<string, AnyMinigame>): MinigameType<DuelConfig, DuelState, Input, Command> {
  const defs = (s: DuelState) => cardIndex(s.cfg.deck);
  const sideOf = (s: DuelState, playerId: string): Side | null => (s.sides[0].members.includes(playerId) ? 0 : s.sides[1].members.includes(playerId) ? 1 : null);

  /** Un seme nuovo per ogni uso del caso; restituisce anche lo stato con il contatore avanzato. */
  const rngOf = (s: DuelState): [() => number, DuelState] => [makeRng(deriveSeed(s.seed, s.step)), { ...s, step: s.step + 1 }];

  const draw = (s: DuelState, n: number): [HandCard[], DuelState] => {
    let supply = s.supply;
    let discard = s.discard;
    let next = s;
    if (supply.length < n) {
      const [rng, withStep] = rngOf(s);
      next = withStep;
      supply = [...supply, ...shuffle(discard, rng)];
      discard = [];
    }
    return [supply.slice(0, n), { ...next, supply: supply.slice(n), discard }];
  };

  /** Aggiunge una carta alla mano; oltre il limite la più vecchia viene scartata. */
  const addToHand = (s: DuelState, side: Side, card: HandCard): DuelState => {
    const knights: [Knight, Knight] = [{ ...s.knights[0] }, { ...s.knights[1] }];
    const hand = [...knights[side].hand, card];
    const discard = [...s.discard];
    while (hand.length > s.cfg.mode.handLimit) discard.push(hand.shift()!);
    knights[side] = { ...knights[side], hand };
    return { ...s, knights, discard };
  };

  // ---- Flusso: minigioco ----

  const startMinigame = (s: DuelState, poolIndex: number, now: number): DuelState => {
    const entry = s.cfg.pool[poolIndex]!;
    const plugin = children[entry.typeId];
    const parsed = plugin?.configSchema.safeParse(entry.config);
    if (!plugin || !parsed?.success) return s; // istanza non utilizzabile: la validazione all'avvio la esclude
    const [rng, s2] = rngOf(s);
    // Nel duello i minigiochi li giocano i membri dei due lati; gli altri guardano (e non rallentano le rivelazioni).
    const contestants = s.participants.filter((p) => sideOf(s, p.id) !== null);
    const childState = plugin.init(parsed.data, { players: contestants, teams: s.teams, seed: Math.floor(rng() * 2 ** 31) }, now);
    return { ...s2, phase: "minigame", child: { poolIndex, state: childState } };
  };

  const nextPoolIndex = (s: DuelState): [number, DuelState] => {
    if (s.poolCursor < s.poolOrder.length) return [s.poolOrder[s.poolCursor]!, { ...s, poolCursor: s.poolCursor + 1 }];
    const [rng, s2] = rngOf(s);
    const order = shuffle(s.cfg.pool.map((_, i) => i), rng);
    return [order[0]!, { ...s2, poolOrder: order, poolCursor: 1 }];
  };

  const selectNext = (s: DuelState, now: number): DuelState => {
    if (s.cfg.mode.selection === "admin") return { ...s, phase: "minigame-select", child: null };
    const [idx, s2] = nextPoolIndex(s);
    return startMinigame(s2, idx, now);
  };

  /** Il lato con più punti nel minigioco; in parità il miglior piazzamento individuale, poi il caso. */
  const minigameWinner = (s: DuelState, plugin: AnyMinigame, childState: unknown): [Side, DuelState] => {
    const points = [0, 0];
    for (const d of plugin.scores(childState) as ScoreDelta[]) {
      const side = d.playerId ? sideOf(s, d.playerId) : null;
      if (side !== null) points[side] = points[side]! + d.points;
    }
    for (const i of [0, 1] as const) if (points[i]! > 0) points[i] = Math.round((points[i]! * (100 - s.sabotage[i])) / 100); // il malus riduce i punti guadagnati
    if (points[0] !== points[1]) return [points[0]! > points[1]! ? 0 : 1, s];

    const best = [Infinity, Infinity];
    for (const r of (plugin.result(childState) as RoundResult).ranking) {
      const side = sideOf(s, r.playerId);
      if (side !== null) best[side] = Math.min(best[side]!, r.rank);
    }
    if (best[0] !== best[1]) return [best[0]! < best[1]! ? 0 : 1, s];
    const [rng, s2] = rngOf(s);
    return [rng() < 0.5 ? 0 : 1, s2];
  };

  const advanceDraft = (s: DuelState, now: number): DuelState => {
    if (!s.draft) return s;
    const [rng, s2] = rngOf(s);
    const draft = draftTick(s.draft, now, rng);
    if (draft === s.draft) return s;
    if (draft.phase === "picking") return { ...s2, draft };
    return finishDraft({ ...s2, draft }, now);
  };

  const finishMinigame = (s: DuelState, now: number): DuelState => {
    const plugin = children[s.cfg.pool[s.child!.poolIndex]!.typeId]!;
    const [winner, s1] = minigameWinner(s, plugin, s.child!.state);
    const [offered, s2] = draw(s1, s.cfg.mode.draftSize);
    const draft = startDraft({
      offered,
      winner,
      members: [s.sides[0].members, s.sides[1].members],
      now,
      voteMs: s.cfg.mode.draftSeconds * 1000,
      winnerPicks: s.cfg.mode.winnerPicks,
      loserPicks: s.cfg.mode.loserPicks,
    });
    const next: DuelState = { ...s2, phase: "draft", draft, child: null, minigameWinner: winner, sabotage: [0, 0], minigamesSince: s.minigamesSince + 1 };
    return advanceDraft(next, now); // un draft senza carte o senza votanti si chiude subito
  };

  // ---- Flusso: draft ----

  const finishDraft = (s: DuelState, now: number): DuelState => {
    const { picks, leftover } = draftResult(s.draft!);
    let next: DuelState = { ...s, draft: null, supply: [...s.supply, ...leftover] }; // le non scelte tornano nel mazzo
    for (const side of [0, 1] as const) for (const card of picks[side]) next = addToHand(next, side, card);
    return s.minigamesSince >= s.cfg.mode.minigamesPerBattle ? startBattle(next, now) : selectNext(next, now);
  };

  // ---- Flusso: battaglia ----

  const startBattle = (s: DuelState, now: number): DuelState => {
    const votes = [0, 1].map((i) =>
      createVote({
        options: s.knights[i]!.hand.map((c) => c.uid),
        max: s.cfg.mode.maxPlays,
        members: s.sides[i]!.members,
        deadline: now + s.cfg.mode.battleSeconds * 1000,
      }),
    ) as [TeamVote, TeamVote];
    return { ...s, phase: "battle", battleVotes: votes, battle: null };
  };

  /** Un voto senza nulla da scegliere o senza votanti non va atteso. */
  const voteDone = (v: TeamVote, now: number) => v.options.length === 0 || v.members.length === 0 || isVoteDone(v, now);

  const prudentOrder = (s: DuelState, side: Side): string[] => {
    const d = defs(s);
    const safe = (c: HandCard) => d[c.cardId]!.effects.some((e) => e.kind === "shield" || e.kind === "heal" || e.kind === "counter");
    return s.knights[side].hand.filter(safe).map((c) => c.uid);
  };

  const resolveBattleNow = (s: DuelState, now: number): DuelState => {
    const [rng, s1] = rngOf(s);
    const plays = ([0, 1] as const).map((i) => {
      const fb = s.cfg.mode.fallback;
      return resolveVote(s.battleVotes![i], fb === "prudent" ? { mode: "prudent", prudent: prudentOrder(s, i) } : { mode: fb }, rng).picked;
    }) as [string[], string[]];

    const result = resolveBattle({
      knights: s.knights,
      plays,
      cards: defs(s),
      maxPlays: s.cfg.mode.maxPlays,
      seed: deriveSeed(s.seed, 5_000 + s.battleNo),
    });

    // La carta svelata dalla Spia resta nota finché l'avversario la tiene in mano.
    const spied = ([0, 1] as const).map((i) => {
      const fresh = result.spied[i];
      const keep = s.spied[i] && result.knights[other(i)].hand.some((c) => c.uid === s.spied[i]!.uid) ? s.spied[i] : null;
      return fresh ?? keep;
    }) as [HandCard | null, HandCard | null];

    return {
      ...s1,
      phase: "battle-result",
      knights: result.knights,
      discard: [...s.discard, ...result.played[0], ...result.played[1]],
      spied,
      sabotage: [Math.min(100, s.sabotage[0] + result.sabotage[0]), Math.min(100, s.sabotage[1] + result.sabotage[1])],
      battleNo: s.battleNo + 1,
      minigamesSince: 0,
      battleVotes: null,
      battle: { events: result.events, winner: result.winner, shownUntil: now + Math.min(30_000, ANIM_BASE_MS + result.events.length * ANIM_PER_EVENT_MS) },
    };
  };

  const endDuel = (s: DuelState, winner: Side | null, reason: "ko" | "hp" | "sudden" | "coin"): DuelState => ({
    ...s,
    phase: "ended",
    battleVotes: null,
    child: null,
    draft: null,
    outcome: { winner, reason },
  });

  /** Battaglia a oltranza: senza minigioco, con due carte fresche per lato. */
  const startSuddenBattle = (s: DuelState, now: number): DuelState => {
    let next: DuelState = { ...s, suddenDeath: true };
    for (const side of [0, 1] as const) {
      const [cards, drawn] = draw(next, 2);
      next = drawn;
      for (const c of cards) next = addToHand(next, side, c);
    }
    return startBattle(next, now);
  };

  const afterBattle = (s: DuelState, now: number): DuelState => {
    const winner = s.battle?.winner ?? null;
    const done = { ...s, battle: null };
    if (winner !== null) return endDuel(done, winner, "ko");
    const [a, b] = [s.knights[0].hp, s.knights[1].hp];
    if (s.suddenDeath) {
      if (a !== b) return endDuel(done, a > b ? 0 : 1, "sudden");
      if (s.suddenCount + 1 >= SUDDEN_DEATH_LIMIT) {
        const [rng, s2] = rngOf(done);
        return endDuel(s2, rng() < 0.5 ? 0 : 1, "coin");
      }
      return startSuddenBattle({ ...done, suddenCount: s.suddenCount + 1 }, now);
    }
    if (s.battleNo >= s.cfg.mode.maxBattles) {
      return a !== b ? endDuel(done, a > b ? 0 : 1, "hp") : startSuddenBattle({ ...done, suddenCount: 0 }, now);
    }
    return selectNext(done, now);
  };

  // ---- Viste ----

  const sidesView = (s: DuelState) =>
    s.sides.map((side, i) => ({
      name: side.name,
      color: side.color,
      hp: s.knights[i]!.hp,
      maxHp: s.knights[i]!.maxHp,
      handCount: s.knights[i]!.hand.length,
      poison: s.knights[i]!.poison.reduce((sum, p) => sum + p.damage, 0),
      members: side.members.length,
    }));

  const handView = (s: DuelState, hand: HandCard[]) => {
    const d = defs(s);
    return hand.map((h) => ({ uid: h.uid, ...cardView(d[h.cardId]!) }));
  };

  /** Le carte giocate sono pubbliche dopo la rivelazione: i loro dati servono per animare lo scontro. */
  const eventCards = (s: DuelState, events: BattleEvent[]): Record<string, CardView> => {
    const d = defs(s);
    const out: Record<string, CardView> = {};
    for (const e of events) if ("cardId" in e && e.cardId && d[e.cardId]) out[e.cardId] = cardView(d[e.cardId]!);
    return out;
  };

  const common = (s: DuelState) => ({
    phase: s.phase,
    battleNo: s.battleNo,
    maxBattles: s.cfg.mode.maxBattles,
    minigamesLeft: Math.max(0, s.cfg.mode.minigamesPerBattle - s.minigamesSince),
    suddenDeath: s.suddenDeath,
    sides: sidesView(s),
  });

  const childFrame = (s: DuelState, view: (p: AnyMinigame, st: unknown) => unknown) => {
    if (s.phase !== "minigame" || !s.child) return null;
    const entry = s.cfg.pool[s.child.poolIndex]!;
    return { typeId: entry.typeId, title: entry.title, theme: entry.theme, view: view(children[entry.typeId]!, s.child.state) };
  };

  const outcomeView = (s: DuelState) => (s.outcome ? { winner: s.outcome.winner, reason: s.outcome.reason } : null);

  const winnersOf = (s: DuelState): [Set<string>, Set<string>] => {
    const w = s.outcome?.winner;
    if (w === null || w === undefined) return [new Set(), new Set()];
    return [new Set(s.sides[w].members), new Set(s.sides[other(w)].members)];
  };

  return {
    id: "knight-duel",
    title: "Duello dei Cavalieri",
    defaultTheme: "pixel",
    configSchema: duelConfigSchema as unknown as z.ZodType<DuelConfig>,
    inputSchema,
    commandSchema,
    sampleConfig: {
      mode: duelModeSchema.parse({ sideA: "t1", sideB: "t2", pool: ["quiz"] }),
      pool: [
        {
          instanceId: "quiz",
          title: "Quiz di prova",
          typeId: "vero-falso",
          theme: "pixel",
          config: { statements: [{ text: "Il mare è salato.", answer: true }], timeSec: 5, revealSec: 1 },
        },
      ],
      deck: DEFAULT_DECK,
    },

    // Istanza in libreria (compilata dall'admin) e sua traduzione in configurazione completa all'avvio.
    libraryConfigSchema: duelLibrarySchema as unknown as z.ZodType<unknown>,
    draftLibraryConfig: { kind: "teams", pool: [""] }, // un campo da compilare: il modulo parte già con il primo minigioco da scegliere
    buildConfig(raw, lookup, roster) {
      const parsed = duelLibrarySchema.safeParse(raw);
      if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`).join("; ") };
      const settings = parsed.data;

      // Sfidanti: le prime due squadre della serata (per nome) che hanno giocatori, oppure due giocatori estratti a sorte.
      let sideA: string;
      let sideB: string;
      if (settings.kind === "teams") {
        const withPlayers = roster.teams.filter((t) => roster.players.some((p) => p.teamId === t.id)).sort((a, b) => a.name.localeCompare(b.name, "it"));
        if (withPlayers.length < 2) return { ok: false, error: "servono almeno due squadre della serata con dei giocatori" };
        [sideA, sideB] = [withPlayers[0]!.id, withPlayers[1]!.id];
      } else {
        if (roster.players.length < 2) return { ok: false, error: "servono almeno due giocatori in serata" };
        const picked = shuffle(roster.players.map((p) => p.id), Math.random); // solo all'avvio: poi gli sfidanti restano fissati nella configurazione
        [sideA, sideB] = [picked[0]!, picked[1]!];
      }
      const mode = { ...settings, sideA, sideB };

      const pool = [];
      for (const id of mode.pool) {
        const inst = lookup(id);
        if (!inst || !children[inst.typeId]) return { ok: false, error: `Minigioco non utilizzabile nel duello: ${id}` };
        if (!children[inst.typeId]!.configSchema.safeParse(inst.config).success) return { ok: false, error: `Configurazione non valida per «${inst.title}»` };
        pool.push({ instanceId: id, title: inst.title, typeId: inst.typeId, theme: inst.theme, config: inst.config });
      }
      let deck = DEFAULT_DECK;
      if (mode.deck) {
        const inst = lookup(mode.deck);
        const parsedDeck = inst?.typeId === "deck" ? duelConfigSchema.shape.deck.safeParse(inst.config) : undefined;
        if (!parsedDeck?.success) return { ok: false, error: "Mazzo non valido o non trovato" };
        deck = parsedDeck.data;
      }
      return { ok: true, config: { mode, pool, deck } };
    },

    init(config, ctx: MinigameContext, now) {
      const { mode } = config;
      const players = ctx.players;
      const mk = (id: string, i: number): SideInfo => {
        if (mode.kind === "teams") {
          const t = ctx.teams.find((x) => x.id === id);
          return { id, name: t?.name ?? "Squadra", color: t?.color ?? SIDE_COLORS[i]!, members: players.filter((p) => p.teamId === id).map((p) => p.id) };
        }
        const p = players.find((x) => x.id === id);
        return { id, name: p?.nickname ?? "Giocatore", color: SIDE_COLORS[i]!, members: p ? [p.id] : [] };
      };
      const rng = makeRng(ctx.seed);
      const base: DuelState = {
        cfg: config,
        participants: players,
        teams: ctx.teams,
        sides: [mk(mode.sideA, 0), mk(mode.sideB, 1)],
        seed: ctx.seed,
        step: 1,
        phase: "minigame-select",
        battleNo: 0,
        minigamesSince: 0,
        poolOrder: [],
        poolCursor: 0,
        knights: [newKnight(mode.hp), newKnight(mode.hp)],
        supply: shuffle(expandDeck(config.deck), rng),
        discard: [],
        sabotage: [0, 0],
        spied: [null, null],
        child: null,
        minigameWinner: null,
        draft: null,
        battleVotes: null,
        battle: null,
        suddenDeath: false,
        suddenCount: 0,
        outcome: null,
      };
      return selectNext(base, now);
    },

    onInput(s, playerId, input, meta) {
      const now = meta.receivedAt;
      switch (input.type) {
        case "child": {
          if (s.phase !== "minigame" || !s.child) return s;
          const plugin = children[s.cfg.pool[s.child.poolIndex]!.typeId]!;
          const parsed = plugin.inputSchema.safeParse(input.input);
          if (!parsed.success) return s;
          const childState = plugin.onInput(s.child.state, playerId, parsed.data, meta);
          if (childState === s.child.state) return s;
          const next = { ...s, child: { ...s.child, state: childState } };
          return plugin.isFinished(childState) ? finishMinigame(next, now) : next;
        }
        case "draft-cast":
        case "draft-confirm": {
          if (s.phase !== "draft" || !s.draft) return s;
          if (s.draft.vote && now >= s.draft.vote.deadline) return s; // il voto è chiuso: decide il tick
          const draft = input.type === "draft-cast" ? draftCast(s.draft, playerId, input.uid) : draftConfirm(s.draft, playerId);
          return draft === s.draft ? s : { ...s, draft };
        }
        case "vote-cast":
        case "vote-confirm": {
          if (s.phase !== "battle" || !s.battleVotes) return s;
          const side = sideOf(s, playerId);
          if (side === null || now >= s.battleVotes[side].deadline) return s;
          const vote = input.type === "vote-cast" ? castVote(s.battleVotes[side], playerId, input.uid) : confirmVote(s.battleVotes[side], playerId);
          if (vote === s.battleVotes[side]) return s;
          const votes: [TeamVote, TeamVote] = [s.battleVotes[0], s.battleVotes[1]];
          votes[side] = vote;
          return { ...s, battleVotes: votes };
        }
      }
    },

    onTick(s, now) {
      switch (s.phase) {
        case "minigame": {
          const plugin = children[s.cfg.pool[s.child!.poolIndex]!.typeId]!;
          const childState = plugin.onTick(s.child!.state, now);
          if (childState === s.child!.state) return s;
          const next = { ...s, child: { ...s.child!, state: childState } };
          return plugin.isFinished(childState) ? finishMinigame(next, now) : next;
        }
        case "draft":
          return advanceDraft(s, now);
        case "battle":
          return s.battleVotes!.every((v) => voteDone(v, now)) ? resolveBattleNow(s, now) : s;
        case "battle-result":
          return now >= s.battle!.shownUntil ? afterBattle(s, now) : s;
        default:
          return s;
      }
    },

    onHostCommand(s, { type }, now) {
      if (type.startsWith("pick:")) {
        const idx = Number(type.slice(5));
        return s.phase === "minigame-select" && idx < s.cfg.pool.length ? startMinigame(s, idx, now) : s;
      }
      if (type.startsWith("child:")) {
        if (s.phase !== "minigame" || !s.child) return s;
        const plugin = children[s.cfg.pool[s.child.poolIndex]!.typeId]!;
        const cmd = plugin.commandSchema.safeParse({ type: type.slice(6) });
        if (!cmd.success) return s;
        const childState = plugin.onHostCommand(s.child.state, cmd.data, now);
        if (childState === s.child.state) return s;
        const next = { ...s, child: { ...s.child, state: childState } };
        return plugin.isFinished(childState) ? finishMinigame(next, now) : next;
      }
      switch (type) {
        case "skip-minigame":
          return s.phase === "minigame" && s.child ? finishMinigame(s, now) : s; // si assegna in base ai punti già fatti
        case "skip-draft": {
          if (s.phase !== "draft" || !s.draft) return s;
          const [rng, s2] = rngOf(s);
          const draft = draftTick(s.draft, Infinity, rng); // scadenza forzata: scelte casuali per chi non ha votato
          return draft.phase === "done" ? finishDraft({ ...s2, draft }, now) : { ...s2, draft };
        }
        case "continue":
          if (s.phase === "battle") return resolveBattleNow(s, now);
          if (s.phase === "battle-result") return afterBattle(s, now);
          return s;
        case "end":
          return s.phase === "ended" ? { ...s, phase: "done" } : s;
        default:
          return s;
      }
    },

    isFinished: (s) => s.phase === "done",

    result(s) {
      const [winners] = winnersOf(s);
      return {
        ranking: s.participants.map((p) => ({ playerId: p.id, rank: winners.has(p.id) ? 1 : 2, points: winners.has(p.id) ? s.cfg.mode.winnerPoints : sideOf(s, p.id) !== null ? s.cfg.mode.loserPoints : 0 })),
      };
    },

    // Solo l'esito del duello vale punti serata: ai minigiochi interni restano i premi (le carte).
    scores(s) {
      if (!s.outcome || s.outcome.winner === null) return [];
      const [winners, losers] = winnersOf(s);
      const deltas: ScoreDelta[] = [];
      for (const id of winners) if (s.cfg.mode.winnerPoints) deltas.push({ playerId: id, teamId: null, points: s.cfg.mode.winnerPoints, reason: "Duello: vittoria" });
      for (const id of losers) if (s.cfg.mode.loserPoints) deltas.push({ playerId: id, teamId: null, points: s.cfg.mode.loserPoints, reason: "Duello: partecipazione" });
      return deltas;
    },

    // ---- Viste: lo schermo vede solo informazioni pubbliche ----

    screenView(s) {
      if (s.phase === "done") return { phase: "done" as const, outcome: outcomeView(s), sides: sidesView(s) };
      return {
        ...common(s),
        minigame: childFrame(s, (p, st) => p.screenView(st)),
        minigameWinner: s.phase === "draft" ? s.minigameWinner : null,
        draft: s.draft ? draftPublicView(s.draft) : null,
        battle: s.battleVotes ? { progress: s.battleVotes.map(publicVoteView), deadline: s.battleVotes[0].deadline } : null,
        result: s.battle ? { events: s.battle.events.map((e) => redactEvent(e, "screen")), cards: eventCards(s, s.battle.events), winner: s.battle.winner, shownUntil: s.battle.shownUntil } : null,
        outcome: outcomeView(s),
      };
    },

    viewFor(s, playerId, teamId) {
      if (s.phase === "done") return { phase: "done" as const, outcome: outcomeView(s), sides: sidesView(s) };
      const side = sideOf(s, playerId);
      const base = {
        ...common(s),
        side,
        // Nomi dei compagni di squadra, per mostrare chi ha votato cosa (informazione del solo team).
        team: side === null ? [] : s.sides[side].members.map((id) => ({ id, nickname: s.participants.find((p) => p.id === id)?.nickname ?? "?" })),
        minigame: childFrame(s, (p, st) => p.viewFor(st, playerId, teamId)),
        minigameWinner: s.phase === "draft" ? s.minigameWinner : null,
        outcome: outcomeView(s),
      };
      if (side === null) {
        // Spettatore: vede come lo schermo, senza mano né voti.
        return { ...base, draft: s.draft ? draftPublicView(s.draft) : null, battle: s.battleVotes ? { progress: s.battleVotes.map(publicVoteView), deadline: s.battleVotes[0].deadline } : null, result: s.battle ? { events: s.battle.events.map((e) => redactEvent(e, "screen")), cards: eventCards(s, s.battle.events), winner: s.battle.winner, shownUntil: s.battle.shownUntil } : null };
      }
      const d = defs(s);
      const draft = s.draft ? draftViewFor(s.draft, side, playerId) : null;
      const draftCards = draft && draft.phase === "picking" && draft.role === "picker" ? handView(s, draft.cards) : null;
      const spied = s.spied[side];
      return {
        ...base,
        hand: handView(s, s.knights[side].hand), // privata del team: gli avversari non la ricevono mai
        spied: spied ? { uid: spied.uid, ...cardView(d[spied.cardId]!) } : null,
        draft: draft && (draftCards ? { ...draft, cards: draftCards } : draft),
        battle: s.battleVotes ? { vote: memberView(s.battleVotes[side], playerId), opponent: publicVoteView(s.battleVotes[other(side)]), deadline: s.battleVotes[side].deadline } : null,
        result: s.battle ? { events: s.battle.events.map((e) => redactEvent(e, side)), cards: eventCards(s, s.battle.events.map((e) => redactEvent(e, side))), winner: s.battle.winner, shownUntil: s.battle.shownUntil } : null,
      };
    },

    hostView(s) {
      const actions: HostAction[] = [];
      let child: unknown = null;
      if (s.phase === "minigame-select") s.cfg.pool.forEach((p, i) => actions.push({ id: `pick:${i}`, label: `Avvia: ${p.title}`, enabled: true }));
      if (s.phase === "minigame" && s.child) {
        const host = children[s.cfg.pool[s.child.poolIndex]!.typeId]!.hostView(s.child.state);
        child = { title: s.cfg.pool[s.child.poolIndex]!.title, ...(host.info as object) };
        for (const a of host.actions) actions.push({ ...a, id: `child:${a.id}` });
        actions.push({ id: "skip-minigame", label: "Chiudi il minigioco ora", enabled: true, danger: true });
      }
      if (s.phase === "draft") actions.push({ id: "skip-draft", label: "Salta il draft (scelte casuali)", enabled: true, danger: true });
      if (s.phase === "battle") actions.push({ id: "continue", label: "Rivela subito le carte", enabled: true });
      if (s.phase === "battle-result") actions.push({ id: "continue", label: "Avanti", enabled: true });
      if (s.phase === "ended") actions.push({ id: "end", label: "Concludi il duello", enabled: true });
      // La regia vede lo stato pubblico del duello, non le mani né i voti segreti dei team.
      return { info: { ...common(s), minigame: child, outcome: outcomeView(s) }, actions };
    },
  };
}
