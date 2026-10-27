// ---- Forma d'onda per trascinare le zone degli effetti ----
//
// Funzioni pure: le ampiezze da disegnare e lo spostamento di una zona (inizio, fine o tutta) dopo un trascinamento.

/** Di quanto si arrotondano gli estremi di una zona (s). */
export const ZONE_STEP_SECONDS = 0.1;
/** Lunghezza minima di una zona (s). */
export const ZONE_MIN_SECONDS = 0.1;

/** Le ampiezze massime (0–1) di `buckets` tratti uguali del suono, su tutti i canali, normalizzate sul picco più alto (un suono muto resta a 0). */
export function waveformPeaks(channels: readonly Float32Array[], buckets: number): Float32Array {
  const length = channels[0]?.length ?? 0;
  const out = new Float32Array(Math.max(0, buckets));
  if (length === 0 || buckets <= 0) return out;
  let top = 0;
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor((b * length) / buckets);
    const to = Math.max(from + 1, Math.floor(((b + 1) * length) / buckets));
    let peak = 0;
    for (const c of channels) for (let i = from; i < Math.min(to, c.length); i++) peak = Math.max(peak, Math.abs(c[i]!));
    out[b] = peak;
    top = Math.max(top, peak);
  }
  if (top > 0) for (let b = 0; b < buckets; b++) out[b]! /= top;
  return out;
}

const snap = (seconds: number, step: number) => Number((Math.round(seconds / step) * step).toFixed(3));
const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));

export type ZoneDrag = "start" | "end" | "move";

/**
 * La zona dopo aver trascinato di `deltaSeconds` (rispetto a com'era alla presa): l'inizio e la fine non si scavalcano e
 * restano dentro il brano; spostarla tutta ne conserva la lunghezza. Gli estremi si arrotondano a `step`.
 */
export function dragZone(kind: ZoneDrag, zone: { from: number; to: number }, deltaSeconds: number, duration: number, step = ZONE_STEP_SECONDS, minLength = ZONE_MIN_SECONDS): { from: number; to: number } {
  const end = Math.max(duration, minLength);
  if (kind === "start") return { from: clamp(snap(zone.from + deltaSeconds, step), 0, Math.max(0, zone.to - minLength)), to: zone.to };
  if (kind === "end") return { from: zone.from, to: clamp(snap(zone.to + deltaSeconds, step), Math.min(end, zone.from + minLength), end) };
  const length = zone.to - zone.from;
  const from = clamp(snap(zone.from + deltaSeconds, step), 0, Math.max(0, end - length));
  return { from, to: Number((from + length).toFixed(3)) };
}

/** Il secondo corrispondente a una posizione orizzontale (px) dentro una forma d'onda larga `widthPx`. */
export const secondsAtX = (x: number, widthPx: number, duration: number) => (widthPx > 0 ? clamp(x / widthPx, 0, 1) * duration : 0);

/** La zona che si propone per un effetto che non ne ha: al centro del brano, lunga un quinto (tra 1 e 5 s), da spostare e ridimensionare. */
export function defaultZone(duration: number): { from: number; to: number } {
  const length = snap(clamp(duration / 5, 1, 5), ZONE_STEP_SECONDS);
  const from = clamp(snap((duration - length) / 2, ZONE_STEP_SECONDS), 0, Math.max(0, duration - ZONE_MIN_SECONDS));
  return { from, to: Number(Math.min(duration, from + length).toFixed(3)) };
}

/**
 * Una zona libera per un altro effetto uguale: la proposta al centro se non copre le altre `taken`, altrimenti il primo
 * posto libero (a passi di `step`), con la stessa lunghezza. `null` se il brano non ha più spazio.
 */
export function nextFreeZone(duration: number, taken: readonly { from: number; to: number }[], step = ZONE_STEP_SECONDS): { from: number; to: number } | null {
  const wanted = defaultZone(duration);
  const length = Number((wanted.to - wanted.from).toFixed(3));
  const free = (from: number) => taken.every((z) => from + length <= z.from || from >= z.to);
  if (free(wanted.from)) return wanted;
  for (let from = 0; from + length <= duration + 1e-9; from = Number((from + step).toFixed(3))) {
    if (free(from)) return { from, to: Number((from + length).toFixed(3)) };
  }
  return null;
}
