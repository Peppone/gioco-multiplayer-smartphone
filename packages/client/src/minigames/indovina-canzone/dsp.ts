// ---- Strumenti di base per le trasformazioni dei campioni (puri, senza contesto audio) ----

/** Generatore pseudocasuale con seme (mulberry32): stesso seme, stessa sequenza. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Coefficienti di un filtro a 2 poli. */
export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** Passa-banda a 2 poli centrato su `centerHz`, guadagno 1 al centro (dal «cookbook» di Robert Bristow-Johnson). */
export function bandpass(centerHz: number, q: number, sampleRate: number): Biquad {
  const w = (2 * Math.PI * Math.min(centerHz, sampleRate * 0.45)) / sampleRate;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  return { b0: alpha / a0, b1: 0, b2: -alpha / a0, a1: (-2 * Math.cos(w)) / a0, a2: (1 - alpha) / a0 };
}

/** Fa passare i campioni da un filtro a 2 poli (forma diretta I); restituisce un nuovo array. */
export function runBiquad({ b0, b1, b2, a1, a2 }: Biquad, input: Float32Array): Float32Array {
  const out = new Float32Array(input.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i++) {
    const x = input[i]!;
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
  return out;
}

/** I canali sommati in uno solo (media). */
export function monoOf(channels: readonly Float32Array[]): Float32Array {
  const length = channels[0]?.length ?? 0;
  const mono = new Float32Array(length);
  for (const c of channels) for (let i = 0; i < length; i++) mono[i]! += c[i]! / channels.length;
  return mono;
}

/** Valore efficace (RMS) dei campioni. */
export function rmsOf(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  return Math.sqrt(sum / samples.length);
}
