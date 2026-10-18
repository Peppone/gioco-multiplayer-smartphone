/** Confronto tra parole: minuscole, senza accenti, senza spazi agli estremi, un solo tipo di apostrofo. */
export function normalizeWord(word: string): string {
  return word
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’‘`]/g, "'");
}

/** Una parola sola: lettere, con trattini o apostrofi in mezzo («dopo-sci», «quell'anno»). */
const ONE_WORD = /^\p{L}+(?:['’-]\p{L}+)*$/u;

/** Parte in comune minima perché un indizio che contiene una carta (o ne è contenuto) sia rifiutato. */
export const MIN_OVERLAP = 4;

/**
 * Motivo per cui l'indizio non è valido, oppure `null`. Si confronta solo con le carte **ancora coperte**:
 * la parola di una carta già scoperta si può usare.
 * Rifiutati: più parole, una parola della griglia, una parola che contiene una carta o ne è contenuta se la parte in
 * comune ha almeno 4 lettere («marino» con la carta «mare» passa, «pescecane» con la carta «cane» no).
 * I casi più sottili (sinonimi, traduzioni, rime) li giudica la regia.
 */
export function clueProblem(clue: string, coveredWords: string[]): string | null {
  const text = clue.trim();
  if (!ONE_WORD.test(text)) return /\s/.test(text) ? "L'indizio deve essere una parola sola" : "L'indizio può contenere solo lettere, trattini e apostrofi";
  const c = normalizeWord(text);
  for (const word of coveredWords) {
    const w = normalizeWord(word);
    if (c === w) return `«${word}» è una parola della griglia`;
    const shorter = c.length <= w.length ? c : w;
    if (shorter.length >= MIN_OVERLAP && (c.includes(w) || w.includes(c))) return `«${text}» è troppo simile alla carta «${word}»`;
  }
  return null;
}
