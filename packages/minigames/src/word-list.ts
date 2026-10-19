import { z } from "zod";
import type { InstanceLookup } from "@gioco/shared";

/**
 * Lista di parole della libreria: un contenuto a sé (nel database), che più round e più giochi possono riusare
 * (Reazione a catena, Agenti Segreti). I giochi la riferiscono per id e `buildConfig` la risolve all'avvio.
 */
export const wordListSchema = z.object({
  words: z.array(z.string().trim().min(1).max(60)).min(1).max(500).meta({ title: "Parole", itemLabel: "Parola", widget: "lines" }),
});

/** Le parole di una lista della libreria, oppure `null` se l'istanza non c'è o non è una lista valida. */
export function lookupWordList(lookup: InstanceLookup, id: string): string[] | null {
  const inst = lookup(id);
  const list = inst?.typeId === "word-list" ? wordListSchema.safeParse(inst.config) : undefined;
  return list?.success ? list.data.words : null;
}
