import { z } from "zod";
import { type MinigameType, type ScoreDelta } from "@gioco/shared";
import { formTeams } from "../artificieri/turns.js";
import { makeRng } from "../knight-duel/rng.js";
import { memberView } from "../team-vote.js";
import { rankByPoints } from "../util.js";
import { actionCost, actionError, clueText, logText } from "./actions.js";
import { importedSchemes } from "./schemes.js";
import { THEORIES_PER_PHASE, TOKENS, arcSectors, lastCallTheories, sectorOfTime, visibleSectors } from "./board.js";
import { clueLabel } from "./clues.js";
import { MAX_OBSERVATORIES, createState, handleCommand, handleInput, tick } from "./flow.js";
import { type Breakdown, breakdownOf, rankObservatories } from "./scoring.js";
import { type PianetaConfig, type PianetaState, nOf, obsOf, pianetaConfigSchema } from "./state.js";
import { type Action, type Command, type Input, type Mark, type Observatory, commandSchema, inputSchema } from "./types.js";

/**
 * Il Pianeta Nascosto: deduzione a squadre in stile *The Search for Planet X*. Ogni squadra è un osservatorio che scruta
 * un sistema solare di 12 o 18 settori; il Pianeta X appare vuoto agli strumenti e si trova per deduzione. Agisce l'osservatorio più
 * indietro sul tracciato del tempo; le azioni sono pubbliche, i risultati solo della squadra. Piano e decisioni in
 * docs/PIANO-PIANETA-NASCOSTO.md.
 */

type S = PianetaState;

export { type PianetaConfig, type PianetaState, pianetaConfigSchema };

// ---- Punti ----

function rows(s: S): { id: string; breakdown: Breakdown }[] {
  return s.observatories.map((o) => ({ id: o.id, breakdown: breakdownOf(o, s.theories, s.mode, s.finderIds) }));
}

/** I punti dei giocatori: quelli della loro squadra, per il moltiplicatore. I robot non entrano mai nella classifica generale. */
function playerTotals(s: S): Record<string, number> {
  const totals: Record<string, number> = {};
  if (s.phase !== "final" && s.phase !== "done") return totals;
  for (const r of rows(s)) for (const m of s.observatories.find((o) => o.id === r.id)!.members) totals[m] = r.breakdown.total * s.cfg.pointScale;
  return totals;
}

// ---- Viste ----

const actionText = (a: Action): string => {
  switch (a.type) {
    case "survey":
      return `Rileva ${a.object} ${a.from}–${a.to}`;
    case "target":
      return `Punta ${a.sector}`;
    case "research":
      return `Ricerca ${a.topic}`;
    case "locate":
      return `Localizza ${a.sector}`;
    case "pass":
      return "Passa";
  }
};

function researchTextOf(s: S, topic: string): string {
  const t = s.topics.find((x) => x.id === topic);
  return t ? clueText(t.clue) : "";
}

function settingsOf(s: S) {
  const c = s.cfg;
  return {
    mode: s.mode,
    sectors: nOf(s),
    turnMode: c.turnMode,
    decision: c.decision,
    maxDays: c.maxDays,
    turnSeconds: c.turnSeconds,
    theorySeconds: c.theorySeconds,
    assist: c.assist,
    tokens: TOKENS[s.mode],
    theoriesPerPhase: THEORIES_PER_PHASE[s.mode],
    targets: 2,
    pointScale: c.pointScale,
  };
}

const showSky = (s: S) => s.phase === "reveal" || s.phase === "final" || s.phase === "done";

/** La parte uguale per tutti (schermo e telefoni): niente sistema, niente risultati, niente foglio. */
function publicBase(s: S) {
  const n = nOf(s);
  const done = s.phase === "final" || s.phase === "done";
  return {
    phase: s.phase,
    phaseStartedAt: s.phaseStartedAt,
    phaseEndsAt: s.phaseEndsAt,
    pausedRemainingMs: s.pausedRemainingMs,
    settings: settingsOf(s),
    earth: s.earth,
    earthSector: sectorOfTime(s.earth, n),
    observatories: s.observatories.map((o) => ({ id: o.id, name: o.name, color: o.color, bot: o.bot, time: o.time, stack: o.stack, members: o.members.length, sector: sectorOfTime(o.time, n) })),
    actingIds: s.actingIds,
    topics: s.topics.map((t) => ({ id: t.id, label: clueLabel(t.clue), readBy: s.observatories.filter((o) => o.log.some((l) => l.result.type === "research" && l.result.topic === t.id)).map((o) => o.id) })),
    conferences: s.conferences.map((c) => ({ id: c.id, label: clueLabel(c.clue), held: c.held, text: c.held ? clueText(c.clue) : null })),
    conferenceNow: s.conferenceNow,
    confirmed: s.confirmed,
    refuted: s.refuted,
    theories: s.theories.map((t) => ({ id: t.id, ownerId: t.ownerId, sector: t.sector, space: t.space, faceUp: t.faceUp, object: t.faceUp ? t.object : null })),
    review: s.review,
    publicLog: s.publicLog.slice(-60),
    lastCall: s.lastCall ? Object.keys(s.lastCall) : null,
    fromMaxDays: s.fromMaxDays,
    ...(showSky(s) && { sky: s.sky }),
    ...(done && { scores: scoreRows(s) }),
  };
}

function scoreRows(s: S) {
  const ranked = rankObservatories(rows(s));
  return rows(s).map((r) => ({ id: r.id, rank: ranked.find((x) => x.id === r.id)!.rank, breakdown: r.breakdown }));
}

/** Segni che il foglio mette da solo: fatti iniziali, revisioni e, con l'aiuto acceso, le certezze dirette. */
function fixedMarks(s: S, obs: Observatory): Record<string, Mark> {
  const out: Record<string, Mark> = {};
  for (const f of obs.facts) out[`${f.sector}:${f.absent}`] = "excluded";
  for (const r of s.refuted) out[`${r.sector}:${r.object}`] = "excluded";
  for (const [sector, kind] of Object.entries(s.confirmed)) {
    for (const o of ["asteroid", "dwarf", "comet", "gas", "empty", "planetX"]) out[`${sector}:${o}`] = o === kind ? "confirmed" : "excluded";
  }
  if (s.cfg.assist) {
    const n = nOf(s);
    for (const l of obs.log) {
      if (l.action.type === "target" && l.result.type === "target") {
        const seen = l.result.seen;
        for (const o of ["asteroid", "dwarf", "comet", "gas", "empty", "planetX"]) {
          const hit = seen === "empty" ? o === "empty" || o === "planetX" : o === seen;
          if (!hit) out[`${l.action.sector}:${o}`] ??= "excluded";
          else if (seen !== "empty") out[`${l.action.sector}:${o}`] ??= "confirmed";
        }
      } else if (l.action.type === "survey" && l.result.type === "survey") {
        const arc = arcSectors(l.action.from, l.action.to, n);
        const object = l.action.object;
        if (l.result.count === 0) for (const sec of arc) for (const o of object === "empty" ? ["empty", "planetX"] : [object]) out[`${sec}:${o}`] ??= "excluded";
        else if (l.result.count === arc.length && object !== "empty") for (const sec of arc) out[`${sec}:${object}`] ??= "confirmed";
      }
    }
  }
  return out;
}

function teamPrivate(s: S, obs: Observatory, playerId: string) {
  const n = nOf(s);
  const acting = s.actingIds.includes(obs.id);
  const collecting = s.phase === "theory" || s.phase === "lastCall" || s.phase === "finalGuess";
  const lag = s.lastCall?.[obs.id] ?? 0;
  return {
    id: obs.id,
    playerId,
    name: obs.name,
    color: obs.color,
    captainId: obs.captainId,
    isCaptain: obs.captainId === playerId,
    difficulty: obs.difficulty,
    facts: obs.facts,
    tokens: obs.tokens,
    targetsLeft: obs.targetsLeft,
    lastWasResearch: obs.lastWasResearch,
    log: obs.log.map((l) => ({ time: l.time, cost: l.cost, text: logText(l.action, l.result, l.result.type === "research" ? researchTextOf(s, l.result.topic) : undefined), result: l.result, action: l.action })),
    research: obs.log.flatMap((l) => (l.result.type === "research" ? [{ topic: l.result.topic, text: researchTextOf(s, l.result.topic) }] : [])),
    notes: obs.notes,
    fixed: fixedMarks(s, obs),
    acting,
    visible: visibleSectors(sectorOfTime(obs.time, n), n),
    turn:
      s.phase === "turn" && acting && obs.vote
        ? {
            proposals: obs.proposals.map((p) => ({ id: p.id, by: p.by, action: p.action, text: actionText(p.action), cost: actionCost(p.action, s.mode), error: actionError(p.action, obs, s.mode) })),
            vote: memberView(obs.vote, playerId),
            chosen: obs.chosen,
          }
        : null,
    collect: collecting && acting ? { draft: obs.draft, guess: obs.guess, ready: obs.readyBy.includes(playerId), readyBy: obs.readyBy.length, limit: s.phase === "finalGuess" ? 0 : s.phase === "lastCall" ? lastCallTheories(lag) : THEORIES_PER_PHASE[s.mode], lag, canGuess: s.phase !== "theory" } : null,
    myTheories: s.theories.filter((t) => t.ownerId === obs.id).map((t) => ({ id: t.id, sector: t.sector, object: t.object, space: t.space, faceUp: t.faceUp })),
  };
}

// ---- Il plugin ----

export const pianetaNascosto: MinigameType<PianetaConfig, PianetaState, Input, Command> = {
  id: "pianeta-nascosto",
  title: "Il Pianeta Nascosto",
  defaultTheme: "retro80",
  teamBased: true,
  minPlayers: 1,
  configSchema: pianetaConfigSchema as unknown as z.ZodType<PianetaConfig>,
  inputSchema,
  commandSchema,
  // Senza limite di giorni un round non finisce da solo: l'esempio ne ha uno, perché serve a provare il flusso.
  sampleConfig: pianetaConfigSchema.parse({ maxDays: 60 }),

  buildConfig(raw, _lookup, roster) {
    const parsed = pianetaConfigSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".") || "config"}: ${i.message}`).join("; ") };
    const cfg = parsed.data;
    if (cfg.source === "official") {
      const scheme = cfg.code ? importedSchemes.get(cfg.code) : undefined;
      if (cfg.code && !scheme) return { ok: false, error: `Lo schema «${cfg.code}» non è tra quelli importati` };
      if (!cfg.code && importedSchemes.count(cfg.mode) === 0) return { ok: false, error: "Nessuno schema importato (Libreria → Schemi dell'app ufficiale)" };
      if (scheme) cfg.mode = scheme.mode;
    }
    const groups = formTeams(roster.players, roster.teams, makeRng(1), (n) => Math.min(MAX_OBSERVATORIES, Math.max(1, Math.ceil(n / 5)))).length;
    if (groups === 0 && cfg.bots === 0) return { ok: false, error: "Servono almeno una squadra o un robot" };
    if (groups === 1 && cfg.bots === 0) return { ok: false, error: "Con una sola squadra serve almeno un osservatorio robot (impostazione «Osservatori robot»)" };
    if (groups + cfg.bots > MAX_OBSERVATORIES) return { ok: false, error: `Al massimo ${MAX_OBSERVATORIES} osservatori: ${groups} squadre e ${cfg.bots} robot sono troppi` };
    return { ok: true, config: cfg };
  },

  init: (config, ctx, now) => createState(config, ctx, now),
  onInput: (state, playerId, input, meta) => handleInput(state, playerId, input, meta),
  onTick: (state, now) => tick(state, now),
  onHostCommand: (state, command, now) => handleCommand(state, command, now),
  isFinished: (state) => state.phase === "done",

  scores(state): ScoreDelta[] {
    return Object.entries(playerTotals(state)).filter(([, points]) => points !== 0).map(([playerId, points]) => ({ playerId, teamId: null, points, reason: "Il Pianeta Nascosto" }));
  },
  result: (state) => rankByPoints(playerTotals(state), state.players),

  screenView: (state) => publicBase(state),

  viewFor(state, playerId) {
    const base = publicBase(state);
    const obs = obsOf(state, playerId);
    if (!state.players.includes(playerId) || !obs) return { ...base, mine: null };
    return { ...base, mine: teamPrivate(state, obs, playerId) };
  },

  hostView(state) {
    const paused = state.pausedRemainingMs !== null;
    const open = state.hostUnlocked || !state.cfg.blindHost;
    const timed = state.phase === "turn" || state.phase === "theory" || state.phase === "lastCall" || state.phase === "finalGuess" || state.phase === "conference" || state.phase === "review" || state.phase === "resolve";
    const collecting = state.phase === "theory" || state.phase === "lastCall" || state.phase === "finalGuess";
    return {
      info: {
        ...publicBase(state),
        unlocked: open,
        blind: state.cfg.blindHost,
        details: state.observatories.map((o) => ({
          id: o.id,
          difficulty: o.difficulty,
          bot: o.bot,
          members: o.members.map((id) => ({ id, nickname: state.participants.find((p) => p.id === id)?.nickname ?? "?" })),
          captainId: o.captainId,
          acting: state.actingIds.includes(o.id),
          decided: !!o.chosen,
          proposals: o.proposals.length,
          ready: o.readyBy.length,
          tokens: o.tokens,
          targetsLeft: o.targetsLeft,
          ...(open && { facts: o.facts, log: o.log.map((l) => ({ time: l.time, text: logText(l.action, l.result, l.result.type === "research" ? researchTextOf(state, l.result.topic) : undefined) })) }),
        })),
        ...(open && { solution: { code: state.schemeCode, sky: state.sky, topics: state.topics.map((t) => ({ id: t.id, text: clueText(t.clue) })), conferences: state.conferences.map((c) => ({ id: c.id, text: clueText(c.clue) })) } }),
      },
      actions: [
        { id: "start", label: "Inizia", enabled: state.phase === "briefing" },
        { id: "next", label: state.phase === "turn" ? "Avanti" : collecting ? "Chiudi la fase" : "Avanti", enabled: ["conference", "review", "resolve", "theory", "lastCall", "finalGuess", "reveal", "final"].includes(state.phase) },
        { id: "skip", label: "Passa il turno", enabled: state.phase === "turn" },
        { id: "force-decide", label: "Applica la proposta più votata", enabled: state.phase === "turn" && state.actingIds.some((id) => state.observatories.find((o) => o.id === id)!.proposals.length > 0) },
        paused ? { id: "resume", label: "Riprendi", enabled: true } : { id: "pause", label: "Pausa", enabled: timed },
        { id: "unlock-solution", label: "Mostra la soluzione", enabled: !state.hostUnlocked && state.cfg.blindHost, danger: true },
        { id: "end", label: "Termina il round", enabled: state.phase !== "reveal" && state.phase !== "final" && state.phase !== "done", danger: true },
      ],
    };
  },
};

