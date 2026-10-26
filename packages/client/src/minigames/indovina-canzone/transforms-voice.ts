import { bandpass, monoOf, rmsOf, runBiquad, seeded } from "./dsp";

// ---- Vocoder a bande e canticchiato: rifanno il suono tenendo solo la «sagoma» o solo la melodia ----

/** Bande del vocoder: meno bande = più camuffato. 25% → 16 (si capisce), 100% → 4, 200% → 2, 300% → 1 (resta solo il ritmo). */
export const vocoderBands = (k: number) => Math.min(16, Math.max(1, Math.round(4 / Math.max(k, 0.25))));

/** Estremi dell'intervallo coperto dalle bande del vocoder (Hz): sotto è rimbombo, sopra sono sibilanti. */
const VOCODER_LOW_HZ = 120;
const VOCODER_HIGH_HZ = 6_000;
/** Frequenza di taglio (Hz) dell'inviluppo di ogni banda: più alta segue meglio le sillabe, più bassa è più morbido. */
const VOCODER_ENVELOPE_HZ = 40;

/**
 * Rifà il suono con rumore modellato sull'inviluppo di poche bande di frequenza: con 1–2 bande le parole spariscono,
 * restano ritmo, dinamica e la «sagoma» del suono; con molte bande si capiscono. Il rumore è con seme (stessa clip a
 * parità di seme). L'uscita è la stessa su tutti i canali e ha lo stesso volume dell'originale.
 */
export function vocoder(channels: Float32Array[], sampleRate: number, k: number, seed: number): Float32Array[] {
  const length = channels[0]?.length ?? 0;
  if (length === 0) return channels.map((c) => Float32Array.from(c));
  const mono = monoOf(channels);
  const bands = vocoderBands(k);
  const low = VOCODER_LOW_HZ;
  const high = Math.min(VOCODER_HIGH_HZ, sampleRate * 0.4);
  const edges = Array.from({ length: bands + 1 }, (_, i) => low * (high / low) ** (i / bands));
  const random = seeded(seed);
  const noise = Float32Array.from({ length }, () => random() * 2 - 1);
  const alpha = 1 - Math.exp((-2 * Math.PI * VOCODER_ENVELOPE_HZ) / sampleRate);
  const out = new Float32Array(length);

  for (let band = 0; band < bands; band++) {
    const center = Math.sqrt(edges[band]! * edges[band + 1]!);
    const filter = bandpass(center, Math.max(0.5, center / (edges[band + 1]! - edges[band]!)), sampleRate);
    const signal = runBiquad(filter, runBiquad(filter, mono));
    const carrier = runBiquad(filter, runBiquad(filter, noise));
    // portante a volume costante: il volume di ogni banda lo decide solo l'inviluppo del suono vero
    const carrierRms = rmsOf(carrier) || 1;
    let envelope = 0;
    for (let i = 0; i < length; i++) {
      envelope += alpha * (Math.abs(signal[i]!) - envelope);
      // il valore medio di una sinusoide raddrizzata è 0,64 del valore efficace
      out[i]! += (carrier[i]! / carrierRms) * (envelope / 0.64);
    }
  }

  const inRms = rmsOf(mono);
  const outRms = rmsOf(out);
  const gain = outRms > 1e-9 ? Math.min(20, inRms / outRms) : 0;
  for (let i = 0; i < length; i++) out[i]! *= gain;
  return channels.map(() => Float32Array.from(out));
}

/** Quanta voce vera si sente sotto il canticchiato: 0 = originale, da 100% in su solo il canticchiato. */
export const humWet = (k: number) => Math.min(1, Math.max(0, k));

/** Frequenze che il canticchiato cerca (Hz): da un basso profondo a un soprano. */
const HUM_MIN_HZ = 60;
const HUM_MAX_HZ = 900;
/** Soglia di YIN: sotto questa «aperiodicità» il suono è una nota (voce che canta o parla), sopra è rumore o silenzio. */
const YIN_THRESHOLD = 0.15;
/** Sotto questa frazione del volume più alto un tratto è silenzio, anche se sembra periodico. */
const HUM_SILENCE_RATIO = 0.04;

interface PitchTrack {
  /** Campioni (a frequenza piena) tra un'analisi e la successiva. */
  hop: number;
  /** Campione, a frequenza piena, a cui si riferisce la prima analisi. */
  first: number;
  /** Intonazione in Hz (0 = senza nota). */
  f0: Float32Array;
  /** Valore efficace di ogni tratto. */
  amp: Float32Array;
}

/** Intonazione e volume nel tempo (algoritmo YIN su una versione a bassa frequenza del suono, per essere veloce). */
export function trackPitch(mono: Float32Array, sampleRate: number): PitchTrack {
  const decimate = Math.max(1, Math.round(sampleRate / 11_025));
  const rate = sampleRate / decimate;
  const n = Math.floor(mono.length / decimate);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < decimate; j++) sum += mono[i * decimate + j]!;
    y[i] = sum / decimate;
  }
  const window = Math.round(0.03 * rate);
  const hop = Math.max(1, Math.round(0.02 * rate));
  const maxLag = Math.floor(rate / HUM_MIN_HZ);
  const minLag = Math.max(2, Math.floor(rate / HUM_MAX_HZ));
  const frames = Math.max(0, Math.floor((n - window - maxLag) / hop) + 1);
  const f0 = new Float32Array(frames);
  const amp = new Float32Array(frames);
  const cmnd = new Float32Array(maxLag + 1);

  for (let f = 0; f < frames; f++) {
    const start = f * hop;
    let energy = 0;
    for (let j = 0; j < window; j++) energy += y[start + j]! * y[start + j]!;
    amp[f] = Math.sqrt(energy / window);
    // differenza di YIN, poi normalizzata con la media cumulativa
    let running = 0;
    cmnd[0] = 1;
    for (let lag = 1; lag <= maxLag; lag++) {
      let diff = 0;
      for (let j = 0; j < window; j++) {
        const d = y[start + j]! - y[start + j + lag]!;
        diff += d * d;
      }
      running += diff;
      cmnd[lag] = running > 0 ? (diff * lag) / running : 1;
    }
    let lag = minLag;
    while (lag <= maxLag && cmnd[lag]! >= YIN_THRESHOLD) lag++;
    if (lag > maxLag) continue; // nessuna nota
    while (lag + 1 <= maxLag && cmnd[lag + 1]! < cmnd[lag]!) lag++;
    // interpolazione parabolica attorno al minimo, per non scalare a gradini
    const a = cmnd[lag - 1]!;
    const b = cmnd[lag]!;
    const c = cmnd[Math.min(maxLag, lag + 1)]!;
    const denom = a - 2 * b + c;
    const shift = Math.abs(denom) > 1e-9 ? Math.max(-1, Math.min(1, (a - c) / (2 * denom))) : 0;
    f0[f] = rate / (lag + shift);
  }

  // filtro mediano a 3: toglie i salti isolati di ottava
  const smooth = Float32Array.from(f0);
  for (let f = 1; f < frames - 1; f++) {
    if (f0[f] === 0) continue;
    const trio = [f0[f - 1]!, f0[f]!, f0[f + 1]!].sort((p, q) => p - q);
    if (trio[0]! > 0) smooth[f] = trio[1]!;
  }
  return { hop: hop * decimate, first: Math.round((window / 2) * decimate), f0: smooth, amp };
}

/**
 * Sostituisce il suono con un «mmm» (una sinusoide) che segue solo l'intonazione e il volume dell'originale: restano
 * melodia e ritmo esatti, nient'altro. Adatto a una voce sola, non a una canzone piena. Sotto il 100% si mescola alla
 * voce vera. Non usa il caso.
 */
export function hum(channels: Float32Array[], sampleRate: number, k: number): Float32Array[] {
  const length = channels[0]?.length ?? 0;
  const wet = humWet(k);
  if (length === 0 || wet === 0) return channels.map((c) => Float32Array.from(c));
  const mono = monoOf(channels);
  const track = trackPitch(mono, sampleRate);
  const frames = track.f0.length;
  const loudest = track.amp.reduce((m, v) => Math.max(m, v), 0);
  const voiced = Float32Array.from(track.f0, (f, i) => (f > 0 && track.amp[i]! > loudest * HUM_SILENCE_RATIO ? f : 0));
  const out = new Float32Array(length);
  let phase = 0;
  let lastFrequency = 0;
  for (let i = 0; i < length; i++) {
    if (frames === 0) break;
    // posizione tra due analisi, e valori interpolati; dove manca la nota il volume scende a zero in un'analisi
    const at = Math.min(frames - 1, Math.max(0, (i - track.first) / track.hop));
    const f = Math.floor(at);
    const g = Math.min(frames - 1, f + 1);
    const t = at - f;
    const fa = voiced[f]!;
    const fb = voiced[g]!;
    const volume = ((fa > 0 ? track.amp[f]! : 0) * (1 - t) + (fb > 0 ? track.amp[g]! : 0) * t) * Math.SQRT2;
    const frequency = fa > 0 && fb > 0 ? fa * (1 - t) + fb * t : fa > 0 ? fa : fb > 0 ? fb : lastFrequency;
    if (frequency > 0) lastFrequency = frequency;
    phase += (2 * Math.PI * (frequency || lastFrequency || 0)) / sampleRate;
    out[i] = Math.sin(phase) * volume;
  }
  return channels.map((c) => Float32Array.from(c, (v, i) => v * (1 - wet) + out[i]! * wet));
}
