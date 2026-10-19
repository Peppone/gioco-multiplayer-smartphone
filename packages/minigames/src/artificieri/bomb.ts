import { deriveSeed, makeRng, shuffle } from "../knight-duel/rng.js";
import { type Edgework, INDICATOR_LABELS, PORT_NAMES, SERIAL_VOWELS, genEdgework } from "./edgework.js";
import { buttonModule } from "./modules/button.js";
import { colorsModule } from "./modules/colors.js";
import { mazeModule } from "./modules/maze.js";
import { symbolsModule } from "./modules/symbols.js";
import { wordModule } from "./modules/word.js";
import { type Difficulty, type GenContent, MODULE_KINDS, type ManualBlock, type ManualSection, type ModuleAction, type ModuleDef, type ModuleInstance, type ModuleKind, type Verdict } from "./modules/types.js";
import { wiresModule } from "./modules/wires.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyModuleDef = ModuleDef<any, any, any>;

export const MODULES: Record<ModuleKind, AnyModuleDef> = {
  wires: wiresModule,
  button: buttonModule,
  symbols: symbolsModule,
  colors: colorsModule,
  maze: mazeModule,
  word: wordModule,
};

/** Regole del manuale di una bomba, per tipo di modulo: valgono per tutti i moduli di quel tipo sulla bomba. */
export type BombRules = Partial<Record<ModuleKind, unknown>>;

export interface BombSetup {
  edgework: Edgework;
  rules: BombRules;
  modules: ModuleInstance[];
}

export interface BombOptions {
  difficulty: Difficulty;
  /** Numero di moduli sulla bomba. */
  modules: number;
  /** Tipi di modulo ammessi (almeno uno). */
  enabled: readonly ModuleKind[];
  /** Se c'è, le regole del manuale vengono da questo seme invece che da quello della bomba (stessa edizione per più bombe). */
  rulesSeed?: number;
  /** Contenuti della libreria (parole del modulo «Parola»). */
  content?: GenContent;
}

/**
 * Genera una bomba dal seme: stesso seme e stesse opzioni, stessa bomba. Ogni parte ha un flusso casuale suo
 * (bordo, regole di ciascun tipo, dati di ciascun modulo), così aggiungere un tipo non cambia le regole degli altri.
 */
export function generateBomb(seed: number, opts: BombOptions): BombSetup {
  const kinds = MODULE_KINDS.filter((k) => opts.enabled.includes(k));
  if (kinds.length === 0) throw new Error("Artificieri: nessun tipo di modulo attivo");
  const edgework = genEdgework(makeRng(deriveSeed(seed, 1)));
  const rules: BombRules = {};
  for (const kind of kinds) rules[kind] = MODULES[kind].genRules(makeRng(deriveSeed(opts.rulesSeed ?? seed, 10 + MODULE_KINDS.indexOf(kind))), opts.difficulty, opts.content ?? {});
  const order = shuffle(kinds, makeRng(deriveSeed(seed, 2)));
  const modules = Array.from({ length: opts.modules }, (_, id): ModuleInstance => {
    const kind = order[id % order.length]!;
    const def = MODULES[kind];
    const data = def.genData(makeRng(deriveSeed(seed, 100 + id)), rules[kind], edgework, opts.difficulty);
    return { id, kind, data, progress: def.initProgress(data), solved: false };
  });
  return { edgework, rules, modules };
}

/** Giudica un'azione su un modulo: restituisce l'esito e il modulo aggiornato (mai l'originale modificato). */
export function judgeModule(setup: Pick<BombSetup, "edgework" | "rules">, mod: ModuleInstance, action: ModuleAction, remainingMs: number, strikes = 0): { verdict: Verdict; module: ModuleInstance } {
  if (mod.solved) return { verdict: "ignored", module: mod };
  const out = MODULES[mod.kind].judge({ data: mod.data, rules: setup.rules[mod.kind], edge: setup.edgework, progress: mod.progress, strikes }, action, remainingMs);
  if (out.verdict === "ignored") return { verdict: "ignored", module: mod };
  return { verdict: out.verdict, module: { ...mod, progress: out.progress, solved: out.verdict === "solved" } };
}

// ---- Manuale ----

export interface ManualPage extends ManualSection {
  id: number;
}

function edgeworkSection(): ManualSection {
  const blocks: ManualBlock[] = [
    { type: "p", text: "Sul bordo della bomba, che si vede solo sulla TV, ci sono quattro informazioni che molte regole usano. Chi è davanti alla TV deve leggervele: chiedetele ogni volta che una regola le nomina." },
    {
      type: "list",
      ordered: false,
      items: [
        `Numero di serie: 6 caratteri. Le vocali che possono comparire sono ${[...SERIAL_VOWELS].join(", ")}. L'ultimo carattere è sempre una cifra, ed è l'«ultima cifra».`,
        "Batterie: da 0 a 4, disegnate come pile.",
        `Spie: sigle di tre lettere (${INDICATOR_LABELS.join(", ")}), ognuna accesa o spenta. Quelle che non ci sono sul bordo non contano.`,
        `Porte: ${PORT_NAMES.join(", ")}. Possono mancare tutte.`,
      ],
    },
  ];
  return { title: "Il bordo della bomba", blocks };
}

/** Pagine del manuale di una bomba: il bordo, poi quelle dei tipi di modulo ammessi. */
export function buildManual(rules: BombRules): ManualPage[] {
  const sections = [edgeworkSection(), ...MODULE_KINDS.filter((k) => rules[k] !== undefined).flatMap((k) => MODULES[k].manual(rules[k]))];
  return sections.map((s, id) => ({ id, ...s }));
}
