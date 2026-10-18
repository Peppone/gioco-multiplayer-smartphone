import type { CSSProperties } from "react";

/**
 * Variabili CSS per adattare il testo di una carta alla sua larghezza: il CSS sceglie il corpo del testo dividendo
 * la larghezza della carta (`cqi`) per il numero di lettere (`--n`, o `--n2` dove il tema va a capo su due righe),
 * così anche le parole più lunghe stanno su una carta da ~60 px. Lo usa anche il test e2e su tutte le parole.
 */
export function cardTextVars(word: string): CSSProperties {
  const n = Math.max(4, word.length);
  return { "--n": n, "--n2": Math.max(4, Math.ceil(word.length / 2)) } as CSSProperties;
}
