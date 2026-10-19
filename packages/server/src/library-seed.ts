import { eq } from "drizzle-orm";
import { type Db, settings } from "./db.js";
import type { LibraryService } from "./library-service.js";
import { AGENTI_SEGRETI_WORDS } from "./seed-words.js";

/** Segna che il contenuto iniziale è già stato scritto: se la regia elimina la lista, non torna al riavvio. */
export const AGENTI_WORDS_SEED_KEY = "seed.agenti-segreti-words";
export const AGENTI_WORDS_TITLE = "Parole di Agenti Segreti";

/**
 * Contenuto iniziale della libreria, scritto nel database una volta sola (al primo avvio con questo campo vuoto): la
 * «Lista di parole» per Agenti Segreti. Da lì in poi le parole vivono nel database e si cambiano dall'editor della
 * regia, come ogni contenuto. Restituisce l'id della lista creata, oppure `null` se c'era già (o non si è potuta creare).
 */
export function seedLibrary(db: Db, library: LibraryService): string | null {
  if (db.select().from(settings).where(eq(settings.key, AGENTI_WORDS_SEED_KEY)).get()) return null;
  const created = library.createInstance({ typeId: "word-list", title: AGENTI_WORDS_TITLE, theme: "retro80", config: { words: AGENTI_SEGRETI_WORDS } });
  if (!created.ok) return null;
  db.insert(settings).values({ key: AGENTI_WORDS_SEED_KEY, value: created.value.id }).run();
  return created.value.id;
}

