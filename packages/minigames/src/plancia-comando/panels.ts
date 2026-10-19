import { deriveSeed, makeRng, randInt, shuffle } from "../knight-duel/rng.js";
import { SELECTOR_VALUES, makeName, withArticle } from "./names.js";

/**
 * Pannelli e ordini della Plancia di Comando: ogni giocatore ha alcuni comandi dai nomi assurdi, e ogni ordine chiede
 * di portare un comando (quasi sempre di un compagno) a un valore diverso da quello attuale. Funzioni pure.
 */

export type ControlKind = "button" | "toggle" | "slider" | "selector";
export const CONTROL_KINDS: ControlKind[] = ["button", "toggle", "slider", "selector"];
export const SLIDER_MAX = 5;

export interface Control {
  id: string;
  name: string;
  kind: ControlKind;
  /** Il giocatore che lo ha sul pannello: solo lui può usarlo. */
  owner: string;
  /** Valori a parole del selettore (vuoto per gli altri). */
  options: string[];
  /** Pulsante: quante volte è stato premuto; interruttore 0/1; cursore 0–5; selettore: indice di `options`. */
  value: number;
}

export interface Order {
  id: number;
  /** Chi legge l'ordine sul telefono (e deve gridarlo). */
  holder: string;
  controlId: string;
  /** Il valore che il comando deve raggiungere (pulsante: contatore attuale + 1). */
  target: number;
  text: string;
  issuedAt: number;
  deadline: number;
}

/** Quanti valori ha un comando: il cursore da 0 a 5, il selettore tanti quante sono le sue parole. */
export function valueCount(c: Pick<Control, "kind" | "options">): number {
  return c.kind === "toggle" ? 2 : c.kind === "slider" ? SLIDER_MAX + 1 : c.kind === "selector" ? c.options.length : Infinity;
}

/** L'ordine che chiede di portare `c` al valore `target`. */
export function orderText(c: Control, target: number): string {
  const name = withArticle(c.name);
  switch (c.kind) {
    case "button":
      return `Premi ${name}!`;
    case "toggle":
      return `${target === 1 ? "Accendi" : "Spegni"} ${name}!`;
    case "slider":
      return `Porta ${name} a ${target}!`;
    case "selector":
      return `Imposta ${name} su ${c.options[target]}!`;
  }
}

/** Il valore di un comando a parole, per «ultimo ordine eseguito». */
export function valueText(c: Control, value: number): string {
  if (c.kind === "button") return "premuto";
  if (c.kind === "toggle") return value === 1 ? "acceso" : "spento";
  if (c.kind === "slider") return String(value);
  return c.options[value] ?? String(value);
}

/**
 * I pannelli di un equipaggio: `perPanel` comandi per membro, con nomi diversi tra loro (e, per quanto possibile, con iniziali
 * diverse e mai già usati dagli altri equipaggi in `taken`, per non confonderli quando si grida).
 */
export function makePanels(opts: { members: string[]; perPanel: number; nouns: string[]; adjectives: string[]; seed: number; taken: Set<string>; idPrefix: string }): Control[] {
  const rng = makeRng(opts.seed);
  const total = opts.members.length * opts.perPanel;
  const used = new Set<string>();
  const usedNouns = new Set<string>();
  const initials = new Set<string>();
  const names: string[] = [];
  const nouns = shuffle(opts.nouns, rng);
  for (let i = 0; i < total; i++) {
    let pick: { name: string; noun: string } | null = null;
    // si prova prima con un sostantivo nuovo e un'iniziale nuova, poi si accetta di meno
    for (const strict of [2, 1, 0]) {
      for (let attempt = 0; attempt < 40 && !pick; attempt++) {
        const noun = nouns[randInt(rng, nouns.length)]!;
        const name = makeName(noun, opts.adjectives[randInt(rng, opts.adjectives.length)]!);
        if (used.has(name) || opts.taken.has(name)) continue;
        if (strict >= 1 && usedNouns.has(noun) && usedNouns.size < nouns.length) continue;
        if (strict >= 2 && initials.has(noun[0]!.toUpperCase()) && initials.size < 20) continue;
        pick = { name, noun };
      }
      if (pick) break;
    }
    if (!pick) pick = { name: `${makeName(nouns[i % nouns.length]!, opts.adjectives[i % opts.adjectives.length]!)} ${i + 1}`, noun: nouns[i % nouns.length]! };
    used.add(pick.name);
    usedNouns.add(pick.noun);
    initials.add(pick.noun[0]!.toUpperCase());
    names.push(pick.name);
  }
  // i tipi si alternano (un po' di tutto su ogni pannello) e si mescolano tra i membri
  const kinds = shuffle(Array.from({ length: total }, (_, i) => CONTROL_KINDS[i % CONTROL_KINDS.length]!), rng);
  const owners = opts.members.flatMap((m) => Array<string>(opts.perPanel).fill(m));
  return names.map((name, i): Control => {
    const kind = kinds[i]!;
    const options = kind === "selector" ? shuffle(SELECTOR_VALUES, rng).slice(0, 3 + randInt(rng, 2)) : [];
    return { id: `${opts.idPrefix}${i + 1}`, name, kind, owner: owners[i]!, options, value: kind === "slider" ? randInt(rng, SLIDER_MAX + 1) : kind === "selector" ? randInt(rng, options.length) : 0 };
  });
}

/** Il valore da chiedere: sempre diverso da quello attuale (pulsante: una pressione in più). */
export function pickTarget(c: Control, rng: () => number): number {
  if (c.kind === "button") return c.value + 1;
  if (c.kind === "toggle") return 1 - c.value;
  const n = valueCount(c);
  const others = Array.from({ length: n }, (_, i) => i).filter((v) => v !== c.value);
  return others[randInt(rng, others.length)]!;
}

/**
 * Il prossimo ordine per `holder`: un comando di un compagno (con probabilità `1 - ownShare`) o del proprio pannello, scelto
 * tra quelli che nessun altro ordine sta già chiedendo (se ci sono). Con un solo membro l'ordine è sempre sul proprio pannello.
 */
export function nextOrder(opts: { controls: Control[]; busy: Set<string>; holder: string; ownShare: number; seed: number; id: number; now: number; seconds: number }): Order | null {
  const rng = makeRng(deriveSeed(opts.seed, opts.id));
  const mine = opts.controls.filter((c) => c.owner === opts.holder);
  const mates = opts.controls.filter((c) => c.owner !== opts.holder);
  const own = mates.length === 0 || rng() * 100 < opts.ownShare;
  const pool = own ? mine : mates;
  const free = pool.filter((c) => !opts.busy.has(c.id));
  const choices = free.length > 0 ? free : pool;
  if (choices.length === 0) return null;
  const control = choices[randInt(rng, choices.length)]!;
  const target = pickTarget(control, rng);
  return { id: opts.id, holder: opts.holder, controlId: control.id, target, text: orderText(control, target), issuedAt: opts.now, deadline: opts.now + Math.round(opts.seconds * 1000) };
}
