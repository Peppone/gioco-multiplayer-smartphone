import { randInt, shuffle } from "../../knight-duel/rng.js";
import type { Edgework } from "../edgework.js";
import type { Difficulty, JudgeInput, ManualSection, ModuleAction, ModuleDef, Solution, Verdict } from "./types.js";

/**
 * Simboli: sulla TV ci sono 3–4 simboli strani, sul telefono dell'artificiere gli stessi simboli come tasti.
 * Nel manuale ci sono 6 colonne di 7 simboli: i simboli della bomba stanno tutti in una sola colonna e vanno
 * premuti nell'ordine in cui compaiono in quella colonna, dall'alto in basso.
 * Il disegno di ogni simbolo sta nel client, con lo stesso id.
 */

export const SYMBOL_IDS = [
  "spirale", "croce", "stella", "luna", "sole", "fulmine", "goccia", "cuore", "occhio", "chiave",
  "freccia", "onda", "triangolo", "quadrato", "cerchio", "esagono", "rombo", "zigzag", "tridente", "ancora",
  "corona", "fiamma", "foglia", "mano", "scudo", "spada", "campana", "tazza", "nodo", "clessidra",
] as const;

export const SYMBOL_COLUMNS = 6;
export const SYMBOLS_PER_COLUMN = 7;
/** Simboli da cui si pescano le colonne: con meno simboli le colonne si somigliano di più. */
const POOL_SIZE: Record<Difficulty, number> = { facile: 30, media: 30, difficile: 22 };
const SHOWN: Record<Difficulty, number> = { facile: 3, media: 4, difficile: 4 };

export interface SymbolRules {
  /** Colonne del manuale, ciascuna in ordine dall'alto in basso. */
  columns: string[][];
}

export interface SymbolsData {
  /** In ordine di comparsa sulla TV e sul telefono (diverso da quello di pressione). */
  symbols: string[];
}

export interface SymbolsProgress {
  /** Indici (in `data.symbols`) già premuti, in ordine. */
  pressed: number[];
}

/** Indici di `data.symbols` nell'ordine in cui vanno premuti. */
export function symbolOrder(data: SymbolsData, rules: SymbolRules): number[] {
  const column = rules.columns.find((col) => data.symbols.every((s) => col.includes(s)))!;
  return column.filter((s) => data.symbols.includes(s)).map((s) => data.symbols.indexOf(s));
}

function genRules(rng: () => number, difficulty: Difficulty): SymbolRules {
  const pool = shuffle(SYMBOL_IDS, rng).slice(0, POOL_SIZE[difficulty]);
  return { columns: Array.from({ length: SYMBOL_COLUMNS }, () => shuffle(pool, rng).slice(0, SYMBOLS_PER_COLUMN)) };
}

function genData(rng: () => number, rules: SymbolRules, _edge: Edgework, difficulty: Difficulty): SymbolsData {
  const k = SHOWN[difficulty];
  for (let attempt = 0; attempt < 500; attempt++) {
    const column = rules.columns[randInt(rng, SYMBOL_COLUMNS)]!;
    const chosen = shuffle([...column.keys()], rng)
      .slice(0, k)
      .sort((a, b) => a - b)
      .map((i) => column[i]!);
    // una sola colonna le contiene tutte, altrimenti la soluzione sarebbe ambigua
    if (rules.columns.filter((col) => chosen.every((s) => col.includes(s))).length !== 1) continue;
    let shown = shuffle(chosen, rng);
    for (let i = 0; i < 10 && shown.every((s, j) => s === chosen[j]); i++) shown = shuffle(chosen, rng);
    return { symbols: shown };
  }
  throw new Error("Simboli: nessuna combinazione con una sola colonna");
}

function manual(rules: SymbolRules): ManualSection[] {
  return [
    {
      title: "Simboli",
      blocks: [
        { type: "p", text: "I simboli del modulo stanno tutti in una sola di queste colonne. Vanno premuti nell'ordine in cui compaiono nella colonna, dall'alto in basso." },
        { type: "symbols", columns: rules.columns },
      ],
    },
  ];
}

export const symbolsModule: ModuleDef<SymbolsData, SymbolRules, SymbolsProgress> = {
  kind: "symbols",
  genRules,
  genData,
  initProgress: () => ({ pressed: [] }),
  judge({ data, rules, progress }: JudgeInput<SymbolsData, SymbolRules, SymbolsProgress>, action: ModuleAction, _remainingMs: number): { verdict: Verdict; progress: SymbolsProgress } {
    if (action.type !== "press" || action.key < 0 || action.key >= data.symbols.length || progress.pressed.includes(action.key)) return { verdict: "ignored", progress };
    if (action.key !== symbolOrder(data, rules)[progress.pressed.length]) return { verdict: "strike", progress };
    const pressed = [...progress.pressed, action.key];
    return { verdict: pressed.length === data.symbols.length ? "solved" : "ok", progress: { pressed } };
  },
  solution({ data, rules, progress }): Solution {
    // solo i simboli ancora da premere: quelli già premuti non contano più
    const order = symbolOrder(data, rules).slice(progress.pressed.length);
    return { actions: order.map((key) => ({ type: "press" as const, key })), text: `Premi i simboli in quest'ordine: ${order.map((i) => data.symbols[i]).join(", ")}` };
  },
  manual,
};
