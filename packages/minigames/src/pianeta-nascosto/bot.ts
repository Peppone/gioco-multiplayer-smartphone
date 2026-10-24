import { deriveSeed, makeRng } from "../knight-duel/rng.js";
import { actionCost, actionError } from "./actions.js";
import { type Token, THEORIES_PER_PHASE, TOKEN_KINDS, arcSectors, lastCallTheories, sectorOfTime, visibleSectors } from "./board.js";
import { THEORY_POINTS } from "./scoring.js";
import { type SolveResult, solve, solveCached } from "./solver.js";
import { type ObjectKind, type Seen, SECTORS, neighbors, seenOf } from "./sky.js";
import { type PianetaState, knowledgeOf } from "./state.js";
import { TOPIC_IDS } from "./system.js";
import type { Action, Guess, Observatory } from "./types.js";

/**
 * Il bot del Pianeta Nascosto (piano, §6): parte dai sistemi compatibili con ciò che sa, sceglie l'azione con la miglior
 * informazione per giorno speso, localizza e fa teorie **solo quando è certo**. Funzioni pure e deterministiche.
 */

const ENUM_NODES = 120_000;
const SAMPLE_NODES = 60_000;
const SAMPLE_SIZE = 120;
const SCORING_CAP = 500;

export interface Belief {
  skies: ObjectKind[][];
  /** L'elenco è completo: ciò su cui concordano tutti i sistemi è **certo**. */
  exact: boolean;
}

export function beliefOf(s: PianetaState, obs: Observatory): Belief {
  const k = knowledgeOf(s, obs);
  const full: SolveResult = solveCached(k, ENUM_NODES);
  if (full.complete) return { skies: full.skies, exact: true };
  const sample = solve(k, { maxNodes: SAMPLE_NODES, maxResults: SAMPLE_SIZE, rng: makeRng(deriveSeed(s.seed, obs.time * 31 + obs.log.length)) });
  return { skies: sample.skies, exact: false };
}

/** Il Pianeta X e i suoi vicini, se tutti i sistemi possibili concordano. */
export function certainLocation(b: Belief): Guess | null {
  if (!b.exact || b.skies.length === 0) return null;
  const first = b.skies[0]!;
  const n = first.length;
  const x = first.indexOf("planetX") + 1;
  const [l, r] = neighbors(x, n);
  const same = b.skies.every((sky) => sky.indexOf("planetX") + 1 === x && sky[l - 1] === first[l - 1] && sky[r - 1] === first[r - 1]);
  return same ? { sector: x, left: first[l - 1] as Seen, right: first[r - 1] as Seen } : null;
}

/** Il miglior tentativo: il settore più probabile per il Pianeta X con i vicini più probabili (per l'ipotesi finale). */
export function bestGuess(b: Belief): Guess | null {
  if (b.skies.length === 0) return null;
  const n = b.skies[0]!.length;
  const counts = new Map<string, { guess: Guess; count: number }>();
  for (const sky of b.skies) {
    const x = sky.indexOf("planetX") + 1;
    const [l, r] = neighbors(x, n);
    const key = `${x}|${sky[l - 1]}|${sky[r - 1]}`;
    const entry = counts.get(key) ?? { guess: { sector: x, left: sky[l - 1] as Seen, right: sky[r - 1] as Seen }, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.guess.sector - b.guess.sector)[0]!.guess;
}

/** I corpi celesti su cui tutti i sistemi possibili concordano, settore per settore (solo se l'elenco è completo). */
export function certainBodies(b: Belief): Map<number, Token> {
  const out = new Map<number, Token>();
  if (!b.exact || b.skies.length === 0) return out;
  const first = b.skies[0]!;
  first.forEach((kind, i) => {
    if ((TOKEN_KINDS as string[]).includes(kind) && b.skies.every((sky) => sky[i] === kind)) out.set(i + 1, kind as Token);
  });
  return out;
}

function entropy(counts: Map<string, number>, total: number): number {
  let h = 0;
  for (const c of counts.values()) h -= (c / total) * Math.log2(c / total);
  return h;
}

/** Quanta informazione dà ogni azione ammessa, divisa per il suo costo. */
function candidates(s: PianetaState, obs: Observatory, skies: ObjectKind[][]): { action: Action; score: number }[] {
  const n = SECTORS[s.mode];
  const earthSector = sectorOfTime(obs.time, n);
  const visible = visibleSectors(earthSector, n);
  const used = skies.length > SCORING_CAP ? skies.filter((_, i) => i % Math.ceil(skies.length / SCORING_CAP) === 0) : skies;
  const out: { action: Action; score: number }[] = [];
  const consider = (action: Action, outcomes: (sky: ObjectKind[]) => string) => {
    if (actionError(action, obs, s.mode)) return;
    const counts = new Map<string, number>();
    for (const sky of used) {
      const key = outcomes(sky);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    out.push({ action, score: entropy(counts, used.length) / actionCost(action, s.mode) });
  };
  for (const object of ["asteroid", "comet", "dwarf", "gas", "empty"] as Seen[]) {
    for (const from of visible) {
      for (let len = 1; len <= visible.length; len++) {
        const to = ((from - 1 + len - 1) % n) + 1;
        const arc = arcSectors(from, to, n);
        consider({ type: "survey", object, from, to }, (sky) => String(arc.filter((x) => seenOf(sky[x - 1]!) === object).length));
      }
    }
  }
  if (obs.targetsLeft > 0) for (const sector of visible) consider({ type: "target", sector }, (sky) => seenOf(sky[sector - 1]!));
  // Una ricerca letta dà in media circa un bit e costa un solo giorno.
  if (!obs.lastWasResearch) {
    const unread = TOPIC_IDS.filter((t) => !obs.log.some((l) => l.result.type === "research" && l.result.topic === t));
    if (unread.length > 0) out.push({ action: { type: "research", topic: unread[0]! }, score: 1.4 });
  }
  return out;
}

/** L'azione del turno. */
export function botTurn(s: PianetaState, obs: Observatory): Action {
  const belief = beliefOf(s, obs);
  const sure = certainLocation(belief);
  if (sure) return { type: "locate", ...sure };
  const options = candidates(s, obs, belief.skies).sort((a, b) => b.score - a.score);
  // Vicolo cieco (succede in rari schemi dell'app ufficiale, dove le regole lasciano più settori per il Pianeta X): nessuna azione
  // porta più informazione. Si passa; dopo un giro intero di passi (il cielo visibile ha mostrato ogni finestra) e a conferenze
  // tutte tenute, l'unica via è tentare il candidato più probabile.
  if (options.length === 0 || options[0]!.score < 1e-9) {
    let passes = 0;
    for (let i = obs.log.length - 1; i >= 0 && obs.log[i]!.action.type === "pass"; i--) passes++;
    const guess = belief.exact && s.conferences.every((c) => c.held) && passes >= SECTORS[s.mode] ? bestGuess(belief) : null;
    return guess ? { type: "locate", ...guess } : { type: "pass" };
  }
  if (s.cfg.botLevel === "easy") {
    // Il robot facile sceglie a caso tra le prime quattro.
    const rng = makeRng(deriveSeed(s.seed, 5000 + obs.time * 7 + obs.log.length));
    return options[Math.floor(rng() * Math.min(4, options.length))]!.action;
  }
  return options[0]!.action;
}

/** Teorie da inviare: solo su settori certi, nei limiti dei gettoni e del numero per fase. */
export function botTheories(s: PianetaState, obs: Observatory, max = THEORIES_PER_PHASE[s.mode]): { sector: number; object: Token }[] {
  const belief = beliefOf(s, obs);
  const sure = certainBodies(belief);
  const left = { ...obs.tokens };
  const options: { sector: number; object: Token; busy: number; points: number }[] = [];
  for (const [sector, object] of sure) {
    if (s.confirmed[sector] !== undefined) continue;
    if (s.theories.some((t) => t.sector === sector && t.ownerId === obs.id)) continue;
    const busy = s.theories.filter((t) => t.sector === sector && !t.faceUp).length;
    options.push({ sector, object, busy, points: THEORY_POINTS[s.mode][object] });
  }
  options.sort((a, b) => a.busy - b.busy || b.points - a.points || a.sector - b.sector);
  const out: { sector: number; object: Token }[] = [];
  for (const o of options) {
    if (out.length >= max) break;
    if (left[o.object] <= 0) continue;
    left[o.object]--;
    out.push({ sector: o.sector, object: o.object });
  }
  return out;
}

/** Ultima opportunità: localizza se è certo e conviene, altrimenti teorie certe. */
export function botLastCall(s: PianetaState, obs: Observatory, lag: number): { guess: Guess | null; theories: { sector: number; object: Token }[] } {
  const belief = beliefOf(s, obs);
  const theories = botTheories(s, obs, lastCallTheories(lag));
  const sure = certainLocation(belief);
  const worth = theories.reduce((sum, t) => sum + THEORY_POINTS[s.mode][t.object], 0);
  if (sure && 2 * lag >= worth) return { guess: sure, theories: [] };
  return { guess: null, theories };
}

/** Ipotesi finale: il tentativo migliore (anche non certo). */
export function botFinalGuess(s: PianetaState, obs: Observatory): Guess | null {
  const belief = beliefOf(s, obs);
  return certainLocation(belief) ?? bestGuess(belief);
}
