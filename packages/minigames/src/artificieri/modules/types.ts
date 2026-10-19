import type { Edgework } from "../edgework.js";

export type Difficulty = "facile" | "media" | "difficile";
export const DIFFICULTIES: Difficulty[] = ["facile", "media", "difficile"];

/** Tipi di modulo implementati (in ordine stabile: da qui si ricava il seme delle regole di ciascuno). */
export const MODULE_KINDS = ["wires", "button", "symbols", "colors", "maze", "word"] as const;
export type ModuleKind = (typeof MODULE_KINDS)[number];

/** Azione dell'artificiere su un modulo (il plugin la completa con l'indice del modulo). */
export type ModuleAction =
  | { type: "cut"; wire: number }
  | { type: "tap" }
  | { type: "hold" }
  | { type: "release" }
  | { type: "press"; key: number }
  | { type: "move"; dir: "up" | "down" | "left" | "right" }
  | { type: "spin"; wheel: number; delta: 1 | -1 }
  | { type: "submit" };

/** `solved`: modulo disinnescato · `strike`: errore · `ok`: passo giusto, il modulo non è ancora finito · `ignored`: non conta nulla. */
export type Verdict = "solved" | "strike" | "ok" | "ignored";

/** Istanza di un modulo sulla bomba. `data` è pubblica (TV), `progress` è lo stato interno. */
export interface ModuleInstance {
  id: number;
  kind: ModuleKind;
  data: unknown;
  progress: unknown;
  solved: boolean;
}

export interface JudgeInput<D, R, P> {
  data: D;
  rules: R;
  edge: Edgework;
  progress: P;
  /** Errori già fatti sulla bomba (alcune regole del manuale cambiano con gli errori, come nel modulo Colori). */
  strikes: number;
}

/** Contenuti della libreria che servono a qualche tipo di modulo (oggi: le parole del modulo «Parola»). */
export interface GenContent {
  words?: string[];
}

/** Come si risolve un modulo: serve alla regia (che aiuta) e ai bot dei test. */
export interface Solution {
  actions: ModuleAction[];
  /** Solo per il pulsante: cifra delle unità dei secondi su cui rilasciare. */
  releaseDigit?: number;
  text: string;
}

/** Blocchi di una pagina del manuale: testo semplice, mai HTML. */
export type ManualBlock =
  | { type: "h"; text: string }
  | { type: "p"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] }
  /** Colonne di simboli (id), disegnati dal client. */
  | { type: "symbols"; columns: string[][] }
  /** Labirinti del manuale: `cells` come in `maze.ts`, con i due segni che li distinguono. */
  | { type: "mazes"; size: number; mazes: { cells: number[]; marks: [number, number] }[] }
  /** Elenco di parole (si cerca quella che si può comporre con le rotelle). */
  | { type: "words"; words: string[] };

export interface ManualSection {
  title: string;
  blocks: ManualBlock[];
}

/**
 * Un tipo di modulo: generatore (dal seme) e giudice. Le regole sono dati strutturati, e il testo del manuale
 * (`manual`) viene dalla stessa struttura, quindi giudice e manuale non possono contraddirsi.
 */
export interface ModuleDef<D, R, P> {
  kind: ModuleKind;
  /** Regole del manuale di questo tipo per una bomba: valgono per tutti i moduli di quel tipo. */
  genRules(rng: () => number, difficulty: Difficulty, content: GenContent): R;
  /** Istanza del modulo, con una sola soluzione secondo `rules`. */
  genData(rng: () => number, rules: R, edge: Edgework, difficulty: Difficulty): D;
  initProgress(data: D): P;
  /** `remainingMs`: tempo rimasto sul timer della bomba all'ora equa dell'azione. */
  judge(input: JudgeInput<D, R, P>, action: ModuleAction, remainingMs: number): { verdict: Verdict; progress: P };
  solution(input: JudgeInput<D, R, P>): Solution;
  manual(rules: R): ManualSection[];
}
