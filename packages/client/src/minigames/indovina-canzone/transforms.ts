import type { BufferEffect } from "@gioco/shared";
import { seeded } from "./dsp";
import { hum, vocoder } from "./transforms-voice";

// ---- Trasformazioni sul buffer (camuffamento) ----
//
// Funzioni pure sui campioni: a parità di ingresso e quantità danno sempre la stessa uscita, così si provano senza un
// contesto audio. Rompono le parole ma lasciano gli indizi giocabili (voce, ritmo, melodia); vedi
// docs/PIANO-CAMUFFAMENTO-AUDIO.md. Come gli altri effetti, la quantità `k` è in unità: 1 = 100%, fino a 3 (300%).

/** Le trasformazioni sono i tipi di effetto «sul buffer» dell'elenco degli effetti del brano (stessi nomi). */
export type Disguise = BufferEffect;

/** Dissolvenza (ms) ai bordi di ogni pezzo capovolto: senza, il salto tra un pezzo e il successivo scatta. */
export const REVERSE_FADE_MS = 4;
/** Il centro attorno a cui si ribaltano le frequenze: f diventa 2·PIVOT − f (un tono a 1 kHz esce a 3 kHz). */
export const FLIP_PIVOT_HZ = 2_000;
/** Filtro che ripulisce prima e dopo il ribaltamento: sopra il doppio del centro il ribaltamento tornerebbe indietro sulle basse. */
export const FLIP_CUTOFF_HZ = 3_400;

/** Lunghezza (ms) dei pezzi suonati al contrario con la quantità `k`: sotto ~60 ms si capisce quasi tutto, sopra ~150 le parole diventano un borbottio. */
export const reverseWindowMs = (k: number) => Math.max(0, k) * 100;

/** Quanto del suono ribaltato si sente: 0 = originale, da 1 (100%) in su solo quello ribaltato. */
export const flipWet = (k: number) => Math.min(1, Math.max(0, k));

/** Suona al contrario ogni pezzo lungo `reverseWindowMs(k)`, restando al suo posto; durata invariata. Con quantità nulla è l'originale. */
export function reverseChunks(samples: Float32Array, sampleRate: number, k: number): Float32Array {
  const size = Math.round((reverseWindowMs(k) / 1000) * sampleRate);
  const out = Float32Array.from(samples);
  if (size < 2) return out;
  const fade = Math.min(Math.round((REVERSE_FADE_MS / 1000) * sampleRate), size >> 1);
  for (let start = 0; start < out.length; start += size) {
    const end = Math.min(start + size, out.length);
    out.subarray(start, end).reverse();
    // dissolvenza ai due bordi del pezzo (coseno rialzato)
    const n = Math.min(fade, (end - start) >> 1);
    for (let i = 0; i < n; i++) {
      const g = 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
      out[start + i]! *= g;
      out[end - 1 - i]! *= g;
    }
  }
  return out;
}

/** Fattori di qualità dei quattro filtri a 2 poli che, in fila, formano un Butterworth di ordine 8 (risposta piatta fino al taglio). */
const BUTTERWORTH_8_Q = [0.5098, 0.6013, 0.9, 2.5629];

/** Coefficienti di un passa-basso a 2 poli, dal «cookbook» di Robert Bristow-Johnson. */
function lowpassCoefficients(cutoffHz: number, sampleRate: number, q: number) {
  const w = (2 * Math.PI * Math.min(cutoffHz, sampleRate * 0.45)) / sampleRate;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  const a0 = 1 + alpha;
  return { b0: (1 - cos) / 2 / a0, b1: (1 - cos) / a0, b2: (1 - cos) / 2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
}

/** Passa-basso di ordine 8: piatto fino al taglio, oltre abbatte di circa 19 dB già a un quarto di frequenza sopra. */
function lowpass(samples: Float32Array, cutoffHz: number, sampleRate: number): Float32Array {
  let data = samples;
  for (const q of BUTTERWORTH_8_Q) {
    const { b0, b1, b2, a1, a2 } = lowpassCoefficients(cutoffHz, sampleRate, q);
    const out = new Float32Array(data.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < data.length; i++) {
      const x = data[i]!;
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      out[i] = y;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
    }
    data = out;
  }
  return data;
}

/**
 * Ribalta le frequenze attorno a `FLIP_PIVOT_HZ`: gli acuti diventano gravi e viceversa, il parlato diventa una lingua
 * aliena ma ritmo e cadenza restano. Si moltiplica per un'onda a 2·pivot (modulazione ad anello), cosa che porta f a
 * 2·pivot − f, dopo aver tolto ciò che sta sopra (che altrimenti si sovrapporrebbe). Con quantità sotto 100% si mescola
 * al suono pulito.
 */
export function flipSpectrum(samples: Float32Array, sampleRate: number, k: number): Float32Array {
  const wet = flipWet(k);
  if (wet === 0) return Float32Array.from(samples);
  const carrier = (2 * Math.PI * 2 * FLIP_PIVOT_HZ) / sampleRate;
  const band = lowpass(samples, FLIP_CUTOFF_HZ, sampleRate);
  for (let i = 0; i < band.length; i++) band[i]! *= Math.cos(carrier * i);
  const flipped = lowpass(band, FLIP_CUTOFF_HZ, sampleRate);
  const out = new Float32Array(samples.length);
  // la moltiplicazione dimezza l'ampiezza del lato utile: ×2 la riporta com'era
  for (let i = 0; i < out.length; i++) out[i] = samples[i]! * (1 - wet) + flipped[i]! * 2 * wet;
  return out;
}

/** Lunghezza (ms) dei pezzi mescolati: 150 ms fino a 100%, poi cresce fino a 300 ms a 300% (pezzi più lunghi = meno sillabe di cui riconoscere l'ordine). */
export const shuffleChunkMs = (k: number) => 150 + 75 * (Math.min(3, Math.max(1, k)) - 1);

/** Quanti dei pezzi cambiano posto: tutti a 100% o più, la metà a 50%, nessuno a 0. */
export const shuffleShare = (k: number) => Math.min(1, Math.max(0, k));

/** Quanto lontano dal punto nominale (in lunghezze di pezzo) si cerca il momento più silenzioso per tagliare. */
const SHUFFLE_CUT_REACH = 0.3;
/** Dissolvenza (ms) ai bordi di ogni pezzo mescolato. */
const SHUFFLE_FADE_MS = 3;
/** Passo (ms) con cui si misura l'energia per scegliere dove tagliare. */
const SHUFFLE_FRAME_MS = 5;

/** Dove tagliare: ogni `size` campioni circa, ma nel punto più silenzioso lì vicino (a parità, il più vicino al punto nominale), così si spezza tra una sillaba e l'altra e non dentro. */
function cutPoints(channels: Float32Array[], size: number, frame: number): number[] {
  const length = channels[0]!.length;
  const energy = (from: number) => {
    let e = 0;
    for (const c of channels) for (let i = from; i < Math.min(from + frame, length); i++) e += c[i]! * c[i]!;
    return e;
  };
  const cuts = [0];
  const reach = Math.floor(size * SHUFFLE_CUT_REACH);
  for (let nominal = size; nominal < length - size / 2; nominal += size) {
    let best = nominal;
    let bestEnergy = Infinity;
    for (let at = Math.max(cuts[cuts.length - 1]! + (size >> 1), nominal - reach); at <= Math.min(length - 1, nominal + reach); at += frame) {
      const e = energy(at);
      if (e < bestEnergy - 1e-12 || (Math.abs(e - bestEnergy) <= 1e-12 && Math.abs(at - nominal) < Math.abs(best - nominal))) {
        best = at;
        bestEnergy = e;
      }
    }
    cuts.push(best);
  }
  return cuts;
}

/**
 * Taglia il suono in pezzi di 150–300 ms (nei punti più silenziosi) e ne scambia di posto una parte, a caso ma con un
 * seme: stessa clip a parità di seme. Nessun pezzo resta dov'era (uno scambio a ciclo unico, algoritmo di Sattolo), quindi
 * cambiano l'ordine delle sillabe e il ritmo, mentre voce e timbro restano. La durata complessiva non cambia. Tutti i
 * canali seguono gli stessi tagli e lo stesso ordine, altrimenti la voce uscirebbe sfasata tra destra e sinistra.
 */
export function shuffleSyllables(channels: Float32Array[], sampleRate: number, k: number, seed: number): Float32Array[] {
  const length = channels[0]?.length ?? 0;
  const size = Math.round((shuffleChunkMs(k) / 1000) * sampleRate);
  const share = shuffleShare(k);
  if (share === 0 || length < size * 2) return channels.map((c) => Float32Array.from(c));
  const frame = Math.max(1, Math.round((SHUFFLE_FRAME_MS / 1000) * sampleRate));
  const cuts = cutPoints(channels, size, frame);
  const count = cuts.length;
  const random = seeded(seed);
  // quali pezzi cambiano posto (una quota, scelta a caso) e come: un solo ciclo, nessun pezzo resta al suo posto
  const pool = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const moving = pool.slice(0, Math.round(share * count)).sort((a, b) => a - b);
  const order = Array.from({ length: count }, (_, i) => i);
  const cycle = [...moving];
  for (let i = cycle.length - 1; i > 0; i--) {
    const j = Math.floor(random() * i);
    [cycle[i], cycle[j]] = [cycle[j]!, cycle[i]!];
  }
  moving.forEach((slot, i) => (order[slot] = cycle[i]!));

  const fade = Math.min(Math.round((SHUFFLE_FADE_MS / 1000) * sampleRate), size >> 2);
  return channels.map((c) => {
    const out = new Float32Array(length);
    let at = 0;
    for (const id of order) {
      const from = cuts[id]!;
      const to = id + 1 < count ? cuts[id + 1]! : length;
      for (let i = from; i < to; i++) {
        const edge = Math.min(i - from, to - 1 - i);
        out[at++] = edge < fade ? c[i]! * (0.5 - 0.5 * Math.cos((Math.PI * edge) / fade)) : c[i]!;
      }
    }
    return out;
  });
}

/** Se qualche campione supera ±1 abbassa tutti i canali nella stessa misura (l'equilibrio tra i canali non cambia). */
export function limitChannels(channels: Float32Array[]): Float32Array[] {
  let peak = 0;
  for (const c of channels) for (let i = 0; i < c.length; i++) peak = Math.max(peak, Math.abs(c[i]!));
  if (peak <= 1) return channels;
  return channels.map((c) => c.map((v) => v / peak));
}

// ---- Balbuziente ----

/** Lunghezza (ms) dei frammenti del balbuziente. */
export const STUTTER_CHUNK_MS = 140;
/** Probabilità che un frammento si ripeta (1–2 volte in più): 35% a 100%, fino a 90%. */
export const stutterRepeat = (k: number) => Math.min(0.9, 0.35 * Math.max(0, k));
/** Probabilità che un frammento si salti: 15% a 100%, fino a 45%. */
export const stutterSkip = (k: number) => Math.min(0.45, 0.15 * Math.max(0, k));

/**
 * Ripete a caso frammenti brevi (tagliati nei punti più silenziosi) e ne salta altri, come un disco che si incanta: voce e
 * timbro restano, il filo delle parole no. Con un seme (stessa clip a parità di seme). La durata non cambia: ciò che
 * avanza in fondo si perde e, se manca, si chiude col silenzio.
 */
export function stutter(channels: Float32Array[], sampleRate: number, k: number, seed: number): Float32Array[] {
  const length = channels[0]?.length ?? 0;
  const size = Math.round((STUTTER_CHUNK_MS / 1000) * sampleRate);
  if (k <= 0 || length < size * 2) return channels.map((c) => Float32Array.from(c));
  const frame = Math.max(1, Math.round((SHUFFLE_FRAME_MS / 1000) * sampleRate));
  const cuts = cutPoints(channels, size, frame);
  const random = seeded(seed);
  const repeat = stutterRepeat(k);
  const skip = stutterSkip(k);
  const order: number[] = [];
  let total = 0;
  for (let id = 0; id < cuts.length && total < length; id++) {
    const span = (id + 1 < cuts.length ? cuts[id + 1]! : length) - cuts[id]!;
    if (random() < skip) continue;
    const times = 1 + (random() < repeat ? 1 + Math.floor(random() * 2) : 0);
    for (let t = 0; t < times && total < length; t++) {
      order.push(id);
      total += span;
    }
  }
  const fade = Math.min(Math.round((SHUFFLE_FADE_MS / 1000) * sampleRate), size >> 2);
  return channels.map((c) => {
    const out = new Float32Array(length);
    let at = 0;
    for (const id of order) {
      const from = cuts[id]!;
      const to = id + 1 < cuts.length ? cuts[id + 1]! : length;
      for (let i = from; i < to && at < length; i++) {
        const edge = Math.min(i - from, to - 1 - i);
        out[at++] = edge < fade ? c[i]! * (0.5 - 0.5 * Math.cos((Math.PI * edge) / fade)) : c[i]!;
      }
    }
    return out;
  });
}

// ---- Bip e silenzio (censura di una zona) ----

/** Tono del bip (Hz) e suo volume (ampiezza): quello della censura in TV. */
export const BEEP_HZ = 1_000;
export const BEEP_LEVEL = 0.35;
/** Quanto del suono è coperto: da 0 (originale) a 100% e oltre (tutto coperto). */
export const coverAmount = (k: number) => Math.min(1, Math.max(0, k));

/** Copre il suono con un tono a 1 kHz. Si usa su una zona. */
export function beep(samples: Float32Array, sampleRate: number, k: number): Float32Array {
  const cover = coverAmount(k);
  return Float32Array.from(samples, (v, i) => v * (1 - cover) + Math.sin((2 * Math.PI * BEEP_HZ * i) / sampleRate) * BEEP_LEVEL * cover);
}

/** Toglie il suono (silenzio). Si usa su una zona. */
export function silence(samples: Float32Array, _sampleRate: number, k: number): Float32Array {
  const cover = coverAmount(k);
  return Float32Array.from(samples, (v) => v * (1 - cover));
}

// ---- Zone: l'effetto vale solo da un secondo a un secondo ----

/** Dissolvenza (ms) ai bordi della zona, perché l'effetto non entri e non esca di scatto. */
export const ZONE_FADE_MS = 10;

/** La zona in campioni, dentro `length` (tutto il suono se non c'è); `null` se è vuota o fuori. */
export function zoneRange(zone: { from: number; to: number } | null, sampleRate: number, length: number): [number, number] | null {
  if (!zone) return [0, length];
  const from = Math.min(length, Math.max(0, Math.round(zone.from * sampleRate)));
  const to = Math.min(length, Math.max(0, Math.round(zone.to * sampleRate)));
  return to > from ? [from, to] : null;
}

/** Rimette `processed` (la parte elaborata, lunga come la zona) al suo posto in `original`, con dissolvenza ai bordi. Fuori dalla zona i campioni non cambiano. */
export function pasteZone(original: Float32Array[], processed: Float32Array[], start: number, sampleRate: number): Float32Array[] {
  return original.map((channel, c) => {
    const out = Float32Array.from(channel);
    const part = processed[c] ?? processed[0]!;
    const n = part.length;
    const fade = Math.max(1, Math.min(Math.round((ZONE_FADE_MS / 1000) * sampleRate), n >> 1));
    for (let j = 0; j < n; j++) {
      const w = Math.min(1, (j + 1) / fade, (n - j) / fade);
      out[start + j] = channel[start + j]! * (1 - w) + part[j]! * w;
    }
    return out;
  });
}

/** Applica una funzione sui soli campioni della zona (tutti se non c'è) e li rimette al loro posto. */
export function inZone(
  channels: Float32Array[],
  sampleRate: number,
  zone: { from: number; to: number } | null,
  run: (part: Float32Array[]) => Float32Array[],
): Float32Array[] {
  const range = zoneRange(zone, sampleRate, channels[0]?.length ?? 0);
  if (!range) return channels;
  if (!zone) return run(channels);
  const [start, end] = range;
  return pasteZone(channels, run(channels.map((c) => c.slice(start, end))), start, sampleRate);
}

/** Applica la trasformazione a tutti i canali; il risultato non supera mai ±1. `seed` conta solo per le trasformazioni che usano il caso. */
export function disguiseChannels(kind: Disguise, channels: Float32Array[], sampleRate: number, k: number, seed = 1): Float32Array[] {
  const each = (run: (samples: Float32Array, rate: number, amount: number) => Float32Array) => channels.map((c) => run(c, sampleRate, k));
  switch (kind) {
    case "reverse_chunks":
      return limitChannels(each(reverseChunks));
    case "flip_spectrum":
      return limitChannels(each(flipSpectrum));
    case "shuffle_syllables":
      return limitChannels(shuffleSyllables(channels, sampleRate, k, seed));
    case "stutter":
      return limitChannels(stutter(channels, sampleRate, k, seed));
    case "vocoder":
      return limitChannels(vocoder(channels, sampleRate, k, seed));
    case "hum":
      return limitChannels(hum(channels, sampleRate, k));
    case "beep":
      return limitChannels(each(beep));
    case "silence":
      return limitChannels(each(silence));
  }
}
