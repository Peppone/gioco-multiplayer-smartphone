import { randInt, shuffle } from "../../knight-duel/rng.js";
import { type EdgeCond, type Edgework, describeEdgeCond, edgeCondKeys, evalEdgeCond, genEdgeCond } from "../edgework.js";
import type { Difficulty, JudgeInput, ManualSection, ModuleAction, ModuleDef, Solution, Verdict } from "./types.js";

/**
 * Pulsante: un tasto colorato con una scritta. Il manuale dice se premerlo e rilasciarlo subito oppure tenerlo
 * premuto; in questo caso compare una striscia colorata e va rilasciato quando la cifra delle unità dei secondi
 * del timer è quella indicata per quel colore.
 */

export const BUTTON_COLORS = ["red", "blue", "yellow", "white", "black"] as const;
export type ButtonColor = (typeof BUTTON_COLORS)[number];
export const BUTTON_LABELS = ["ANNULLA", "ESPLODI", "PREMI", "TIENI"] as const;
export type ButtonLabel = (typeof BUTTON_LABELS)[number];
export const STRIP_COLORS = ["blue", "white", "yellow", "red", "green"] as const;
export type StripColor = (typeof STRIP_COLORS)[number];

export const BUTTON_COLOR_NAME: Record<ButtonColor | StripColor, string> = {
  red: "rosso",
  blue: "blu",
  yellow: "giallo",
  white: "bianco",
  black: "nero",
  green: "verde",
};

/** Il rilascio è giusto anche se l'ora equa è così vicina a un cambio di cifra (come per i punti-velocità). */
export const RELEASE_TOLERANCE_MS = 150;

export type ButtonCond = EdgeCond | { type: "color"; color: ButtonColor } | { type: "label"; label: ButtonLabel };
export type ButtonMode = "tap" | "hold";

export interface ButtonRules {
  /** In ordine: vale la prima con tutte le condizioni vere; se nessuna lo è, vale `otherwise`. */
  rules: { when: ButtonCond[]; mode: ButtonMode }[];
  otherwise: ButtonMode;
  /** Cifra (unità dei secondi) su cui rilasciare, per colore della striscia. */
  releaseDigit: Record<StripColor, number>;
}

export interface ButtonData {
  color: ButtonColor;
  label: ButtonLabel;
  /** Colore della striscia: la TV la mostra solo mentre il pulsante è tenuto premuto. */
  strip: StripColor;
}

export interface ButtonProgress {
  holding: boolean;
}

const RULE_COUNT: Record<Difficulty, number> = { facile: 2, media: 3, difficile: 4 };

function evalCond(c: ButtonCond, data: ButtonData, edge: Edgework): boolean {
  switch (c.type) {
    case "color":
      return data.color === c.color;
    case "label":
      return data.label === c.label;
    default:
      return evalEdgeCond(c, edge);
  }
}

/** Cosa chiede il manuale per questo pulsante. */
export function buttonMode(data: ButtonData, rules: ButtonRules, edge: Edgework): ButtonMode {
  return rules.rules.find((r) => r.when.every((c) => evalCond(c, data, edge)))?.mode ?? rules.otherwise;
}

/** Cifra delle unità dei secondi mostrata dal timer quando restano `ms` millisecondi (il timer arrotonda per eccesso). */
export const timerDigit = (ms: number): number => Math.ceil(Math.max(ms, 0) / 1000) % 10;

export function releaseOk(digit: number, remainingMs: number): boolean {
  return [remainingMs - RELEASE_TOLERANCE_MS, remainingMs, remainingMs + RELEASE_TOLERANCE_MS].some((ms) => timerDigit(ms) === digit);
}

// ---- Generazione ----

const pick = <T>(rng: () => number, list: readonly T[]): T => list[randInt(rng, list.length)]!;

function condKeys(c: ButtonCond): string[] {
  switch (c.type) {
    case "color":
      return ["color"];
    case "label":
      return ["label"];
    default:
      return edgeCondKeys(c);
  }
}

function genCond(rng: () => number, difficulty: Difficulty): ButtonCond {
  const kinds = difficulty === "facile" ? ["color", "color", "label", "label"] : ["color", "label", "edge", "edge"];
  switch (pick(rng, kinds)) {
    case "color":
      return { type: "color", color: pick(rng, BUTTON_COLORS) };
    case "label":
      return { type: "label", label: pick(rng, BUTTON_LABELS) };
    default:
      return genEdgeCond(rng);
  }
}

function genRules(rng: () => number, difficulty: Difficulty): ButtonRules {
  const otherwise: ButtonMode = rng() < 0.5 ? "tap" : "hold";
  const rules = Array.from({ length: RULE_COUNT[difficulty] }, (_, i) => {
    const wanted = difficulty === "difficile" ? 2 : difficulty === "media" ? 1 + (rng() < 0.4 ? 1 : 0) : 1;
    const when: ButtonCond[] = [];
    const taken = new Set<string>();
    for (let attempt = 0; attempt < 30 && when.length < wanted; attempt++) {
      const c = genCond(rng, difficulty);
      const keys = condKeys(c);
      if (keys.some((k) => taken.has(k))) continue;
      keys.forEach((k) => taken.add(k));
      when.push(c);
    }
    // la prima regola è l'opposto di «altrimenti»: tutte e due le modalità sono possibili
    const mode: ButtonMode = i === 0 ? (otherwise === "tap" ? "hold" : "tap") : rng() < 0.5 ? "tap" : "hold";
    return { when, mode };
  });
  const digits = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
  return { rules, otherwise, releaseDigit: Object.fromEntries(STRIP_COLORS.map((c, i) => [c, digits[i]!])) as Record<StripColor, number> };
}

function genData(rng: () => number): ButtonData {
  return { color: pick(rng, BUTTON_COLORS), label: pick(rng, BUTTON_LABELS), strip: pick(rng, STRIP_COLORS) };
}

// ---- Testo del manuale ----

export function describeButtonCond(c: ButtonCond): string {
  switch (c.type) {
    case "color":
      return `il pulsante è ${BUTTON_COLOR_NAME[c.color]}`;
    case "label":
      return `la scritta è «${c.label}»`;
    default:
      return describeEdgeCond(c);
  }
}

const MODE_TEXT: Record<ButtonMode, string> = { tap: "premi e rilascia subito", hold: "tieni premuto" };

export function describeButtonRule(rule: ButtonRules["rules"][number]): string {
  return `Se ${rule.when.map(describeButtonCond).join(" e ")}: ${MODE_TEXT[rule.mode]}.`;
}

function manual(rules: ButtonRules): ManualSection[] {
  return [
    {
      title: "Pulsante: premere o tenere",
      blocks: [
        { type: "p", text: "Si legge l'elenco in ordine e si segue la prima regola vera." },
        { type: "list", ordered: false, items: [...rules.rules.map(describeButtonRule), `Altrimenti: ${MODE_TEXT[rules.otherwise]}.`] },
      ],
    },
    {
      title: "Pulsante: la striscia",
      blocks: [
        { type: "p", text: "Se il pulsante va tenuto premuto, compare una striscia colorata. Rilascia quando l'ultima cifra dei secondi del timer è quella del colore della striscia (per esempio, con il timer a 03:47 la cifra è 7)." },
        { type: "table", head: ["Striscia", "Rilascia con la cifra"], rows: STRIP_COLORS.map((c) => [BUTTON_COLOR_NAME[c], String(rules.releaseDigit[c])]) },
      ],
    },
  ];
}

export const buttonModule: ModuleDef<ButtonData, ButtonRules, ButtonProgress> = {
  kind: "button",
  genRules,
  genData,
  initProgress: () => ({ holding: false }),
  judge({ data, rules, edge, progress }: JudgeInput<ButtonData, ButtonRules, ButtonProgress>, action: ModuleAction, remainingMs: number): { verdict: Verdict; progress: ButtonProgress } {
    const mode = buttonMode(data, rules, edge);
    switch (action.type) {
      case "tap":
        if (progress.holding) return { verdict: "ignored", progress };
        return { verdict: mode === "tap" ? "solved" : "strike", progress };
      case "hold":
        if (progress.holding) return { verdict: "ignored", progress };
        return mode === "hold" ? { verdict: "ok", progress: { holding: true } } : { verdict: "strike", progress };
      case "release":
        if (!progress.holding) return { verdict: "ignored", progress };
        return { verdict: releaseOk(rules.releaseDigit[data.strip], remainingMs) ? "solved" : "strike", progress: { holding: false } };
      default:
        return { verdict: "ignored", progress };
    }
  },
  solution({ data, rules, edge }): Solution {
    if (buttonMode(data, rules, edge) === "tap") return { actions: [{ type: "tap" }], text: "Premi e rilascia subito" };
    const digit = rules.releaseDigit[data.strip];
    return { actions: [{ type: "hold" }, { type: "release" }], releaseDigit: digit, text: `Tieni premuto (striscia ${BUTTON_COLOR_NAME[data.strip]}) e rilascia con la cifra ${digit}` };
  },
  manual,
};
