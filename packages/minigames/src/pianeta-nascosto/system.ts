import { deriveSeed, makeRng } from "../knight-duel/rng.js";
import { type Clue, type ConferenceClue, type ResearchClue, clueHolds, clueLabel } from "./clues.js";
import { type Body, type Mode, type ObjectKind, type Seen, BODIES, COMET_SECTORS, SECTORS, generateSky, placementErrors, seenOf } from "./sky.js";

/**
 * Un sistema completo, generato dal seme (piano, §3.9–§3.10): il cielo, le sei ricerche A–F e le conferenze, con la
 * garanzia che il Pianeta X sia **deducibile** (un solo settore compatibile con tutte le regole) e che nessuna conferenza
 * da sola lo riveli. Funzioni pure.
 */

export const TOPIC_IDS = ["A", "B", "C", "D", "E", "F"] as const;
export type TopicId = (typeof TOPIC_IDS)[number];
export type ConferenceId = "X1" | "X2";

export interface System {
  sky: ObjectKind[];
  topics: { id: TopicId; clue: ResearchClue }[];
  conferences: { id: ConferenceId; clue: ConferenceClue }[];
}

/** I settori del cielo (come li vedono gli strumenti) che potrebbero nascondere il Pianeta X date queste regole. */
export function xCandidates(sky: ObjectKind[], clues: Clue[]): number[] {
  const out: number[] = [];
  sky.forEach((kind, i) => {
    if (seenOf(kind) !== "empty") return;
    const trial = sky.map((k, j) => (j === i ? "planetX" : k === "planetX" ? "empty" : k)) as ObjectKind[];
    if (placementErrors(trial).length === 0 && clues.every((c) => clueHolds(c, trial))) out.push(i + 1);
  });
  return out;
}

// ---- Campione di sistemi per misurare quanto una regola è informativa ----

const POOL_SIZE = 60;
const pools: Partial<Record<Mode, ObjectKind[][]>> = {};
function pool(mode: Mode): ObjectKind[][] {
  return (pools[mode] ??= Array.from({ length: POOL_SIZE }, (_, i) => generateSky(mode, makeRng(deriveSeed(0x70_6c_61_6e, i)))));
}

/** Una regola è informativa se non è implicata dalle sole regole di posizione (manca in almeno 3 sistemi su 60 del campione). */
function informative(clue: Clue, mode: Mode): boolean {
  let missing = 0;
  for (const sky of pool(mode)) if (!clueHolds(clue, sky) && ++missing >= 3) return true;
  return false;
}

// ---- Estrazione delle regole ----

const RESEARCH_KINDS: [ResearchClue["kind"], number][] = [
  ["someAdjacent", 10],
  ["allWithin", 8],
  ["band", 7],
  ["someOpposite", 6],
  ["noneOpposite", 5],
  ["noneAdjacent", 4],
  ["noneWithin", 4],
  ["allAdjacent", 1],
  ["allConsecutive", 1],
  ["allOpposite", 1],
  ["someConsecutive", 1],
];
const CONFERENCE_KINDS: [ConferenceClue["kind"], number][] = [
  ["xWithin", 5],
  ["xNotWithin", 3],
  ["xNotAdjacent", 3],
  ["xNotOpposite", 4],
];

function weighted<T>(items: [T, number][], rng: () => number): T {
  let r = rng() * items.reduce((s, [, w]) => s + w, 0);
  for (const [item, w] of items) if ((r -= w) < 0) return item;
  return items[0]![0];
}
const pick = <T>(list: T[], rng: () => number): T => list[Math.floor(rng() * list.length)]!;
const between = (lo: number, hi: number, rng: () => number) => lo + Math.floor(rng() * (hi - lo + 1));

/** Una regola casuale (non ancora controllata). Gli intervalli di N sono quelli dell'app ufficiale (piano, §3.9). */
function drawResearch(mode: Mode, rng: () => number): ResearchClue | null {
  const kind = weighted(RESEARCH_KINDS, rng);
  const expert = mode === "expert";
  const a = pick(BODIES, rng);
  const b: Seen = pick<Seen>([...BODIES, "empty"], rng);
  switch (kind) {
    case "someAdjacent":
    case "noneAdjacent":
    case "allAdjacent":
    case "someOpposite":
    case "noneOpposite":
    case "allOpposite":
      return { kind, a, b };
    case "allWithin":
      return { kind, a, b, n: between(2, 4, rng) };
    case "noneWithin":
      return { kind, a, b, n: between(2, expert ? 6 : 4, rng) };
    case "band":
      return { kind, a, n: between(2, expert ? 8 : 6, rng) };
    case "allConsecutive":
      return { kind, a };
    case "someConsecutive":
      return expert ? { kind, a, n: 3 } : null;
  }
}

function drawConference(rng: () => number): ConferenceClue {
  const kind = weighted(CONFERENCE_KINDS, rng);
  const b = pick<Seen>(BODIES, rng);
  if (kind === "xWithin") return { kind, b, n: between(2, 5, rng) };
  if (kind === "xNotWithin") return { kind, b, n: between(2, 3, rng) };
  return { kind, b };
}

const labelKey = (clue: Clue) => [...clueLabel(clue)].sort().join("+");

/**
 * Un solo tentativo di sistema: null se non è venuto deducibile. Con `strict` le ricerche da sole non devono bastare a trovare
 * il Pianeta X (serve una conferenza); senza, basta che il sistema sia deducibile.
 */
function attempt(mode: Mode, rng: () => number, strict: boolean): System | null {
  const sky = generateSky(mode, rng);
  const topics: System["topics"] = [];
  const labels = new Set<string>();
  for (const id of TOPIC_IDS) {
    let found: ResearchClue | null = null;
    for (let i = 0; i < 400 && !found; i++) {
      const clue = drawResearch(mode, rng);
      if (clue && !labels.has(labelKey(clue)) && clueHolds(clue, sky) && informative(clue, mode)) found = clue;
    }
    if (!found) return null;
    labels.add(labelKey(found));
    topics.push({ id, clue: found });
  }
  const research = topics.map((t) => t.clue);
  // Le ricerche da sole non devono bastare: serve almeno una conferenza.
  if (strict && xCandidates(sky, research).length < 2) return null;

  const conferences: System["conferences"] = [];
  let candidates = xCandidates(sky, research);
  for (const id of mode === "expert" ? (["X1", "X2"] as const) : (["X1"] as const)) {
    let best: { clue: ConferenceClue; left: number } | null = null;
    for (let i = 0; i < 80; i++) {
      const clue = drawConference(rng);
      if (conferences.some((c) => "b" in c.clue && c.clue.b === clue.b)) continue;
      if (!clueHolds(clue, sky) || !informative(clue, mode)) continue;
      // Una conferenza che da sola rivela il Pianeta X non va bene: si sceglie tra le altre.
      if (xCandidates(sky, [clue]).length === 1) continue;
      const left = xCandidates(sky, [...research, ...conferences.map((c) => c.clue), clue]).length;
      if (!best || left < best.left) best = { clue, left };
      if (left === 1 && (id === "X2" || mode === "standard")) break;
    }
    if (!best) return null;
    conferences.push({ id, clue: best.clue });
    candidates = xCandidates(sky, [...research, ...conferences.map((c) => c.clue)]);
  }
  if (candidates.length !== 1) return null;
  // Nessuna conferenza, da sola, rivela il Pianeta X.
  if (conferences.some((c) => xCandidates(sky, [c.clue]).length === 1)) return null;
  return { sky, topics, conferences };
}

/** Il sistema del seme: stesso seme, stesso sistema. */
export function generateSystem(mode: Mode, seed: number): System {
  for (let k = 0; k < 7000; k++) {
    // I primi 2000 tentativi chiedono che servano anche le conferenze; poi basta che il Pianeta X sia deducibile.
    const system = attempt(mode, makeRng(deriveSeed(seed, k)), k < 2000);
    if (system) return system;
  }
  throw new Error(`nessun sistema deducibile trovato (${mode}, seme ${seed})`);
}

// ---- Informazioni iniziali ----

export type Difficulty = "youth" | "beginner" | "experienced" | "genius";
export const DIFFICULTIES: Difficulty[] = ["youth", "beginner", "experienced", "genius"];
export const FACT_BLOCKS = 3;
export const FACTS_PER_BLOCK = 4;
/** Quanti blocchi da 4 fatti riceve un livello: 12, 8, 4 o 0 fatti. */
export const BLOCKS_BY_LEVEL: Record<Difficulty, number> = { youth: 3, beginner: 2, experienced: 1, genius: 0 };

export interface Fact {
  sector: number;
  /** Il corpo celeste che quel settore non contiene. */
  absent: Body;
}

/**
 * Per ogni osservatorio `slots` serie di 3 blocchi da 4 fatti veri e non banali («il settore non contiene…»): un livello più
 * facile contiene sempre i fatti di quello più difficile, e osservatori diversi ricevono fatti diversi.
 */
export function generateFacts(sky: ObjectKind[], mode: Mode, seed: number, slots: number): Fact[][][] {
  const n = SECTORS[mode];
  const rng = makeRng(deriveSeed(seed, 0xfac7));
  const all: Fact[] = [];
  for (let s = 1; s <= n; s++) {
    for (const body of BODIES) {
      if (sky[s - 1] === body) continue;
      if (body === "comet" && !COMET_SECTORS[mode].includes(s)) continue; // banale: non è un settore da cometa
      all.push({ sector: s, absent: body });
    }
  }
  const used = new Set<string>();
  const key = (f: Fact) => `${f.sector}:${f.absent}`;
  const out: Fact[][][] = [];
  for (let slot = 0; slot < slots; slot++) {
    const series: Fact[][] = [];
    const own = new Set<string>();
    for (let b = 0; b < FACT_BLOCKS; b++) {
      const block: Fact[] = [];
      while (block.length < FACTS_PER_BLOCK) {
        const fresh = all.filter((f) => !used.has(key(f)) && !own.has(key(f)));
        const source = fresh.length > 0 ? fresh : all.filter((f) => !own.has(key(f)));
        const f = pick(source, rng);
        own.add(key(f));
        used.add(key(f));
        block.push(f);
      }
      series.push(block);
    }
    out.push(series);
  }
  return out;
}

/** I fatti di una serie per un livello. */
export const factsFor = (series: Fact[][], level: Difficulty): Fact[] => series.slice(0, BLOCKS_BY_LEVEL[level]).flat();
