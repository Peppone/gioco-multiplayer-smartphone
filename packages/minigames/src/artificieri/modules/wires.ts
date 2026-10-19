import { randInt } from "../../knight-duel/rng.js";
import { type EdgeCond, type Edgework, describeEdgeCond, edgeCondKeys, evalEdgeCond, genEdgeCond } from "../edgework.js";
import type { Difficulty, JudgeInput, ManualSection, ModuleDef, ModuleAction, Solution, Verdict } from "./types.js";

/**
 * Fili: 3–6 fili colorati. Il manuale ha, per ogni numero di fili, un elenco di regole in ordine: vale la prima
 * le cui condizioni sono tutte vere (l'ultima non ha condizioni) e dice quale filo tagliare.
 */

export const WIRE_COLORS = ["red", "blue", "yellow", "black", "white"] as const;
export type WireColor = (typeof WIRE_COLORS)[number];
export const WIRE_COLOR_NAME: Record<WireColor, { sing: string; plur: string }> = {
  red: { sing: "rosso", plur: "rossi" },
  blue: { sing: "blu", plur: "blu" },
  yellow: { sing: "giallo", plur: "gialli" },
  black: { sing: "nero", plur: "neri" },
  white: { sing: "bianco", plur: "bianchi" },
};
const ORDINAL = ["primo", "secondo", "terzo", "quarto", "quinto", "sesto"];

export type WireCond =
  | EdgeCond
  | { type: "no"; color: WireColor }
  | { type: "count"; color: WireColor; op: "eq" | "gte"; n: number }
  | { type: "last"; color: WireColor };

/** `which`: «primo» e «ultimo» (dall'alto) oppure la posizione (1 = primo), con `color` solo tra i fili di quel colore. */
export interface WireTarget {
  color: WireColor | null;
  which: "first" | "last" | number;
}

export interface WireRule {
  when: WireCond[];
  cut: WireTarget;
}

export interface WireRules {
  /** Indice = numero di fili − 3. L'ultima regola di ogni elenco non ha condizioni. */
  byCount: WireRule[][];
}

export interface WiresData {
  wires: WireColor[];
}

export interface WiresProgress {
  /** Fili già tagliati (indici dall'alto). */
  cut: number[];
}

export const MAX_WIRES: Record<Difficulty, number> = { facile: 4, media: 5, difficile: 6 };
const RULES_PER_COUNT: Record<Difficulty, number> = { facile: 2, media: 3, difficile: 4 };

function evalWireCond(c: WireCond, wires: WireColor[], edge: Edgework): boolean {
  switch (c.type) {
    case "no":
      return !wires.includes(c.color);
    case "count": {
      const n = wires.filter((w) => w === c.color).length;
      return c.op === "eq" ? n === c.n : n >= c.n;
    }
    case "last":
      return wires.at(-1) === c.color;
    default:
      return evalEdgeCond(c, edge);
  }
}

function resolveTarget(t: WireTarget, wires: WireColor[]): number {
  if (typeof t.which === "number") return t.which - 1;
  const idx = wires.flatMap((w, i) => (t.color === null || w === t.color ? [i] : []));
  return t.which === "first" ? (idx[0] ?? -1) : (idx.at(-1) ?? -1);
}

/** La regola del manuale che vale per questi fili: la prima con tutte le condizioni vere. */
export function matchingWireRule(wires: WireColor[], rules: WireRules, edge: Edgework): WireRule {
  return rules.byCount[wires.length - 3]!.find((r) => r.when.every((c) => evalWireCond(c, wires, edge)))!;
}

/** Indice (dall'alto) dell'unico filo giusto. */
export function wireSolution(wires: WireColor[], rules: WireRules, edge: Edgework): number {
  return resolveTarget(matchingWireRule(wires, rules, edge).cut, wires);
}

// ---- Generazione ----

const pick = <T>(rng: () => number, list: readonly T[]): T => list[randInt(rng, list.length)]!;

function condKeys(c: WireCond): string[] {
  switch (c.type) {
    case "no":
    case "count":
      return [`color:${c.color}`];
    case "last":
      return ["last", `color:${c.color}`];
    default:
      return edgeCondKeys(c);
  }
}

function genCond(rng: () => number, difficulty: Difficulty): WireCond {
  const kinds = difficulty === "facile" ? ["no", "no", "count", "count", "last"] : ["no", "count", "last", "edge", "edge"];
  const color = pick(rng, WIRE_COLORS);
  switch (pick(rng, kinds)) {
    case "no":
      return { type: "no", color };
    case "count": {
      const op = rng() < 0.5 ? "eq" : "gte";
      return { type: "count", color, op, n: op === "eq" ? 1 + randInt(rng, 2) : 2 + randInt(rng, 2) };
    }
    case "last":
      return { type: "last", color };
    default:
      return genEdgeCond(rng);
  }
}

/** Colori che una regola con queste condizioni garantisce di trovare tra i fili. */
function guaranteedColors(conds: WireCond[]): WireColor[] {
  return conds.flatMap((c) => (c.type === "last" || (c.type === "count" && c.n >= 1) ? [c.color] : []));
}

function genRule(rng: () => number, difficulty: Difficulty, count: number): WireRule {
  const wanted = difficulty === "facile" ? 1 : difficulty === "media" ? 1 + (rng() < 0.35 ? 1 : 0) : 1 + randInt(rng, 2);
  const when: WireCond[] = [];
  const taken = new Set<string>();
  for (let attempt = 0; attempt < 30 && when.length < wanted; attempt++) {
    const c = genCond(rng, difficulty);
    const keys = condKeys(c);
    if (keys.some((k) => taken.has(k))) continue;
    keys.forEach((k) => taken.add(k));
    when.push(c);
  }
  const guaranteed = guaranteedColors(when);
  if (guaranteed.length > 0 && rng() < 0.5) return { when, cut: { color: pick(rng, guaranteed), which: rng() < 0.5 ? "first" : "last" } };
  return { when, cut: genPositionalTarget(rng, count) };
}

function genPositionalTarget(rng: () => number, count: number): WireTarget {
  const r = randInt(rng, count);
  return { color: null, which: r === 0 ? "first" : r === count - 1 ? "last" : r + 1 };
}

function genRules(rng: () => number, difficulty: Difficulty): WireRules {
  const byCount: WireRule[][] = [];
  for (let count = 3; count <= MAX_WIRES[difficulty]; count++) {
    const list = Array.from({ length: RULES_PER_COUNT[difficulty] }, () => genRule(rng, difficulty, count));
    list.push({ when: [], cut: genPositionalTarget(rng, count) });
    byCount.push(list);
  }
  return { byCount };
}

function genData(rng: () => number, _rules: WireRules, _edge: Edgework, difficulty: Difficulty): WiresData {
  const count = 3 + randInt(rng, MAX_WIRES[difficulty] - 2);
  return { wires: Array.from({ length: count }, () => pick(rng, WIRE_COLORS)) };
}

// ---- Testo del manuale ----

export function describeWireCond(c: WireCond): string {
  switch (c.type) {
    case "no":
      return `non ci sono fili ${WIRE_COLOR_NAME[c.color].plur}`;
    case "count": {
      const name = WIRE_COLOR_NAME[c.color];
      const how = c.op === "eq" ? "esattamente" : "almeno";
      return c.n === 1 ? `c'è ${how} un filo ${name.sing}` : `ci sono ${how} ${c.n} fili ${name.plur}`;
    }
    case "last":
      return `l'ultimo filo è ${WIRE_COLOR_NAME[c.color].sing}`;
    default:
      return describeEdgeCond(c);
  }
}

export function describeWireTarget(t: WireTarget): string {
  const which = t.which === "first" ? "il primo" : t.which === "last" ? "l'ultimo" : `il ${ORDINAL[t.which - 1]}`;
  return t.color ? `${which} filo ${WIRE_COLOR_NAME[t.color].sing}` : `${which} filo`;
}

export function describeWireRule(rule: WireRule): string {
  const cut = `taglia ${describeWireTarget(rule.cut)}`;
  return rule.when.length === 0 ? `Altrimenti: ${cut}.` : `Se ${rule.when.map(describeWireCond).join(" e ")}: ${cut}.`;
}

function manual(rules: WireRules): ManualSection[] {
  const intro = "I fili si contano dall'alto verso il basso. Si legge l'elenco in ordine e si segue la prima regola vera.";
  const groups: number[][] = [];
  for (let count = 3; count < 3 + rules.byCount.length; count += 2) groups.push([count, count + 1].filter((n) => n < 3 + rules.byCount.length));
  return groups.map((counts, i) => ({
    title: counts.length > 1 ? `Fili (${counts[0]} e ${counts[1]} fili)` : `Fili (${counts[0]} fili)`,
    blocks: [
      ...(i === 0 ? [{ type: "p" as const, text: intro }] : []),
      ...counts.flatMap((n) => [
        { type: "h" as const, text: `Con ${n} fili` },
        { type: "list" as const, ordered: false, items: rules.byCount[n - 3]!.map(describeWireRule) },
      ]),
    ],
  }));
}

const COLOR_IT: Record<WireColor, string> = { red: "rosso", blue: "blu", yellow: "giallo", black: "nero", white: "bianco" };

export const wiresModule: ModuleDef<WiresData, WireRules, WiresProgress> = {
  kind: "wires",
  genRules,
  genData,
  initProgress: () => ({ cut: [] }),
  judge({ data, rules, edge, progress }: JudgeInput<WiresData, WireRules, WiresProgress>, action: ModuleAction, _remainingMs: number): { verdict: Verdict; progress: WiresProgress } {
    if (action.type !== "cut" || action.wire < 0 || action.wire >= data.wires.length || progress.cut.includes(action.wire)) return { verdict: "ignored", progress };
    const next = { cut: [...progress.cut, action.wire] };
    return { verdict: action.wire === wireSolution(data.wires, rules, edge) ? "solved" : "strike", progress: next };
  },
  solution({ data, rules, edge }): Solution {
    const wire = wireSolution(data.wires, rules, edge);
    return { actions: [{ type: "cut", wire }], text: `Taglia il filo ${wire + 1} (${COLOR_IT[data.wires[wire]!]})` };
  },
  manual,
};
