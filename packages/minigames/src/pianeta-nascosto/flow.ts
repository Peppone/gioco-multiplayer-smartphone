import type { InputMeta, MinigameContext } from "@gioco/shared";
import { formTeams } from "../artificieri/turns.js";
import { deriveSeed, makeRng, shuffle } from "../knight-duel/rng.js";
import { type TeamVote, castVote, confirmVote, createVote, tally } from "../team-vote.js";
import { INITIAL_TARGETS, actionCost, actionError, actionResult, publicActionText } from "./actions.js";
import { botFinalGuess, botLastCall, botTheories, botTurn } from "./bot.js";
import { THEORIES_PER_PHASE, TOKENS, TOKEN_KINDS, crossingAfter, lastCallTheories, sectorOfTime } from "./board.js";
import { COMET_SECTORS } from "./sky.js";
import { FINAL_GUESS_POINTS, LOCATE_LATER_PER_SECTOR } from "./scoring.js";
import { type PianetaConfig, type PianetaState, byTurn, nOf, obsById, obsOf, turnOrderOf } from "./state.js";
import { pickScheme } from "./schemes.js";
import { type Difficulty, factsFor, generateFacts, generateSystem } from "./system.js";
import { advanceTheories, placeTheories, revealAll, reviewTheories } from "./theories.js";
import type { Action, Command, Guess, Input, Observatory } from "./types.js";

/** Le transizioni del Pianeta Nascosto: turni, rotazione della Terra, teorie, ultime opportunità, rivelazione (piano, §5.2). */

export const MAX_OBSERVATORIES = 6;
const RESOLVE_MS = 4000;
const REVIEW_MS = 6000;
const CONFERENCE_MS = 60_000;
const NO_LIMIT = 9e15;
/** La fase d'invio delle ultime opportunità: dopo tutte le fasi teoria. */
const LAST_CALL_PHASE = 1_000_000;
const MAX_PROPOSALS = 8;
const BOT_DELAY_MS: [number, number] = [3000, 5000];
const PALETTE = ["#e5484d", "#3e63dd", "#30a46c", "#f5a524", "#8e4ec6", "#12a594"];

type S = PianetaState;

export const botDifficulty = (cfg: PianetaConfig): Difficulty => (cfg.botLevel === "normal" ? "beginner" : "genius");

// ---- Creazione ----

export function createState(cfg: PianetaConfig, ctx: MinigameContext, now: number): S {
  // Con uno schema dell'app ufficiale sistema, ricerche, conferenze e fatti vengono da lì (la modalità è la sua).
  const scheme = pickScheme(cfg.source, cfg.code, cfg.mode, ctx.seed);
  const mode = scheme?.mode ?? cfg.mode;
  const rng = makeRng(ctx.seed);
  const groups = formTeams(ctx.players, ctx.teams, rng, (n) => Math.min(MAX_OBSERVATORIES, Math.max(1, Math.ceil(n / 5)))).slice(0, MAX_OBSERVATORIES - cfg.bots);
  const system = scheme ? { sky: scheme.sky, topics: scheme.research.map((r) => ({ id: r.letter, clue: r.clue })), conferences: scheme.conferences } : generateSystem(mode, ctx.seed);
  const slots = groups.length + cfg.bots;
  const allFacts = scheme ? scheme.facts : generateFacts(system.sky, mode, ctx.seed, Math.max(1, slots));
  const facts = Array.from({ length: Math.max(1, slots) }, (_, i) => allFacts[i % allFacts.length]!);
  const base = (i: number) => ({
    time: 0,
    stack: 0,
    targetsLeft: INITIAL_TARGETS,
    lastWasResearch: false,
    tokens: { ...TOKENS[mode] },
    log: [],
    notes: {},
    proposals: [],
    vote: null,
    chosen: null,
    draft: [],
    guess: null,
    readyBy: [],
    botAt: null,
    located: false,
    guessPoints: 0,
    proposalSeq: 0,
    color: PALETTE[i % PALETTE.length]!,
  });
  const humans: Observatory[] = groups.map((g, i) => ({
    ...base(i),
    id: g.id,
    slot: i,
    bot: false,
    name: g.name,
    color: g.color,
    members: g.members,
    captainId: ctx.players.find((p) => g.members.includes(p.id) && p.captain)?.id ?? g.members[0] ?? null,
    difficulty: cfg.difficulty,
    facts: factsFor(facts[i]!, cfg.difficulty),
  }));
  const bots: Observatory[] = Array.from({ length: cfg.bots }, (_, k) => {
    const i = groups.length + k;
    const difficulty = botDifficulty(cfg);
    return { ...base(i), id: `bot-${k + 1}`, slot: i, bot: true, name: `Robot ${k + 1}`, members: [], captainId: null, difficulty, facts: factsFor(facts[i]!, difficulty) };
  });
  // Tutti partono dal settore 1, in ordine casuale: chi sta in fondo alla pila gioca per primo.
  const observatories = shuffle([...humans, ...bots], rng).map((o, i) => ({ ...o, stack: i + 1 }));
  return {
    cfg: { ...cfg, mode },
    seed: ctx.seed,
    mode,
    schemeCode: scheme?.code ?? null,
    factSeries: allFacts,
    participants: ctx.players,
    players: ctx.players.map((p) => p.id),
    sky: system.sky,
    topics: system.topics,
    conferences: system.conferences.map((c) => ({ ...c, held: false })),
    observatories,
    theories: [],
    nextTheoryId: 1,
    theoryPhase: 0,
    confirmed: {},
    refuted: [],
    publicLog: [],
    earth: 0,
    phase: observatories.length === 0 ? "done" : "briefing",
    stackCounter: observatories.length,
    actingIds: [],
    finderIds: [],
    lastCall: null,
    conferenceNow: null,
    fromMaxDays: false,
    review: null,
    eventSeq: 0,
    phaseStartedAt: now,
    phaseEndsAt: null,
    pausedRemainingMs: null,
    pausedAt: null,
    hostUnlocked: false,
  };
}

// ---- Aiuti ----

const replaceObs = (s: S, obs: Observatory): S => ({ ...s, observatories: s.observatories.map((o) => (o.id === obs.id ? obs : o)) });
const patchObs = (s: S, id: string, patch: Partial<Observatory>): S => ({ ...s, observatories: s.observatories.map((o) => (o.id === id ? { ...o, ...patch } : o)) });

const log = (s: S, now: number, obsId: string, text: string, ok?: boolean): S => ({
  ...s,
  publicLog: [...s.publicLog, { id: s.publicLog.length + 1, time: Math.round(now), obsId, text, ...(ok !== undefined && { ok }) }],
});

export const minTime = (s: S): number => Math.min(...s.observatories.map((o) => o.time));
const earthSector = (s: S) => sectorOfTime(s.earth, nOf(s));
const timedPhase = (s: S) => s.phase === "turn" || s.phase === "resolve" || s.phase === "theory" || s.phase === "review" || s.phase === "conference" || s.phase === "lastCall" || s.phase === "finalGuess";

function botDelay(s: S, now: number): { s: S; at: number } {
  const rng = makeRng(deriveSeed(s.seed, 9000 + s.eventSeq));
  return { s: { ...s, eventSeq: s.eventSeq + 1 }, at: now + BOT_DELAY_MS[0] + Math.floor(rng() * (BOT_DELAY_MS[1] - BOT_DELAY_MS[0])) };
}

/** Sposta l'osservatorio `id` di `days` giorni in avanti, mettendolo davanti agli altri nel suo settore. */
function moveForward(s: S, id: string, days: number): S {
  const counter = s.stackCounter + 1;
  return { ...patchObs(s, id, { time: obsById(s, id)!.time + days, stack: counter }), stackCounter: counter };
}

// ---- Turno ----

export function beginTurn(s0: S, now: number): S {
  const order = [...s0.observatories].sort(byTurn);
  const acting = s0.cfg.turnMode === "sequential" ? [order[0]!] : order.filter((o) => o.time === order[0]!.time);
  let s: S = { ...s0, phase: "turn", phaseStartedAt: now, phaseEndsAt: s0.cfg.turnSeconds > 0 ? now + s0.cfg.turnSeconds * 1000 : null, actingIds: acting.map((o) => o.id), conferenceNow: null, review: null };
  for (const o of acting) {
    if (o.bot) {
      const d = botDelay(s, now);
      s = patchObs(d.s, o.id, { botAt: d.at, chosen: null });
    } else {
      s = patchObs(s, o.id, { chosen: null, proposals: [], proposalSeq: 0, vote: createVote({ options: [], max: 1, members: o.members, deadline: NO_LIMIT }), botAt: null });
    }
  }
  return s;
}

/** Sceglie la proposta vincente: la più votata (in parità, quella del capitano se è tra le prime, altrimenti la votata per prima). */
function settleTurn(s: S, id: string, now: number): S {
  const obs = obsById(s, id)!;
  if (obs.chosen) return s;
  let action: Action = { type: "pass" };
  if (obs.vote && obs.proposals.length > 0) {
    const ranked = tally(obs.vote);
    const top = ranked.filter((t) => t.count === ranked[0]?.count);
    const captainPick = obs.captainId ? obs.vote.picks[obs.captainId]?.[0]?.option : undefined;
    const winner = (captainPick && top.find((t) => t.option === captainPick)?.option) ?? top[0]?.option ?? obs.proposals[0]!.id;
    action = obs.proposals.find((p) => p.id === winner)?.action ?? obs.proposals[0]!.action;
  }
  return maybeResolve(patchObs(s, id, { chosen: action }), now);
}

function maybeResolve(s: S, now: number): S {
  return s.phase === "turn" && s.actingIds.every((id) => obsById(s, id)!.chosen) ? resolveTurn(s, now) : s;
}

function resolveTurn(s0: S, now: number): S {
  const acting = s0.actingIds.map((id) => obsById(s0, id)!).sort(byTurn);
  let s = s0;
  const finders: string[] = [];
  for (const o of acting) {
    const cur = obsById(s, o.id)!;
    let action = cur.chosen ?? ({ type: "pass" } as Action);
    if (actionError(action, cur, s.mode)) action = { type: "pass" };
    const result = actionResult(action, s.sky);
    const cost = actionCost(action, s.mode);
    s = patchObs(s, o.id, {
      log: [...cur.log, { time: cur.time, action, cost, result }],
      targetsLeft: action.type === "target" ? cur.targetsLeft - 1 : cur.targetsLeft,
      lastWasResearch: action.type === "research",
      located: result.type === "locate" && result.ok,
      chosen: null,
      vote: null,
      proposals: [],
      botAt: null,
    });
    s = log(s, now, o.id, publicActionText(action, result), result.type === "locate" ? result.ok : undefined);
    if (result.type === "locate" && result.ok) finders.push(o.id);
    s = patchObs(s, o.id, { time: cur.time + cost });
  }
  // Dopo la risoluzione i segnalini si mettono davanti, da dietro in avanti.
  for (const o of acting) {
    const counter = s.stackCounter + 1;
    s = { ...patchObs(s, o.id, { stack: counter }), stackCounter: counter };
  }
  return { ...s, phase: "resolve", phaseStartedAt: now, phaseEndsAt: now + RESOLVE_MS, finderIds: finders, actingIds: [] };
}

// ---- Dopo una fase: fine partita o rotazione ----

function afterPhase(s: S, now: number): S {
  if (s.finderIds.length > 0) return startLastCall(s, now);
  if (s.cfg.maxDays > 0 && minTime(s) > s.cfg.maxDays) return startFinalGuess(s, now);
  return rotate(s, now);
}

/** La Terra ruota un settore alla volta fino alla freccia sul più arretrato; si ferma sulle icone. */
function rotate(s0: S, now: number): S {
  let s = s0;
  const target = minTime(s);
  while (s.earth < target) {
    const from = earthSector(s);
    s = { ...s, earth: s.earth + 1 };
    for (const c of crossingAfter(s.mode, from)) {
      if (!c) continue;
      if (c.kind === "theory") return startTheory(s, now);
      const conf = s.conferences.find((x) => x.id === c.id);
      if (conf && !conf.held) {
        const held = { ...s, conferences: s.conferences.map((x) => (x.id === c.id ? { ...x, held: true } : x)), conferenceNow: c.id, phase: "conference" as const, phaseStartedAt: now, phaseEndsAt: now + CONFERENCE_MS };
        return log(held, now, "", `Conferenza ${c.id}`);
      }
    }
  }
  return beginTurn(s, now);
}

// ---- Teorie ----

function startCollect(s0: S, now: number, phase: "theory" | "lastCall" | "finalGuess", who: string[]): S {
  let s: S = { ...s0, phase, phaseStartedAt: now, phaseEndsAt: s0.cfg.theorySeconds > 0 ? now + s0.cfg.theorySeconds * 1000 : null, actingIds: who, conferenceNow: null, review: null };
  for (const o of s.observatories) {
    if (!who.includes(o.id)) continue;
    const base = { draft: [], guess: null, readyBy: [] as string[], botAt: null as number | null };
    if (o.bot) {
      const d = botDelay(s, now);
      s = patchObs(d.s, o.id, { ...base, botAt: d.at });
    } else s = patchObs(s, o.id, base);
  }
  return s;
}

function startTheory(s0: S, now: number): S {
  const s = startCollect({ ...s0, theoryPhase: s0.theoryPhase + 1 }, now, "theory", s0.observatories.map((o) => o.id));
  // Chi non ha più gettoni non ha nulla da scegliere.
  return s.observatories.reduce((acc, o) => (!o.bot && TOKEN_KINDS.every((k) => o.tokens[k] <= 0) ? patchObs(acc, o.id, { readyBy: o.members }) : acc), s);
}

const draftLimit = (s: S, obs: Observatory): number => (s.phase === "lastCall" ? lastCallTheories(s.lastCall?.[obs.id] ?? 0) : THEORIES_PER_PHASE[s.mode]);

/** Tutti i partecipanti hanno finito di scegliere. */
function collectDone(s: S): boolean {
  return s.actingIds.every((id) => {
    const o = obsById(s, id)!;
    if (o.bot) return o.readyBy.length > 0;
    return s.cfg.decision === "captain" ? !!o.captainId && o.readyBy.includes(o.captainId) : o.members.every((m) => o.readyBy.includes(m));
  });
}

function closeTheory(s0: S, now: number): S {
  let s = s0;
  const order = [...s.observatories].sort(byTurn);
  const picks = order.flatMap((o) => o.draft.filter((d) => o.tokens[d.object] > 0).slice(0, THEORIES_PER_PHASE[s.mode]).map((d) => ({ ownerId: o.id, ...d })));
  const placed = placeTheories(s.theories, picks, s.theoryPhase, s.nextTheoryId, s.confirmed);
  for (const p of placed.placed) {
    const o = obsById(s, p.ownerId)!;
    s = patchObs(s, o.id, { tokens: { ...o.tokens, [p.object]: o.tokens[p.object] - 1 } });
    s = log(s, now, o.id, `invia una teoria sul settore ${p.sector}`);
  }
  s = { ...s, nextTheoryId: s.nextTheoryId + placed.placed.length, observatories: s.observatories.map((o) => ({ ...o, draft: [], readyBy: [] })) };
  const advanced = advanceTheories(placed.theories);
  const review = reviewTheories(s.sky, advanced, turnOrderOf(s));
  s = { ...s, theories: review.theories, confirmed: { ...s.confirmed, ...review.confirmed }, refuted: [...s.refuted, ...review.refuted] };
  for (const [sector, object] of Object.entries(review.confirmed)) s = log(s, now, "", `Settore ${sector} confermato: ${object}`);
  for (const p of review.penalties) {
    s = moveForward(s, p.ownerId, 1);
    s = log(s, now, p.ownerId, `teoria sbagliata sul settore ${p.sector}: avanza di 1`);
  }
  return { ...s, phase: "review", phaseStartedAt: now, phaseEndsAt: now + REVIEW_MS, actingIds: [], review: { events: review.events, penalties: review.penalties } };
}

// ---- Ultime opportunità, ipotesi finale, rivelazione ----

function startLastCall(s0: S, now: number): S {
  const ref = Math.max(...s0.finderIds.map((id) => obsById(s0, id)!.time));
  const lags: Record<string, number> = {};
  for (const o of s0.observatories) if (!s0.finderIds.includes(o.id) && ref - o.time >= 1) lags[o.id] = ref - o.time;
  if (Object.keys(lags).length === 0) return startReveal({ ...s0, lastCall: lags }, now);
  return startCollect({ ...s0, lastCall: lags }, now, "lastCall", Object.keys(lags));
}

function startFinalGuess(s: S, now: number): S {
  return startCollect({ ...s, fromMaxDays: true }, now, "finalGuess", s.observatories.map((o) => o.id));
}

const isRight = (s: S, g: Guess): boolean => {
  const n = nOf(s);
  return s.sky[g.sector - 1] === "planetX" && s.sky[((g.sector + n - 2) % n)] === g.left && s.sky[g.sector % n] === g.right;
};

function closeLastCall(s0: S, now: number): S {
  let s = s0;
  const order = [...s.observatories].filter((o) => s.lastCall?.[o.id]).sort(byTurn);
  const picks = order.flatMap((o) => o.draft.filter((d) => o.tokens[d.object] > 0).slice(0, lastCallTheories(s.lastCall![o.id]!)).map((d) => ({ ownerId: o.id, ...d })));
  let id = s.nextTheoryId;
  for (const p of picks) {
    const o = obsById(s, p.ownerId)!;
    if (s.confirmed[p.sector] !== undefined) continue;
    s = patchObs(s, o.id, { tokens: { ...o.tokens, [p.object]: o.tokens[p.object] - 1 } });
    s = { ...s, theories: [...s.theories, { id: id++, ownerId: o.id, sector: p.sector, object: p.object, space: 3, phase: LAST_CALL_PHASE, faceUp: false, correct: null }] };
  }
  s = { ...s, nextTheoryId: id };
  for (const o of order) {
    const g = obsById(s, o.id)!.guess;
    if (g && isRight(s, g)) s = patchObs(s, o.id, { guessPoints: s.lastCall![o.id]! * LOCATE_LATER_PER_SECTOR });
  }
  return startReveal(s, now);
}

function closeFinalGuess(s0: S, now: number): S {
  let s = s0;
  for (const o of s.observatories) if (o.guess && isRight(s, o.guess)) s = patchObs(s, o.id, { guessPoints: FINAL_GUESS_POINTS });
  return startReveal(s, now);
}

function startReveal(s: S, now: number): S {
  return { ...s, theories: revealAll(s.sky, s.theories), phase: "reveal", phaseStartedAt: now, phaseEndsAt: null, actingIds: [], review: null, conferenceNow: null, observatories: s.observatories.map((o) => ({ ...o, draft: [], readyBy: [], botAt: null, proposals: [], vote: null, chosen: null })) };
}

/** Chiude la fase di raccolta in corso (teoria, ultime opportunità, ipotesi finale). */
function closeCollect(s: S, now: number): S {
  // La revisione ha una pausa propria: `closeTheory` imposta già la fase `review`.
  if (s.phase === "theory") return closeTheory(s, now);
  if (s.phase === "lastCall") return closeLastCall(s, now);
  return closeFinalGuess(s, now);
}

const afterReview = afterPhase;

// ---- Tick ----

function runBots(s0: S, now: number): S {
  let s = s0;
  for (const id of s0.actingIds) {
    const o = obsById(s, id)!;
    if (!o.bot || o.botAt === null || now < o.botAt) continue;
    if (s.phase === "turn" && !o.chosen) s = maybeResolve(patchObs(s, id, { chosen: botTurn(s, o), botAt: null }), now);
    else if (s.phase === "theory" && o.readyBy.length === 0) s = patchObs(s, id, { draft: botTheories(s, o), readyBy: ["bot"], botAt: null });
    else if (s.phase === "lastCall" && o.readyBy.length === 0) {
      const r = botLastCall(s, o, s.lastCall?.[id] ?? 0);
      s = patchObs(s, id, { draft: r.theories, guess: r.guess, readyBy: ["bot"], botAt: null });
    } else if (s.phase === "finalGuess" && o.readyBy.length === 0) s = patchObs(s, id, { guess: botFinalGuess(s, o), readyBy: ["bot"], botAt: null });
    if (s.phase !== s0.phase) return s;
  }
  return s;
}

export function tick(state: S, now: number): S {
  if (state.pausedRemainingMs !== null) return state;
  let s = state;
  const due = s.phaseEndsAt !== null && now >= s.phaseEndsAt;
  switch (s.phase) {
    case "turn": {
      s = runBots(s, now);
      if (s.phase === "turn" && due) {
        for (const id of s.actingIds) {
          const o = obsById(s, id)!;
          if (o.chosen) continue;
          s = o.bot ? maybeResolve(patchObs(s, id, { chosen: botTurn(s, o), botAt: null }), now) : settleTurn(s, id, now);
          if (s.phase !== "turn") break;
        }
      }
      return s;
    }
    case "resolve":
      return due ? afterPhase(s, now) : s;
    case "conference":
      return due ? rotate(s, now) : s;
    case "review":
      return due ? afterReview(s, now) : s;
    case "theory":
    case "lastCall":
    case "finalGuess":
      s = runBots(s, now);
      if (s.phase === state.phase && (due || collectDone(s))) return closeCollect(s, now);
      return s;
    default:
      return s;
  }
}

// ---- Input dei giocatori ----

const noteKey = (sector: number, object: string) => `${sector}:${object}`;
const NOTE_OBJECTS = ["asteroid", "dwarf", "comet", "gas", "empty", "planetX"] as const;

export function handleInput(s: S, playerId: string, input: Input, meta: InputMeta): S {
  const obs = obsOf(s, playerId);
  if (!obs || obs.bot || !s.players.includes(playerId)) return s;
  const n = nOf(s);
  const now = meta.receivedAt;

  // Il foglio appunti vale sempre, anche in pausa.
  if (input.type === "note") {
    if (input.sector > n) return s;
    const key = noteKey(input.sector, input.object);
    const notes = { ...obs.notes };
    if (input.mark === null) delete notes[key];
    else notes[key] = input.mark;
    return replaceObs(s, { ...obs, notes });
  }
  if (input.type === "noteSector") {
    if (input.sector > n) return s;
    const notes = { ...obs.notes };
    const keys = NOTE_OBJECTS.filter((o) => o !== "comet" || (COMET_SECTORS[s.mode] as number[]).includes(input.sector)).map((o) => noteKey(input.sector, o));
    if (input.mark === "clear") keys.forEach((k) => delete notes[k]);
    else if (input.mark === "looksEmpty") {
      for (const k of keys) notes[k] = k.endsWith(":empty") || k.endsWith(":planetX") ? "supposed" : "excluded";
    } else for (const k of keys) notes[k] ??= "excluded";
    return replaceObs(s, { ...obs, notes });
  }
  if (s.pausedRemainingMs !== null) return s;

  switch (s.phase) {
    case "turn":
      return turnInput(s, obs, playerId, input, now);
    case "theory":
    case "lastCall":
    case "finalGuess":
      return collectInput(s, obs, playerId, input, now);
    default:
      return s;
  }
}

function turnInput(s: S, obs: Observatory, playerId: string, input: Input, now: number): S {
  if (!s.actingIds.includes(obs.id) || obs.chosen || !obs.vote) return s;
  switch (input.type) {
    case "propose": {
      const action = input.action as Action;
      if (actionError(action, obs, s.mode) || obs.proposals.length >= MAX_PROPOSALS) return s;
      const same = obs.proposals.find((p) => JSON.stringify(p.action) === JSON.stringify(action));
      const id = same?.id ?? `p${obs.proposalSeq + 1}`;
      const proposals = same ? obs.proposals : [...obs.proposals, { id, by: playerId, action }];
      let vote: TeamVote = same ? obs.vote : { ...obs.vote, options: [...obs.vote.options, id] };
      if (s.cfg.decision === "vote" && !(vote.picks[playerId] ?? []).some((p) => p.option === id)) vote = castVote(vote, playerId, id);
      return replaceObs(s, { ...obs, proposals, proposalSeq: same ? obs.proposalSeq : obs.proposalSeq + 1, vote });
    }
    case "vote":
      if (s.cfg.decision !== "vote" || !obs.proposals.some((p) => p.id === input.proposalId)) return s;
      return replaceObs(s, { ...obs, vote: castVote(obs.vote, playerId, input.proposalId) });
    case "decide": {
      if (obs.captainId !== playerId) return s;
      const proposal = obs.proposals.find((p) => p.id === input.proposalId);
      return proposal ? maybeResolve(patchObs(s, obs.id, { chosen: proposal.action }), now) : s;
    }
    case "ready": {
      if (s.cfg.decision !== "vote") return s;
      const vote = confirmVote(obs.vote, playerId);
      const next = replaceObs(s, { ...obs, vote });
      return vote.members.every((m) => vote.ready.includes(m)) ? settleTurn(next, obs.id, now) : next;
    }
    default:
      return s;
  }
}

function collectInput(s: S, obs: Observatory, playerId: string, input: Input, now: number): S {
  if (!s.actingIds.includes(obs.id)) return s;
  const n = nOf(s);
  switch (input.type) {
    case "theory": {
      if (s.phase === "finalGuess" || input.sector > n || s.confirmed[input.sector] !== undefined) return s;
      if (input.object === "comet" && !(COMET_SECTORS[s.mode] as number[]).includes(input.sector)) return s;
      const others = obs.draft.filter((d) => d.sector !== input.sector);
      if (others.length >= draftLimit(s, obs)) return s;
      // Contando anche le teorie già scelte nella stessa fase.
      if (others.filter((d) => d.object === input.object).length >= obs.tokens[input.object]) return s;
      return replaceObs(s, { ...obs, draft: [...others, { sector: input.sector, object: input.object }], guess: null, readyBy: [] });
    }
    case "withdraw":
      return replaceObs(s, { ...obs, draft: obs.draft.filter((d) => d.sector !== input.sector), readyBy: [] });
    case "guess": {
      if (input.sector > n) return s;
      const g: Guess = { sector: input.sector, left: input.left, right: input.right };
      return replaceObs(s, { ...obs, guess: g, draft: s.phase === "lastCall" ? [] : obs.draft, readyBy: [] });
    }
    case "ready": {
      if (obs.readyBy.includes(playerId)) return replaceObs(s, { ...obs, readyBy: obs.readyBy.filter((m) => m !== playerId) });
      const next = replaceObs(s, { ...obs, readyBy: [...obs.readyBy, playerId] });
      return collectDone(next) ? closeCollect(next, now) : next;
    }
    default:
      return s;
  }
}

// ---- Comandi della regia ----

function shiftTimes(s: S, d: number): S {
  return { ...s, phaseStartedAt: s.phaseStartedAt + d, observatories: s.observatories.map((o) => (o.botAt === null ? o : { ...o, botAt: o.botAt + d })) };
}

export function handleCommand(s: S, command: Command, now: number): S {
  switch (command.type) {
    case "start":
      return s.phase === "briefing" ? beginTurn(s, now) : s;
    case "pause":
      if (!timedPhase(s) || s.pausedRemainingMs !== null) return s;
      return { ...s, pausedRemainingMs: s.phaseEndsAt === null ? 0 : Math.max(0, s.phaseEndsAt - now), phaseEndsAt: null, pausedAt: now };
    case "resume": {
      if (s.pausedRemainingMs === null || s.pausedAt === null) return s;
      const shifted = shiftTimes(s, now - s.pausedAt);
      return { ...shifted, phaseEndsAt: s.pausedRemainingMs > 0 || timedWithLimit(s) ? now + s.pausedRemainingMs : null, pausedRemainingMs: null, pausedAt: null };
    }
    case "next":
      switch (s.phase) {
        case "conference":
          return rotate(s, now);
        case "review":
          return afterReview(s, now);
        case "resolve":
          return afterPhase(s, now);
        case "theory":
        case "lastCall":
        case "finalGuess":
          return closeCollect(s, now);
        case "reveal":
          return { ...s, phase: "final", phaseStartedAt: now, phaseEndsAt: null };
        case "final":
          return { ...s, phase: "done", phaseStartedAt: now, phaseEndsAt: null };
        default:
          return s;
      }
    case "force-decide":
      if (s.phase !== "turn") return s;
      return s.actingIds.reduce((acc, id) => (acc.phase === "turn" ? settleTurn(acc, id, now) : acc), s);
    case "skip":
      if (s.phase !== "turn") return s;
      return s.actingIds.reduce((acc, id) => (acc.phase === "turn" && !obsById(acc, id)!.chosen ? maybeResolve(patchObs(acc, id, { chosen: { type: "pass" } }), now) : acc), s);
    case "set-difficulty": {
      if (s.phase !== "briefing") return s;
      const target = s.observatories.find((o) => o.id === command.teamId);
      if (!target) return s;
      return patchObs(s, target.id, { difficulty: command.difficulty, facts: factsFor(s.factSeries[target.slot % s.factSeries.length]!, command.difficulty) });
    }
    case "unlock-solution":
      return s.hostUnlocked ? s : { ...s, hostUnlocked: true };
    case "end":
      if (s.phase === "reveal" || s.phase === "final" || s.phase === "done") return s;
      return startReveal({ ...s, pausedRemainingMs: null, pausedAt: null }, now);
  }
}

const timedWithLimit = (s: S) => (s.phase === "turn" ? s.cfg.turnSeconds > 0 : s.phase === "theory" || s.phase === "lastCall" || s.phase === "finalGuess" ? s.cfg.theorySeconds > 0 : true);
