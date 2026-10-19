import { randInt, shuffle } from "../knight-duel/rng.js";

/**
 * Bordo della bomba: numero di serie, batterie, spie e porte. Si vede solo sulla TV; le regole del manuale
 * lo usano come condizione (`EdgeCond`), e il testo del manuale viene dalla stessa struttura.
 */

export const INDICATOR_LABELS = ["FRK", "CAR", "SND", "CLR", "TRN"] as const;
export const PORT_NAMES = ["RJ-45", "USB", "VGA", "SERIALE"] as const;
/** Senza I, O, Q, Y: non si confondono con cifre o tra loro. Le vocali possibili sono quindi A, E, U. */
const SERIAL_LETTERS = "ABCDEFGHJKLMNPRSTUVWXZ";
/** Senza 0 e 1 (confusi con O e I). */
const SERIAL_DIGITS = "23456789";
export const SERIAL_VOWELS = "AEU";

export interface Indicator {
  label: string;
  lit: boolean;
}

export interface Edgework {
  /** 6 caratteri, l'ultimo è sempre una cifra. */
  serial: string;
  batteries: number;
  indicators: Indicator[];
  ports: string[];
}

export function genEdgework(rng: () => number): Edgework {
  const char = () => (rng() < 0.55 ? SERIAL_LETTERS[randInt(rng, SERIAL_LETTERS.length)]! : SERIAL_DIGITS[randInt(rng, SERIAL_DIGITS.length)]!);
  const serial = Array.from({ length: 5 }, char).join("") + SERIAL_DIGITS[randInt(rng, SERIAL_DIGITS.length)]!;
  const indicators = shuffle(INDICATOR_LABELS, rng)
    .slice(0, 1 + randInt(rng, 4))
    .map((label) => ({ label, lit: rng() < 0.5 }));
  return {
    serial,
    batteries: randInt(rng, 5),
    indicators,
    ports: shuffle(PORT_NAMES, rng).slice(0, randInt(rng, 4)),
  };
}

export type EdgeCond =
  | { type: "serial-odd" }
  | { type: "serial-even" }
  | { type: "serial-vowel" }
  | { type: "batteries"; op: "gte" | "lte"; n: number }
  /** Vera solo se la spia esiste ed è nello stato indicato. */
  | { type: "indicator"; label: string; lit: boolean }
  | { type: "port"; port: string; present: boolean };

export function evalEdgeCond(c: EdgeCond, e: Edgework): boolean {
  switch (c.type) {
    case "serial-odd":
      return Number(e.serial.at(-1)) % 2 === 1;
    case "serial-even":
      return Number(e.serial.at(-1)) % 2 === 0;
    case "serial-vowel":
      return [...e.serial].some((ch) => SERIAL_VOWELS.includes(ch));
    case "batteries":
      return c.op === "gte" ? e.batteries >= c.n : e.batteries <= c.n;
    case "indicator":
      return e.indicators.some((i) => i.label === c.label && i.lit === c.lit);
    case "port":
      return e.ports.includes(c.port) === c.present;
  }
}

export function describeEdgeCond(c: EdgeCond): string {
  switch (c.type) {
    case "serial-odd":
      return "l'ultima cifra del numero di serie è dispari";
    case "serial-even":
      return "l'ultima cifra del numero di serie è pari";
    case "serial-vowel":
      return "il numero di serie contiene una vocale";
    case "batteries":
      if (c.op === "gte") return c.n === 1 ? "c'è almeno una batteria" : `ci sono almeno ${c.n} batterie`;
      return c.n === 0 ? "non ci sono batterie" : c.n === 1 ? "c'è al massimo una batteria" : `ci sono al massimo ${c.n} batterie`;
    case "indicator":
      return `c'è la spia ${c.label} ${c.lit ? "accesa" : "spenta"}`;
    case "port":
      return c.present ? `c'è una porta ${c.port}` : `non c'è nessuna porta ${c.port}`;
  }
}

export function genEdgeCond(rng: () => number): EdgeCond {
  switch (randInt(rng, 6)) {
    case 0:
      return { type: "serial-odd" };
    case 1:
      return { type: "serial-even" };
    case 2:
      return { type: "serial-vowel" };
    case 3:
      return rng() < 0.5 ? { type: "batteries", op: "gte", n: 1 + randInt(rng, 3) } : { type: "batteries", op: "lte", n: randInt(rng, 3) };
    case 4:
      return { type: "indicator", label: INDICATOR_LABELS[randInt(rng, INDICATOR_LABELS.length)]!, lit: rng() < 0.5 };
    default:
      return { type: "port", port: PORT_NAMES[randInt(rng, PORT_NAMES.length)]!, present: rng() < 0.6 };
  }
}

/** Soggetti toccati da una condizione di bordo: due condizioni della stessa regola non devono condividerli. */
export function edgeCondKeys(c: EdgeCond): string[] {
  switch (c.type) {
    case "serial-odd":
    case "serial-even":
      return ["serial-parity"];
    case "serial-vowel":
      return ["serial-vowel"];
    case "batteries":
      return ["batteries"];
    case "indicator":
      return [`indicator:${c.label}`];
    case "port":
      return [`port:${c.port}`];
  }
}
