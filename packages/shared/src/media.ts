/**
 * Estensioni accettate e relativo tipo MIME (quelli che i browser riproducono senza plugin). L'mp4 è un video: del file
 * si usa solo la traccia audio, l'immagine non si mostra mai (rivelerebbe il brano).
 */
export const AUDIO_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  wav: "audio/wav",
  webm: "audio/webm",
  flac: "audio/flac",
};

/** Nome di un file della mediateca: id casuale + estensione (non rivela il titolo del brano). */
export const MEDIA_FILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp3|m4a|mp4|aac|ogg|wav|webm|flac)$/;

/** Dimensione massima di un file caricato (byte): un mp4 pesa molto più di un mp3 della stessa durata. */
export const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

/**
 * Tipo MIME da dichiarare nel caricamento di un file. Quello del browser vale solo se il server lo riconosce; altrimenti
 * (Windows lascia vuoto il tipo di alcuni file, o ne dà uno inatteso come `video/x-m4v`) si ricava dall'estensione del nome.
 */
export function mediaContentType(fileName: string, browserType: string): string {
  const mime = browserType.split(";")[0]!.trim().toLowerCase();
  if (Object.values(AUDIO_TYPES).includes(mime)) return mime;
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase();
  return (ext && AUDIO_TYPES[ext]) || mime || "audio/mpeg";
}

export interface MediaItem {
  /** Nome del file nella mediateca (è il valore salvato nelle configurazioni). */
  file: string;
  /** Nome originale del file, solo per la regia. */
  name: string;
  size: number;
}

/** Id (11 caratteri) di un video YouTube, da un link (watch, youtu.be, embed, shorts, music) o dall'id stesso. */
export function youtubeId(input: string): string | null {
  const s = input.trim();
  const valid = (id: string | null | undefined): string | null => (id && /^[\w-]{11}$/.test(id) ? id : null);
  if (valid(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^(www|m|music)\./, "");
    if (host === "youtu.be") return valid(u.pathname.slice(1).split("/")[0]);
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      return valid(u.searchParams.get("v") ?? /^\/(?:embed|shorts|live)\/([\w-]{11})/.exec(u.pathname)?.[1]);
    }
  } catch {
    /* non è un URL */
  }
  return null;
}

/** Effetti applicabili all'audio di un brano (solo ai file caricati, non ai video YouTube). */
export const AUDIO_EFFECTS = ["blur", "no_voice", "telephone", "distortion", "echo", "reverse_chunks", "flip_spectrum", "shuffle_syllables"] as const;
export type AudioEffect = (typeof AUDIO_EFFECTS)[number];

/**
 * Gli effetti «che rompono le parole» (camuffamento): non filtrano il suono in tempo reale, rielaborano i campioni del
 * file prima che suoni (vedi docs/PIANO-CAMUFFAMENTO-AUDIO.md). Stanno nello stesso elenco degli altri e si sommano con loro.
 */
export const BUFFER_EFFECTS = ["reverse_chunks", "flip_spectrum", "shuffle_syllables"] as const;
export type BufferEffect = (typeof BUFFER_EFFECTS)[number];
export const isBufferEffect = (type: AudioEffect): type is BufferEffect => (BUFFER_EFFECTS as readonly string[]).includes(type);
/** Gli effetti che usano una variante (un seme): stesso seme, stesso ascolto. */
export const SEEDED_EFFECTS = ["shuffle_syllables"] as const;
export const EFFECT_SEED = { min: 1, max: 999, default: 1 } as const;

/**
 * Un effetto con la sua quantità, in percentuale: 100 è l'effetto «pieno» di riferimento, sotto è più leggero, sopra è
 * esteso (fino a `EFFECT_AMOUNT.max`). Un brano ne ha più d'uno, applicati in serie nell'ordine dell'elenco.
 */
export interface EffectSetting {
  type: AudioEffect;
  amount: number;
  /** Solo per gli effetti con una variante (`SEEDED_EFFECTS`). */
  seed?: number;
}
export const EFFECT_AMOUNT = { min: 10, max: 300, default: 100, step: 5 } as const;
/** Quanti effetti si possono sommare su uno stesso brano. */
export const MAX_EFFECTS = 8;

/** Gli effetti del modulo precedente: un solo effetto per brano, in tre intensità fisse. */
export const LEGACY_AUDIO_EFFECTS = ["none", "blur", "heavy_blur", "no_voice"] as const;
export type LegacyAudioEffect = (typeof LEGACY_AUDIO_EFFECTS)[number];

/** Il vecchio effetto singolo come elenco: «molto sfocato» è lo sfocato esteso a 165 (stessa frequenza di taglio, circa 450 Hz). */
export function legacyEffectSettings(effect: LegacyAudioEffect | undefined): EffectSetting[] {
  switch (effect) {
    case "blur":
      return [{ type: "blur", amount: 100 }];
    case "heavy_blur":
      return [{ type: "blur", amount: 165 }];
    case "no_voice":
      return [{ type: "no_voice", amount: 100 }];
    default:
      return [];
  }
}

/** Quantità dello sfocato che guida l'ovattato a fasi prima che il filtro segua la curva delle fasi (≈ 450 Hz, «molto sfocato»). */
export const STAGES_BLUR_AMOUNT = 165;

/**
 * Gli effetti con cui suona un brano. Con l'ovattato a fasi il filtro passa-basso lo guidano le fasi: lo sfocato del brano
 * non vale e lo sostituisce quello delle fasi, i camuffamenti non valgono, mentre gli altri effetti restano.
 */
export function effectsForListening(effects: EffectSetting[], stages: unknown): EffectSetting[] {
  if (!stages) return effects;
  // I camuffamenti rielaborano il file prima di suonarlo: non si possono combinare con il filtro che le fasi muovono nel tempo.
  return [{ type: "blur", amount: STAGES_BLUR_AMOUNT }, ...effects.filter((e) => e.type !== "blur" && !isBufferEffect(e.type))];
}
