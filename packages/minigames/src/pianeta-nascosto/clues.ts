import { type Body, type ObjectKind, type Seen, bandWidth, distance, longestRun, neighbors, opposite, sectorsOf } from "./sky.js";

/**
 * Regole delle ricerche e delle conferenze come dati strutturati (piano, §3.9): da qui derivano il controllo,
 * l'etichetta e (più avanti) il testo italiano. Funzioni pure.
 *
 * `a` è il soggetto (un corpo celeste), `b` il riferimento: un corpo celeste o un settore vuoto, anche dello stesso
 * tipo di `a` («… entro 2 settori da un'altra cometa»). «Entro N settori» vuol dire a distanza da 1 a N.
 */
export type ResearchClue =
  | { kind: "someAdjacent" | "noneAdjacent" | "allAdjacent"; a: Body; b: Seen }
  | { kind: "allWithin" | "noneWithin"; a: Body; b: Seen; n: number }
  | { kind: "someOpposite" | "noneOpposite" | "allOpposite"; a: Body; b: Seen }
  /** Tutti gli `a` stanno in una fascia di `n` settori o meno. */
  | { kind: "band"; a: Body; n: number }
  /** Tutti gli `a` sono in settori consecutivi. */
  | { kind: "allConsecutive"; a: Body }
  /** Ci sono `n` oggetti `a` in settori consecutivi (la serie più lunga è di `n`). */
  | { kind: "someConsecutive"; a: Body; n: number };

export type ConferenceClue =
  | { kind: "xWithin" | "xNotWithin"; b: Seen; n: number }
  | { kind: "xNotAdjacent" | "xNotOpposite"; b: Seen };

export type Clue = ResearchClue | ConferenceClue;

/** I settori diversi da `s` entro distanza `n` che contengono `b`. */
function near(sky: ObjectKind[], s: number, b: Seen, n: number): boolean {
  return sectorsOf(sky, b).some((t) => t !== s && distance(s, t, sky.length) <= n);
}

/** Vero se la regola vale nel sistema `sky`. */
export function clueHolds(clue: Clue, sky: ObjectKind[]): boolean {
  const size = sky.length;
  const isB = (s: number, b: Seen) => sky[s - 1] === b;
  switch (clue.kind) {
    case "someAdjacent":
      return sectorsOf(sky, clue.a).some((s) => neighbors(s, size).some((t) => isB(t, clue.b)));
    case "noneAdjacent":
      return sectorsOf(sky, clue.a).every((s) => !neighbors(s, size).some((t) => isB(t, clue.b)));
    case "allAdjacent":
      return sectorsOf(sky, clue.a).every((s) => neighbors(s, size).some((t) => isB(t, clue.b)));
    case "allWithin":
      return sectorsOf(sky, clue.a).every((s) => near(sky, s, clue.b, clue.n));
    case "noneWithin":
      return sectorsOf(sky, clue.a).every((s) => !near(sky, s, clue.b, clue.n));
    case "someOpposite":
      return sectorsOf(sky, clue.a).some((s) => isB(opposite(s, size), clue.b));
    case "noneOpposite":
      return sectorsOf(sky, clue.a).every((s) => !isB(opposite(s, size), clue.b));
    case "allOpposite":
      return sectorsOf(sky, clue.a).every((s) => isB(opposite(s, size), clue.b));
    case "band":
      return bandWidth(sectorsOf(sky, clue.a), size) <= clue.n;
    case "allConsecutive": {
      const at = sectorsOf(sky, clue.a);
      return bandWidth(at, size) === at.length;
    }
    case "someConsecutive":
      return longestRun(sky, clue.a) === clue.n;
    case "xWithin":
    case "xNotWithin":
    case "xNotAdjacent":
    case "xNotOpposite": {
      const x = sectorsOf(sky, "planetX")[0];
      if (x === undefined) return false;
      if (clue.kind === "xNotOpposite") return !isB(opposite(x, size), clue.b);
      const found = near(sky, x, clue.b, "n" in clue ? clue.n : 1);
      return clue.kind === "xWithin" ? found : !found;
    }
  }
}

/**
 * L'etichetta pubblica della regola: i tipi di oggetto che nomina, senza ripetizioni (un settore vuoto come
 * riferimento non compare). Le conferenze nominano sempre il Pianeta X.
 */
export function clueLabel(clue: Clue): ObjectKind[] {
  const out: ObjectKind[] = "a" in clue ? [clue.a] : ["planetX"];
  if ("b" in clue && clue.b !== "empty" && !out.includes(clue.b)) out.push(clue.b);
  return out;
}

export function isConferenceClue(clue: Clue): clue is ConferenceClue {
  return clue.kind.startsWith("x");
}

// ---- Testi ----

const NAMES: Record<ObjectKind, { one: string; many: string; f: boolean }> = {
  asteroid: { one: "asteroide", many: "asteroidi", f: false },
  comet: { one: "cometa", many: "comete", f: true },
  gas: { one: "nube di gas", many: "nubi di gas", f: true },
  dwarf: { one: "pianeta nano", many: "pianeti nani", f: false },
  empty: { one: "settore vuoto", many: "settori vuoti", f: false },
  planetX: { one: "Pianeta X", many: "Pianeti X", f: false },
};

export const objectName = (kind: ObjectKind): string => NAMES[kind].one;
export const objectNamePlural = (kind: ObjectKind): string => NAMES[kind].many;

const indef = (kind: ObjectKind) => `${NAMES[kind].f ? "una" : "un"} ${NAMES[kind].one}`;
/** «un altro asteroide» quando il riferimento è dello stesso tipo del soggetto. */
const other = (a: ObjectKind, b: ObjectKind) => (a === b ? `${NAMES[b].f ? "un'altra" : "un altro"} ${NAMES[b].one}` : indef(b));
const none = (a: ObjectKind) => (NAMES[a].f ? "Nessuna" : "Nessun");
const some = (a: ObjectKind) => (NAMES[a].f ? "Almeno una" : "Almeno un");

/** «Tutti gli asteroidi», «Tutti i pianeti nani», «Tutte le comete». */
const allOf = (a: ObjectKind) => (NAMES[a].f ? "Tutte le" : a === "asteroid" ? "Tutti gli" : "Tutti i");

/** Il testo italiano di una regola (la ricerca o la conferenza che si legge). */
export function clueText(clue: Clue): string {
  switch (clue.kind) {
    case "someAdjacent":
      return `${some(clue.a)} ${NAMES[clue.a].one} è adiacente a ${other(clue.a, clue.b)}`;
    case "noneAdjacent":
      return `${none(clue.a)} ${NAMES[clue.a].one} è adiacente a ${other(clue.a, clue.b)}`;
    case "allAdjacent":
      return `Ogni ${NAMES[clue.a].one} è adiacente a ${other(clue.a, clue.b)}`;
    case "allWithin":
      return `Ogni ${NAMES[clue.a].one} è entro ${clue.n} settori da ${other(clue.a, clue.b)}`;
    case "noneWithin":
      return `${none(clue.a)} ${NAMES[clue.a].one} è entro ${clue.n} settori da ${other(clue.a, clue.b)}`;
    case "someOpposite":
      return `${some(clue.a)} ${NAMES[clue.a].one} è direttamente ${NAMES[clue.a].f ? "opposta" : "opposto"} a ${other(clue.a, clue.b)}`;
    case "noneOpposite":
      return `${none(clue.a)} ${NAMES[clue.a].one} è direttamente ${NAMES[clue.a].f ? "opposta" : "opposto"} a ${other(clue.a, clue.b)}`;
    case "allOpposite":
      return `Ogni ${NAMES[clue.a].one} è direttamente ${NAMES[clue.a].f ? "opposta" : "opposto"} a ${other(clue.a, clue.b)}`;
    case "band":
      return `${allOf(clue.a)} ${NAMES[clue.a].many}` + ` stanno in una fascia di ${clue.n} settori o meno`;
    case "allConsecutive":
      return `${allOf(clue.a)} ${NAMES[clue.a].many} sono in settori consecutivi`;
    case "someConsecutive":
      return `La serie più lunga di ${NAMES[clue.a].many} in settori consecutivi è di ${clue.n}`;
    case "xWithin":
      return `Il Pianeta X è entro ${clue.n} settori da ${indef(clue.b)}`;
    case "xNotWithin":
      return `Il Pianeta X non è entro ${clue.n} settori da ${indef(clue.b)}`;
    case "xNotAdjacent":
      return `Il Pianeta X non è adiacente a ${indef(clue.b)}`;
    case "xNotOpposite":
      return `Il Pianeta X non è direttamente opposto a ${indef(clue.b)}`;
  }
}
