import { randInt, shuffle } from "../../knight-duel/rng.js";
import type { Edgework } from "../edgework.js";
import type { Difficulty, GenContent, JudgeInput, ManualSection, ModuleAction, ModuleDef, Solution, Verdict } from "./types.js";

/**
 * Parola: cinque rotelle di lettere sulla TV (se ne vede una per rotella), sul telefono `‹ ›` per ogni rotella e
 * «Invia». Il manuale ha un elenco di parole da cinque lettere: una sola si può comporre con le lettere delle rotelle
 * (la lettera i della parola sta nella rotella i). Le parole vengono da una «Lista di parole» della libreria.
 */

export const WORD_LENGTH = 5;
export const WHEEL_LETTERS = 6;
/** Parole nell'elenco del manuale. */
const LIST_SIZE: Record<Difficulty, number> = { facile: 12, media: 20, difficile: 30 };
/** Meno parole di così e il modulo non si può generare. */
export const MIN_WORDS = 12;

/** Maiuscole senza accenti; `null` se non sono esattamente cinque lettere dell'alfabeto latino. */
export function normalizeWord5(raw: string): string | null {
  const w = raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  return /^[A-Z]{5}$/.test(w) ? w : null;
}

/** Le parole utilizzabili del contenuto: da cinque lettere, senza doppioni. */
export function usableWords(words: string[]): string[] {
  return [...new Set(words.flatMap((w) => normalizeWord5(w) ?? []))];
}

export interface WordRules {
  /** Elenco del manuale, in ordine alfabetico. */
  words: string[];
}

export interface WordData {
  /** Le sei lettere di ogni rotella (nell'ordine in cui compaiono girando). */
  wheels: string[][];
  /** Rotella i → posizione di partenza. */
  start: number[];
}

export interface WordProgress {
  pos: number[];
}

const fits = (word: string, wheels: string[][]) => [...word].every((ch, i) => wheels[i]!.includes(ch));

/** La parola giusta: l'unica dell'elenco del manuale che si compone con le rotelle. Non sta nei dati (la TV è pubblica). */
export const targetOf = (data: WordData, rules: WordRules): string => rules.words.find((w) => fits(w, data.wheels))!;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function genRules(rng: () => number, difficulty: Difficulty, content: GenContent): WordRules {
  const pool = usableWords(content.words ?? []);
  if (pool.length < MIN_WORDS) throw new Error(`Parola: servono almeno ${MIN_WORDS} parole di ${WORD_LENGTH} lettere (ce ne sono ${pool.length})`);
  return { words: shuffle(pool, rng).slice(0, LIST_SIZE[difficulty]).sort() };
}

/** Rotelle con la parola giusta e nessun'altra parola dell'elenco componibile. */
function genWheels(rng: () => number, words: string[], target: string): string[][] {
  for (let attempt = 0; attempt < 500; attempt++) {
    const wheels = [...target].map((ch) => {
      const others = shuffle([...ALPHABET].filter((c) => c !== ch), rng).slice(0, WHEEL_LETTERS - 1);
      return shuffle([ch, ...others], rng);
    });
    if (words.every((w) => w === target || !fits(w, wheels))) return wheels;
  }
  throw new Error("Parola: nessuna combinazione di rotelle con una sola parola");
}

function genData(rng: () => number, rules: WordRules, _edge: Edgework, _difficulty: Difficulty): WordData {
  const target = rules.words[randInt(rng, rules.words.length)]!;
  const wheels = genWheels(rng, rules.words, target);
  // si parte da lettere sbagliate: all'inizio la parola mostrata non è quella giusta
  const start = wheels.map((w, i) => {
    const wrong = w.map((_, k) => k).filter((k) => w[k] !== target[i]);
    return wrong[randInt(rng, wrong.length)]!;
  });
  return { wheels, start };
}

const wordAt = (data: WordData, pos: number[]) => pos.map((p, i) => data.wheels[i]![p]!).join("");

function manual(rules: WordRules): ManualSection[] {
  return [
    {
      title: "Parole",
      blocks: [
        { type: "p", text: "Ogni rotella mostra una lettera e girando ne passano sei. La prima lettera della parola giusta sta nella prima rotella, la seconda nella seconda e così via. Una sola di queste parole si può comporre: l'artificiere legge le lettere di ogni rotella, voi cercate la parola." },
        { type: "words", words: rules.words },
      ],
    },
  ];
}

export const wordModule: ModuleDef<WordData, WordRules, WordProgress> = {
  kind: "word",
  genRules,
  genData,
  initProgress: (data) => ({ pos: [...data.start] }),
  judge({ data, rules, progress }: JudgeInput<WordData, WordRules, WordProgress>, action: ModuleAction, _remainingMs: number): { verdict: Verdict; progress: WordProgress } {
    if (action.type === "spin") {
      if (!Number.isInteger(action.wheel) || action.wheel < 0 || action.wheel >= WORD_LENGTH || (action.delta !== 1 && action.delta !== -1)) return { verdict: "ignored", progress };
      // girare una rotella non è mai un errore
      const pos = progress.pos.map((p, i) => (i === action.wheel ? (p + action.delta + WHEEL_LETTERS) % WHEEL_LETTERS : p));
      return { verdict: "ok", progress: { pos } };
    }
    if (action.type !== "submit") return { verdict: "ignored", progress };
    return { verdict: wordAt(data, progress.pos) === targetOf(data, rules) ? "solved" : "strike", progress };
  },
  solution({ data, rules, progress }): Solution {
    const target = targetOf(data, rules);
    const actions: ModuleAction[] = [];
    [...target].forEach((ch, i) => {
      const goal = data.wheels[i]!.indexOf(ch);
      const forward = (goal - progress.pos[i]! + WHEEL_LETTERS) % WHEEL_LETTERS;
      const delta = forward <= WHEEL_LETTERS / 2 ? 1 : -1;
      const steps = delta === 1 ? forward : WHEEL_LETTERS - forward;
      for (let k = 0; k < steps; k++) actions.push({ type: "spin", wheel: i, delta });
    });
    actions.push({ type: "submit" });
    return { actions, text: `Componi ${target} e premi «Invia»` };
  },
  manual,
};
