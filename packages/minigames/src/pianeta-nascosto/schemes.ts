import type { ImportedSystem } from "./official-map.js";
import type { Mode } from "./sky.js";

/**
 * Gli schemi dell'app ufficiale importati dalla regia (piano, §3.10 bis). Gli schemi **non** stanno nel progetto né nel pacchetto:
 * il server li legge da `data/pianeta-schemi/` e li mette qui. È l'unico stato fuori dal round del plugin: le funzioni di gioco
 * lo leggono soltanto, e a parità di contenuto scelgono sempre lo stesso schema per lo stesso seme.
 */
const byCode = new Map<string, ImportedSystem>();

export const importedSchemes = {
  /** Sostituisce tutti gli schemi importati. */
  replace(list: ImportedSystem[]): void {
    byCode.clear();
    for (const s of list) byCode.set(s.code, s);
  },
  clear(): void {
    byCode.clear();
  },
  get: (code: string): ImportedSystem | undefined => byCode.get(code),
  /** I codici degli schemi di una modalità, in ordine. */
  codes: (mode: Mode): string[] => [...byCode.values()].filter((s) => s.mode === mode).map((s) => s.code).sort(),
  count: (mode: Mode): number => [...byCode.values()].filter((s) => s.mode === mode).length,
};

/** Lo schema per un round: quello indicato dal codice, altrimenti uno scelto dal seme tra quelli della modalità. */
export function pickScheme(source: "generated" | "official", code: string, mode: Mode, seed: number): ImportedSystem | null {
  if (source !== "official") return null;
  if (code) return importedSchemes.get(code) ?? null;
  const codes = importedSchemes.codes(mode);
  return codes.length > 0 ? (importedSchemes.get(codes[seed % codes.length]!) ?? null) : null;
}
