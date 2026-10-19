import { randInt, shuffle } from "../../knight-duel/rng.js";
import { type Edgework, evalEdgeCond } from "../edgework.js";
import type { Difficulty, JudgeInput, ManualSection, ModuleAction, ModuleDef, Solution, Verdict } from "./types.js";

/**
 * Colori: quattro luci che lampeggiano in una sequenza che si allunga a ogni passo (come un gioco di memoria).
 * L'artificiere deve premere, sul telefono, il colore che il manuale associa a ogni lampo: la tabella cambia con gli
 * errori fatti (0, 1, 2 o più) e con la presenza di una vocale nel numero di serie.
 */

export const LAMPS = ["red", "blue", "green", "yellow"] as const;
export type Lamp = (typeof LAMPS)[number];
export const LAMP_NAME: Record<Lamp, string> = { red: "rosso", blue: "blu", green: "verde", yellow: "giallo" };

const LENGTH: Record<Difficulty, number> = { facile: 3, media: 4, difficile: 5 };
/** Tabelle diverse per 0, 1 e 2 o più errori. */
export const STRIKE_TABLES = 3;

export interface ColorsRules {
  /** `map[vocale ? 0 : 1][errori (al massimo 2)][colore visto]` = colore da premere (indici di `LAMPS`). */
  map: number[][][];
}

export interface ColorsData {
  /** Sequenza completa (indici di `LAMPS`); al passo `stage` la TV ne mostra i primi `stage + 1` lampi. */
  sequence: number[];
}

export interface ColorsProgress {
  /** Passo in corso (0 = un solo lampo). */
  stage: number;
  /** Colori già premuti giusti in questo passo. */
  entered: number;
}

/** Il colore che il manuale chiede di premere vedendo `seen` (indice di `LAMPS`), con questi errori e questo bordo. */
export function colorToPress(rules: ColorsRules, edge: Edgework, strikes: number, seen: number): number {
  const vowel = evalEdgeCond({ type: "serial-vowel" }, edge);
  return rules.map[vowel ? 0 : 1]![Math.min(strikes, STRIKE_TABLES - 1)]![seen]!;
}

function genRules(rng: () => number): ColorsRules {
  const order = LAMPS.map((_, i) => i);
  return { map: [0, 1].map(() => Array.from({ length: STRIKE_TABLES }, () => shuffle(order, rng))) };
}

function genData(rng: () => number, _rules: ColorsRules, _edge: Edgework, difficulty: Difficulty): ColorsData {
  const sequence = Array.from({ length: LENGTH[difficulty] }, () => randInt(rng, LAMPS.length));
  // un solo colore ripetuto per tutta la sequenza sarebbe una noia: se capita se ne cambia uno
  if (sequence.every((s) => s === sequence[0])) sequence[sequence.length - 1] = (sequence[0]! + 1 + randInt(rng, LAMPS.length - 1)) % LAMPS.length;
  return { sequence };
}

function manual(rules: ColorsRules): ManualSection[] {
  const head = ["Errori", ...LAMPS.map((l) => `Vedi ${LAMP_NAME[l]}`)];
  const table = (v: number) => ({
    type: "table" as const,
    head,
    rows: Array.from({ length: STRIKE_TABLES }, (_, s) => [s === STRIKE_TABLES - 1 ? "2 o più" : String(s), ...LAMPS.map((_, seen) => `premi ${LAMP_NAME[LAMPS[rules.map[v]![s]![seen]!]!]}`)]),
  });
  return [
    {
      title: "Colori",
      blocks: [
        { type: "p", text: "Le luci lampeggiano in sequenza e la sequenza si allunga a ogni passo. Per ogni lampo l'artificiere preme il colore indicato qui, ripetendo tutta la sequenza dall'inizio ogni volta. Conta gli errori della bomba fatti finora." },
        { type: "h", text: "Se il numero di serie contiene una vocale" },
        table(0),
        { type: "h", text: "Se il numero di serie non contiene vocali" },
        table(1),
      ],
    },
  ];
}

const sequenceKeys = (data: ColorsData, rules: ColorsRules, edge: Edgework, strikes: number, from: ColorsProgress): number[] => {
  const keys: number[] = [];
  for (let stage = from.stage; stage < data.sequence.length; stage++) {
    for (let i = stage === from.stage ? from.entered : 0; i <= stage; i++) keys.push(colorToPress(rules, edge, strikes, data.sequence[i]!));
  }
  return keys;
};

export const colorsModule: ModuleDef<ColorsData, ColorsRules, ColorsProgress> = {
  kind: "colors",
  genRules,
  genData,
  initProgress: () => ({ stage: 0, entered: 0 }),
  judge({ data, rules, edge, progress, strikes }: JudgeInput<ColorsData, ColorsRules, ColorsProgress>, action: ModuleAction, _remainingMs: number): { verdict: Verdict; progress: ColorsProgress } {
    if (action.type !== "press" || action.key < 0 || action.key >= LAMPS.length) return { verdict: "ignored", progress };
    // un passo sbagliato obbliga a ripetere la sequenza di questo passo dall'inizio
    if (action.key !== colorToPress(rules, edge, strikes, data.sequence[progress.entered]!)) return { verdict: "strike", progress: { stage: progress.stage, entered: 0 } };
    if (progress.entered < progress.stage) return { verdict: "ok", progress: { stage: progress.stage, entered: progress.entered + 1 } };
    if (progress.stage + 1 >= data.sequence.length) return { verdict: "solved", progress: { stage: progress.stage + 1, entered: 0 } };
    return { verdict: "ok", progress: { stage: progress.stage + 1, entered: 0 } };
  },
  solution({ data, rules, edge, progress, strikes }): Solution {
    const keys = sequenceKeys(data, rules, edge, strikes, progress);
    const first = colorToPress(rules, edge, strikes, data.sequence[progress.entered]!);
    return {
      actions: keys.map((key) => ({ type: "press" as const, key })),
      text: `Con ${strikes} errori la sequenza completa va premuta così: ${data.sequence.map((s) => LAMP_NAME[LAMPS[colorToPress(rules, edge, strikes, s)]!]).join(", ")} (ora tocca a ${LAMP_NAME[LAMPS[first]!]})`,
    };
  },
  manual,
};
