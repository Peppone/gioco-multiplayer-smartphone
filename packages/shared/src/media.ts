/** Estensioni audio accettate e relativo tipo MIME (quelli che i browser riproducono senza plugin). */
export const AUDIO_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  wav: "audio/wav",
  webm: "audio/webm",
  flac: "audio/flac",
};

/** Nome di un file della mediateca: id casuale + estensione (non rivela il titolo del brano). */
export const MEDIA_FILE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp3|m4a|aac|ogg|wav|webm|flac)$/;

/** Dimensione massima di un brano caricato (byte). */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

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
export const AUDIO_EFFECTS = ["none", "blur", "heavy_blur", "no_voice"] as const;
export type AudioEffect = (typeof AUDIO_EFFECTS)[number];
