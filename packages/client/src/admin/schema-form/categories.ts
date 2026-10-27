/**
 * Il gestore delle categorie di «Indovina la canzone»: funzioni pure sui valori del modulo (la configurazione intera).
 * Il catalogo (`categories`) è l'elenco delle categorie del quiz; i brani (`songs[].categories`) e i round con la categoria
 * fissa (`rounds[].category`) le richiamano per nome, quindi rinominare o eliminare una categoria le cambia ovunque.
 */

export const OTHER_CATEGORY = "Altri brani";
export const CATEGORY_MAX_LENGTH = 30;
export const CATEGORY_MAX_COUNT = 40;
/** Il massimo di categorie per brano (come nello schema del quiz). */
export const SONG_CATEGORY_MAX = 5;

type Root = Record<string, unknown>;

const key = (name: string) => name.trim().toLowerCase();
const names = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim()) : [];
const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null) : [];

/** Le categorie dei brani senza doppioni (maiuscole a parte). */
function songCategories(song: Record<string, unknown>): string[] {
  const seen = new Set<string>();
  return names(song.categories).filter((c) => !seen.has(key(c)) && !!seen.add(key(c)));
}

export interface CategoryEntry {
  name: string;
  /** Quanti brani la hanno. */
  songs: number;
}

/** Le categorie del quiz: prima il catalogo, nel suo ordine, poi quelle usate dai brani ma non (ancora) nel catalogo. */
export function categoryList(root: Root): CategoryEntry[] {
  const out = new Map<string, CategoryEntry>();
  for (const name of names(root.categories)) if (!out.has(key(name))) out.set(key(name), { name, songs: 0 });
  const songs = records(root.songs);
  for (const song of songs) {
    for (const name of songCategories(song)) {
      const entry = out.get(key(name)) ?? { name, songs: 0 };
      entry.songs++;
      out.set(key(name), entry);
    }
  }
  return [...out.values()];
}

/** Quanti brani non hanno nessuna categoria (stanno in «Altri brani»). */
export const uncategorizedCount = (root: Root): number => records(root.songs).filter((s) => songCategories(s).length === 0).length;

/** Perché un nome non va bene come nuova categoria (o `null` se va bene); `except` è la categoria che si sta rinominando. */
export function categoryProblem(root: Root, name: string, except?: string): string | null {
  const clean = name.trim();
  if (clean === "") return "Scrivi un nome";
  if (clean.length > CATEGORY_MAX_LENGTH) return `Al massimo ${CATEGORY_MAX_LENGTH} caratteri`;
  if (key(clean) === key(OTHER_CATEGORY)) return `«${OTHER_CATEGORY}» è già la categoria dei brani senza categoria`;
  if (categoryList(root).some((c) => key(c.name) === key(clean) && (except === undefined || key(c.name) !== key(except)))) return `«${clean}» esiste già`;
  return null;
}

/** Aggiunge una categoria al catalogo; `null` se il nome non va bene (vuoto, doppione, troppe categorie). */
export function addCategory(root: Root, name: string): Root | null {
  if (categoryProblem(root, name) !== null || categoryList(root).length >= CATEGORY_MAX_COUNT) return null;
  return { ...root, categories: [...names(root.categories), name.trim()] };
}

/** Rinomina una categoria nel catalogo, nei brani e nei round con la categoria fissa; `null` se il nuovo nome non va bene. */
export function renameCategory(root: Root, from: string, to: string): Root | null {
  if (categoryProblem(root, to, from) !== null) return null;
  const next = to.trim();
  const swap = (list: string[]) => {
    const seen = new Set<string>();
    return list.map((c) => (key(c) === key(from) ? next : c)).filter((c) => !seen.has(key(c)) && !!seen.add(key(c)));
  };
  // Il catalogo comprende anche le categorie che finora c'erano solo nei brani, così il nome resta dov'era nell'elenco.
  const catalog = swap(categoryList(root).map((c) => c.name));
  return {
    ...root,
    categories: catalog,
    songs: records(root.songs).map((song) => (songCategories(song).some((c) => key(c) === key(from)) ? { ...song, categories: swap(songCategories(song)) } : song)),
    rounds: records(root.rounds).map((round) => (typeof round.category === "string" && key(round.category) === key(from) ? { ...round, category: next } : round)),
  };
}

/** Elimina una categoria dal catalogo e dai brani (che restano, magari senza categoria); i round che la fissavano restano senza categoria. */
export function removeCategory(root: Root, name: string): Root {
  const without = (list: string[]) => list.filter((c) => key(c) !== key(name));
  return {
    ...root,
    categories: without(names(root.categories)),
    songs: records(root.songs).map((song) => (songCategories(song).some((c) => key(c) === key(name)) ? { ...song, categories: without(songCategories(song)) } : song)),
    rounds: records(root.rounds).map((round) => {
      if (typeof round.category !== "string" || key(round.category) !== key(name)) return round;
      const { category: _gone, ...rest } = round;
      return rest;
    }),
  };
}

/** Aggiunge al catalogo le categorie che i brani hanno ma il catalogo no (istanze salvate prima). Restituisce lo stesso oggetto se non c'è nulla da fare. */
export function syncCatalog(root: Root): Root {
  const have = new Set(names(root.categories).map(key));
  const missing = categoryList(root).filter((c) => !have.has(key(c.name)));
  if (missing.length === 0 || !Array.isArray(root.songs)) return root;
  return { ...root, categories: [...names(root.categories), ...missing.map((c) => c.name)] };
}

/** Attiva o toglie una categoria a un brano (senza doppioni). */
export function toggleSongCategory(song: Record<string, unknown>, name: string, on: boolean): Record<string, unknown> {
  const current = songCategories(song);
  if (on && current.some((c) => key(c) === key(name))) return song;
  const rest = current.filter((c) => key(c) !== key(name));
  return { ...song, categories: on ? [...rest, name.trim()].slice(0, SONG_CATEGORY_MAX) : rest };
}
