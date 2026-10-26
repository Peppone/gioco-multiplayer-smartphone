import { describe, expect, it } from "vitest";
import { disguiseChannels, flipSpectrum, flipWet, limitChannels, reverseChunks, reverseWindowMs, shuffleChunkMs, shuffleShare, shuffleSyllables } from "./transforms";

const RATE = 16_000;

const tone = (hz: number, seconds: number, amplitude = 0.5) =>
  Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / RATE));

/** Glissando da `from` a `to` Hz in `seconds`. */
const chirp = (from: number, to: number, seconds: number) => {
  const n = Math.round(seconds * RATE);
  return Float32Array.from({ length: n }, (_, i) => {
    const t = i / RATE;
    return 0.5 * Math.sin(2 * Math.PI * (from * t + ((to - from) / (2 * seconds)) * t * t));
  });
};

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

/** Frequenza stimata dagli attraversamenti dello zero. */
function frequency(samples: Float32Array): number {
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) if (samples[i - 1]! < 0 !== samples[i]! < 0) crossings++;
  return (crossings / 2) * (RATE / samples.length);
}

const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((s, x) => s + x * x, 0) / samples.length);
const peak = (samples: Float32Array) => samples.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

describe("al contrario a pezzi", () => {
  it("con quantità nulla è l'originale e non tocca l'ingresso", () => {
    const input = chirp(300, 900, 1);
    const copy = Float32Array.from(input);
    expect(reverseChunks(input, RATE, 0)).toEqual(copy);
    reverseChunks(input, RATE, 1.5);
    expect(input).toEqual(copy);
  });

  it("la finestra cresce con la quantità: 100% = 100 ms, 300% = 300 ms", () => {
    expect(reverseWindowMs(0)).toBe(0);
    expect(reverseWindowMs(1)).toBe(100);
    expect(reverseWindowMs(3)).toBe(300);
    expect(reverseWindowMs(0.5)).toBeLessThan(reverseWindowMs(0.8));
  });

  it("un glissando che sale, dentro ogni pezzo scende; fuori dai pezzi resta al suo posto", () => {
    // pezzi da 500 ms su 3 s: il glissando 300→1500 Hz sale di 200 Hz ogni pezzo
    const input = chirp(300, 1_500, 3);
    const out = reverseChunks(input, RATE, 5);
    const slice = (s: Float32Array, fromMs: number, toMs: number) => s.subarray((fromMs / 1000) * RATE, (toMs / 1000) * RATE);
    // secondo pezzo (500–1000 ms): all'inizio e alla fine
    const inStart = frequency(slice(input, 520, 620));
    const inEnd = frequency(slice(input, 880, 980));
    const outStart = frequency(slice(out, 520, 620));
    const outEnd = frequency(slice(out, 880, 980));
    expect(inEnd).toBeGreaterThan(inStart + 100);
    expect(outStart).toBeGreaterThan(outEnd + 100);
    // il pezzo successivo ricomincia alto: il tempo scorre ancora in avanti
    expect(frequency(slice(out, 1_020, 1_120))).toBeGreaterThan(frequency(slice(out, 880, 980)));
  });

  it("conserva la durata e l'inviluppo complessivo (la voce non sparisce né si sposta)", () => {
    const burst = new Float32Array(RATE * 2);
    burst.set(tone(500, 0.5), RATE * 0.5);
    const out = reverseChunks(burst, RATE, 1);
    expect(out.length).toBe(burst.length);
    // la raffica sta ancora tra 0,5 s e 1 s
    expect(rms(out.subarray(0, RATE * 0.4))).toBeLessThan(0.01);
    expect(rms(out.subarray(RATE * 1.1))).toBeLessThan(0.01);
    expect(rms(out.subarray(RATE * 0.5, RATE))).toBeGreaterThan(0.25);
  });

  it("una pura sinusoide mantiene la sua frequenza", () => {
    const out = reverseChunks(tone(700, 1), RATE, 1);
    expect(frequency(out.subarray(1_000, 15_000))).toBeGreaterThan(680);
    expect(frequency(out.subarray(1_000, 15_000))).toBeLessThan(720);
  });

  it("ripetuta dà lo stesso risultato e non supera ±1", () => {
    const input = chirp(200, 3_000, 1);
    expect(reverseChunks(input, RATE, 1.2)).toEqual(reverseChunks(input, RATE, 1.2));
    expect(peak(reverseChunks(input, RATE, 1.2))).toBeLessThanOrEqual(1);
  });

  it("tollera un ingresso più corto di un pezzo e uno vuoto", () => {
    expect(reverseChunks(new Float32Array(0), RATE, 1)).toHaveLength(0);
    expect(reverseChunks(tone(300, 0.02), RATE, 3)).toHaveLength(320);
  });
});

describe("spettro capovolto", () => {
  it("un tono a 1 kHz esce a 3 kHz, e uno a 3 kHz a 1 kHz", () => {
    const low = flipSpectrum(tone(1_000, 1), RATE, 1).subarray(4_000, 12_000);
    expect(level(low, 3_000)).toBeGreaterThan(0.4);
    expect(level(low, 1_000)).toBeLessThan(0.05);
    expect(level(low, 5_000)).toBeLessThan(0.05);
    const high = flipSpectrum(tone(3_000, 1), RATE, 1).subarray(4_000, 12_000);
    expect(level(high, 1_000)).toBeGreaterThan(0.3);
    expect(level(high, 3_000)).toBeLessThan(0.1);
  });

  it("con quantità nulla è l'originale; a 50% mescola i due suoni", () => {
    const input = tone(1_000, 0.5);
    expect(flipSpectrum(input, RATE, 0)).toEqual(input);
    const mixed = flipSpectrum(input, RATE, 0.5).subarray(2_000, 6_000);
    expect(level(mixed, 1_000)).toBeGreaterThan(0.15);
    expect(level(mixed, 3_000)).toBeGreaterThan(0.15);
  });

  it("la quantità sale a gradini sempre più ribaltati: il suono pulito scende, quello ribaltato sale", () => {
    expect(flipWet(0)).toBe(0);
    expect(flipWet(0.25)).toBeLessThan(flipWet(0.75));
    expect(flipWet(1)).toBe(1);
    expect(flipWet(3)).toBe(1);
    const at = (k: number) => flipSpectrum(tone(1_000, 0.5), RATE, k).subarray(2_000, 6_000);
    expect(level(at(0.25), 1_000)).toBeGreaterThan(level(at(0.75), 1_000));
    expect(level(at(0.25), 3_000)).toBeLessThan(level(at(0.75), 3_000));
  });

  it("conserva la durata, è ripetibile e conserva il ritmo (silenzi al loro posto)", () => {
    const gated = new Float32Array(RATE * 2);
    gated.set(tone(800, 0.5), RATE * 0.5);
    const out = flipSpectrum(gated, RATE, 1);
    expect(out.length).toBe(gated.length);
    expect(flipSpectrum(gated, RATE, 1)).toEqual(out);
    expect(rms(out.subarray(0, RATE * 0.4))).toBeLessThan(0.01);
    expect(rms(out.subarray(RATE * 1.2))).toBeLessThan(0.01);
    expect(rms(out.subarray(RATE * 0.6, RATE * 0.9))).toBeGreaterThan(0.2);
  });
});

/** Una serie di sillabe finte: ogni 150 ms un tono di 120 ms (frequenza propria) seguito da 30 ms di silenzio. */
const SYLLABLES = [300, 450, 600, 750, 900, 1_050, 1_200, 1_350];
const syllables = () => {
  const out = new Float32Array(SYLLABLES.length * 0.15 * RATE);
  SYLLABLES.forEach((hz, i) => out.set(tone(hz, 0.12), i * 0.15 * RATE));
  return out;
};
/** Quale sillaba suona in ogni posto (indice nella lista), dal tono più forte al centro del posto. */
const heard = (s: Float32Array) =>
  SYLLABLES.map((_, i) => {
    const slot = s.subarray((i * 0.15 + 0.03) * RATE, (i * 0.15 + 0.09) * RATE);
    const levels = SYLLABLES.map((hz) => level(slot, hz));
    return levels.indexOf(Math.max(...levels));
  });

describe("sillabe mescolate", () => {
  it("i pezzi crescono con la quantità e quelli che si spostano sono una quota", () => {
    expect(shuffleChunkMs(0.5)).toBe(150);
    expect(shuffleChunkMs(1)).toBe(150);
    expect(shuffleChunkMs(3)).toBe(300);
    expect(shuffleShare(0)).toBe(0);
    expect(shuffleShare(0.5)).toBe(0.5);
    expect(shuffleShare(3)).toBe(1);
  });

  it("con quantità nulla è l'originale e non tocca l'ingresso", () => {
    const input = syllables();
    const copy = Float32Array.from(input);
    expect(shuffleSyllables([input], RATE, 0, 1)[0]).toEqual(copy);
    shuffleSyllables([input], RATE, 1, 1);
    expect(input).toEqual(copy);
  });

  it("scambia le sillabe: le stesse di prima, in altro ordine, e nessuna al suo posto", () => {
    const out = shuffleSyllables([syllables()], RATE, 1, 7)[0]!;
    expect(heard(syllables())).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const order = heard(out);
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    order.forEach((id, place) => expect(id, `posto ${place}`).not.toBe(place));
  });

  it("a 50% si spostano metà dei pezzi e gli altri restano dove erano", () => {
    const order = heard(shuffleSyllables([syllables()], RATE, 0.5, 3)[0]!);
    expect(order.filter((id, place) => id === place)).toHaveLength(4);
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("stesso seme, stesso risultato; semi diversi, risultati diversi", () => {
    const a = shuffleSyllables([syllables()], RATE, 1, 1)[0]!;
    expect(shuffleSyllables([syllables()], RATE, 1, 1)[0]).toEqual(a);
    const orders = new Set([1, 2, 3, 4, 5, 6].map((seed) => heard(shuffleSyllables([syllables()], RATE, 1, seed)[0]!).join()));
    expect(orders.size).toBeGreaterThan(3);
  });

  it("conserva la durata e l'energia, e non lascia scatti ai tagli", () => {
    const input = syllables();
    const out = shuffleSyllables([input], RATE, 1, 5)[0]!;
    expect(out.length).toBe(input.length);
    expect(Math.abs(rms(out) - rms(input)) / rms(input)).toBeLessThan(0.03);
    expect(peak(out)).toBeLessThanOrEqual(peak(input) + 1e-6);
  });

  it("i canali seguono gli stessi tagli e lo stesso ordine", () => {
    const input = syllables();
    const [left, right] = shuffleSyllables([input, input.map((v) => v * 0.5)], RATE, 1, 9);
    expect(heard(left!)).toEqual(heard(right!));
    for (let i = 0; i < left!.length; i += 97) expect(right![i]!).toBeCloseTo(left![i]! * 0.5, 5);
  });

  it("un suono più corto di due pezzi resta com'è", () => {
    const short = tone(500, 0.2);
    expect(shuffleSyllables([short], RATE, 2, 1)[0]).toEqual(short);
  });
});

describe("limite e canali", () => {
  it("abbassa tutti i canali nella stessa misura se uno supera 1, altrimenti non li tocca", () => {
    const left = Float32Array.from([2, -1, 0.5]);
    const right = Float32Array.from([1, 0, -0.25]);
    const [l, r] = limitChannels([left, right]);
    expect(Array.from(l!)).toEqual([1, -0.5, 0.25]);
    expect(Array.from(r!)).toEqual([0.5, 0, -0.125]);
    const quiet = [Float32Array.from([0.3, -0.9])];
    expect(limitChannels(quiet)).toBe(quiet);
  });

  it("disguiseChannels applica la trasformazione scelta a ogni canale, senza superare ±1", () => {
    const channels = [chirp(200, 3_000, 0.5), tone(1_000, 0.5, 0.95)];
    for (const kind of ["reverse_chunks", "flip_spectrum", "shuffle_syllables"] as const) {
      const out = disguiseChannels(kind, channels, RATE, 1);
      expect(out).toHaveLength(2);
      for (const c of out) {
        expect(c.length).toBe(channels[0]!.length);
        expect(peak(c)).toBeLessThanOrEqual(1);
      }
    }
    expect(disguiseChannels("reverse_chunks", channels, RATE, 1)[1]).toEqual(reverseChunks(channels[1]!, RATE, 1));
  });
});
