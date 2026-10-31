/**
 * Esporta e importa i brani di «Indovina la canzone» da un'istanza all'altra (con effetti, camuffamenti, ascolto, punti e
 * categorie di ogni brano). I file audio non viaggiano: stanno nella libreria del server e il brano li richiama per nome,
 * quindi l'importazione funziona tra istanze dello stesso server. Funzioni pure sui valori del modulo.
 */
import { youtubeId } from "@gioco/shared";
import { CATEGORY_MAX_COUNT, CATEGORY_MAX_LENGTH } from "./categories";

type Root = Record<string, unknown>;
type Song = Record<string, unknown>;

export const SONGS_FORMAT = "gioco-ros-brani";

export interface SongBundle {
  format: typeof SONGS_FORMAT;
  version: 1;
  categories: string[];
  songs: Song[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const key = (name: string) => name.trim().toLowerCase();
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

/** Il contenuto da salvare in un file: tutti i brani (o quelli scelti) e le loro categorie. */
export function buildBundle(root: Root, only?: number[]): SongBundle {
  const all = Array.isArray(root.songs) ? (root.songs as Song[]) : [];
  const songs = (only ? all.filter((_, i) => only.includes(i)) : all).map((s) => structuredClone(s));
  const used = new Set(songs.flatMap((s) => strings(s.categories)).map(key));
  const catalog = strings(root.categories).filter((c) => !only || used.has(key(c)));
  return { format: SONGS_FORMAT, version: 1, categories: catalog, songs };
}

/** Legge un file di brani, un'istanza esportata dalla libreria (con `config`) o la sola configurazione. Errore a parole se non è valido. */
export function parseBundle(text: string): SongBundle {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Il file non è un JSON valido");
  }
  const source = isRecord(raw) && isRecord(raw.config) ? raw.config : raw;
  if (!isRecord(source) || !Array.isArray(source.songs)) throw new Error("Il file non contiene brani di «Indovina la canzone»");
  return fromConfig(source);
}

/** I brani (con una sorgente) e le categorie di una configurazione, di un file o di un'altra istanza. */
export function fromConfig(config: unknown): SongBundle {
  const c = isRecord(config) ? config : {};
  const songs = (Array.isArray(c.songs) ? c.songs : []).filter(isRecord).filter((s) => sourceKey(s) !== null);
  return { format: SONGS_FORMAT, version: 1, categories: strings(c.categories), songs: songs.map((s) => structuredClone(s)) };
}

/** Identità del brano: il suo file o il suo video, più il titolo (due brani uguali in due istanze contano uno). */
export function sourceKey(song: Song): string | null {
  const answer = typeof song.answer === "string" ? key(song.answer) : "";
  if (typeof song.audio === "string" && song.audio !== "") return `a:${song.audio}|${answer}`;
  if (typeof song.youtube === "string" && song.youtube.trim() !== "") return `y:${youtubeId(song.youtube) ?? song.youtube.trim()}|${answer}`;
  return null;
}

export interface MergeResult {
  root: Root;
  added: number;
  /** Già presenti (stesso file e titolo). */
  duplicates: number;
  /** Oltre il massimo di brani. */
  skipped: number;
  newCategories: number;
}

/** Aggiunge i brani importati in fondo a quelli presenti, saltando i doppioni e rispettando il massimo; le categorie nuove entrano nel catalogo. */
export function mergeBundle(root: Root, bundle: SongBundle, max: number): MergeResult {
  const present = Array.isArray(root.songs) ? (root.songs as Song[]) : [];
  const seen = new Set(present.map(sourceKey).filter((k): k is string => k !== null));
  const toAdd: Song[] = [];
  let duplicates = 0;
  let skipped = 0;
  for (const song of bundle.songs) {
    const k = sourceKey(song);
    if (k === null || seen.has(k)) {
      duplicates++;
      continue;
    }
    if (present.length + toAdd.length >= max) {
      skipped++;
      continue;
    }
    seen.add(k);
    toAdd.push(song);
  }
  const catalog = strings(root.categories);
  const known = new Set(catalog.map(key));
  const fresh: string[] = [];
  for (const raw of [...bundle.categories, ...toAdd.flatMap((s) => strings(s.categories))]) {
    const name = raw.trim().slice(0, CATEGORY_MAX_LENGTH);
    if (name === "" || known.has(key(name)) || catalog.length + fresh.length >= CATEGORY_MAX_COUNT) continue;
    known.add(key(name));
    fresh.push(name);
  }
  return {
    root: { ...root, songs: [...present, ...toAdd], categories: [...catalog, ...fresh] },
    added: toAdd.length,
    duplicates,
    skipped,
    newCategories: fresh.length,
  };
}

/** L'esito a parole. */
export function mergeMessage(r: MergeResult): string {
  const parts = [`Importati ${r.added} brani`];
  if (r.newCategories > 0) parts.push(`${r.newCategories} nuove categorie`);
  if (r.duplicates > 0) parts.push(`${r.duplicates} già presenti o senza sorgente (saltati)`);
  if (r.skipped > 0) parts.push(`${r.skipped} oltre il massimo (non aggiunti)`);
  return `${parts.join(" · ")}.`;
}
