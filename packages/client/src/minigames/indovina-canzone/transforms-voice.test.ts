import { describe, expect, it } from "vitest";
import { humWet, hum, trackPitch, vocoder, vocoderBands } from "./transforms-voice";

const RATE = 16_000;

const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((s, x) => s + x * x, 0) / Math.max(1, samples.length));

/** Frequenza stimata dagli attraversamenti dello zero. */
function frequency(samples: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) if (samples[i - 1]! < 0 !== samples[i]! < 0) crossings++;
  return (crossings / 2) * (RATE / samples.length);
}

/** Livello (ampiezza) di una frequenza, con la trasformata di Goertzel. */
function level(samples: Float32Array, hz: number): number {
  const w = (2 * Math.PI * hz) / RATE;
  const c = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (const x of samples) {
    const s = x + c * s1 - s2;
    s2 = s1;
    s1 = s;
  }
  return (2 * Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2)) / samples.length;
}

/** Dente di sega a `hz`, ricco di armoniche, come una voce. */
const saw = (hz: number, seconds: number, amplitude = 0.4) =>
  Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => amplitude * (2 * ((i * hz) / RATE - Math.floor((i * hz) / RATE + 0.5))));

/** Un suono in due parti: `loud` secondi di dente di sega, poi altrettanto silenzio. */
const burstThenSilence = (loud: number) => {
  const sound = saw(200, loud);
  return Float32Array.from({ length: sound.length * 2 }, (_, i) => (i < sound.length ? sound[i]! : 0));
};

describe("vocoder a bande", () => {
  it("meno bande quanto più alta è la quantità: 25% → 16, 100% → 4, 200% → 2, 300% → 1", () => {
    expect(vocoderBands(0.25)).toBe(16);
    expect(vocoderBands(1)).toBe(4);
    expect(vocoderBands(2)).toBe(2);
    expect(vocoderBands(3)).toBe(1);
    expect(vocoderBands(0)).toBe(16);
    expect(vocoderBands(1)).toBeLessThanOrEqual(vocoderBands(0.5));
  });

  it("conserva la durata, il volume complessivo e il ritmo (il silenzio resta silenzio)", () => {
    const input = burstThenSilence(1);
    const [out] = vocoder([input], RATE, 1, 1);
    expect(out!.length).toBe(input.length);
    const half = input.length / 2;
    const loud = rms(out!.subarray(0, half));
    const quiet = rms(out!.subarray(half + RATE * 0.25));
    expect(loud).toBeGreaterThan(0.05);
    expect(quiet).toBeLessThan(loud * 0.1);
    expect(rms(out!) / rms(input)).toBeGreaterThan(0.8);
    expect(rms(out!) / rms(input)).toBeLessThan(1.25);
  });

  it("stesso seme, stessa uscita; semi diversi, uscite diverse; non tocca l'ingresso", () => {
    const input = saw(180, 0.5);
    const copy = Float32Array.from(input);
    const a = vocoder([input], RATE, 1, 7)[0]!;
    expect(vocoder([input], RATE, 1, 7)[0]).toEqual(a);
    expect(vocoder([input], RATE, 1, 8)[0]).not.toEqual(a);
    expect(input).toEqual(copy);
  });

  it("l'uscita è la stessa su tutti i canali e non cambia quanti sono", () => {
    const input = saw(150, 0.4);
    const out = vocoder([input, Float32Array.from(input, (v) => v * 0.5)], RATE, 2, 3);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual(out[0]);
  });

  it("un ingresso vuoto o silenzioso non produce rumore né valori non numerici", () => {
    expect(vocoder([new Float32Array(0)], RATE, 1, 1)[0]).toHaveLength(0);
    const out = vocoder([new Float32Array(RATE)], RATE, 1, 1)[0]!;
    expect(out.every((v) => Number.isFinite(v))).toBe(true);
    expect(rms(out)).toBeLessThan(1e-6);
  });
});

describe("canticchiato", () => {
  it("un dente di sega a 200 Hz diventa una sinusoide a 200 Hz, senza armoniche", () => {
    const input = saw(200, 1);
    const [out] = hum([input], RATE, 1);
    const middle = out!.subarray(RATE * 0.2, RATE * 0.8);
    expect(frequency(middle)).toBeGreaterThan(190);
    expect(frequency(middle)).toBeLessThan(210);
    expect(level(middle, 400)).toBeLessThan(level(middle, 200) * 0.1);
    expect(level(middle, 600)).toBeLessThan(level(middle, 200) * 0.1);
  });

  it("segue l'intonazione: una nota più acuta dà un «mmm» più acuto", () => {
    const low = hum([saw(150, 1)], RATE, 1)[0]!.subarray(RATE * 0.2, RATE * 0.8);
    const high = hum([saw(300, 1)], RATE, 1)[0]!.subarray(RATE * 0.2, RATE * 0.8);
    expect(frequency(high) / frequency(low)).toBeGreaterThan(1.8);
    expect(frequency(high) / frequency(low)).toBeLessThan(2.2);
  });

  it("segue il volume e tace dove l'originale tace", () => {
    const [out] = hum([burstThenSilence(1)], RATE, 1);
    const half = out!.length / 2;
    expect(rms(out!.subarray(RATE * 0.2, half - RATE * 0.2))).toBeGreaterThan(0.1);
    expect(rms(out!.subarray(half + RATE * 0.25))).toBeLessThan(0.02);
  });

  it("con quantità nulla è l'originale; a 50% mescola voce e canticchiato", () => {
    const input = saw(200, 0.6);
    expect(hum([input], RATE, 0)[0]).toEqual(input);
    expect(humWet(0.5)).toBe(0.5);
    expect(humWet(3)).toBe(1);
    const half = hum([input], RATE, 0.5)[0]!;
    const full = hum([input], RATE, 1)[0]!;
    expect(half).not.toEqual(input);
    expect(half).not.toEqual(full);
  });

  it("non usa il caso, conserva la durata e non tocca l'ingresso", () => {
    const input = saw(220, 0.6);
    const copy = Float32Array.from(input);
    const a = hum([input], RATE, 1)[0]!;
    expect(hum([input], RATE, 1)[0]).toEqual(a);
    expect(a.length).toBe(input.length);
    expect(input).toEqual(copy);
  });

  it("tollera un ingresso vuoto o troppo corto per l'analisi", () => {
    expect(hum([new Float32Array(0)], RATE, 1)[0]).toHaveLength(0);
    const short = hum([saw(200, 0.02)], RATE, 1)[0]!;
    expect(short.every((v) => Number.isFinite(v))).toBe(true);
  });
});

describe("analisi dell'intonazione", () => {
  it("trova la frequenza di un tono e nessuna nota nel silenzio", () => {
    const track = trackPitch(saw(200, 1), RATE);
    const voiced = [...track.f0].filter((f) => f > 0);
    expect(voiced.length).toBeGreaterThan(track.f0.length * 0.8);
    const mean = voiced.reduce((s, f) => s + f, 0) / voiced.length;
    expect(mean).toBeGreaterThan(190);
    expect(mean).toBeLessThan(210);
    expect([...trackPitch(new Float32Array(RATE), RATE).f0].every((f) => f === 0 || Number.isFinite(f))).toBe(true);
  });
});
