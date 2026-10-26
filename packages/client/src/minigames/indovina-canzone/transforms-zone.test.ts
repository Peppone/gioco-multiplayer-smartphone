import { describe, expect, it } from "vitest";
import { BEEP_HZ, ZONE_FADE_MS, beep, disguiseChannels, inZone, pasteZone, silence, stutter, stutterRepeat, stutterSkip, zoneRange } from "./transforms";

const RATE = 16_000;

const tone = (hz: number, seconds: number, amplitude = 0.5) =>
  Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / RATE));

/** Un suono con "sillabe" distinguibili: ogni 200 ms cambia la frequenza, con una pausa breve in mezzo. */
const syllables = (count: number) =>
  Float32Array.from({ length: count * Math.round(0.2 * RATE) }, (_, i) => {
    const n = Math.floor(i / (0.2 * RATE));
    const inside = i % Math.round(0.2 * RATE);
    return inside < 0.03 * RATE ? 0 : 0.5 * Math.sin((2 * Math.PI * (200 + 60 * n) * i) / RATE);
  });

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

const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((s, x) => s + x * x, 0) / Math.max(1, samples.length));

describe("balbuziente", () => {
  it("le probabilità crescono con la quantità e hanno un tetto", () => {
    expect(stutterRepeat(0)).toBe(0);
    expect(stutterRepeat(1)).toBeCloseTo(0.35);
    expect(stutterRepeat(1)).toBeLessThan(stutterRepeat(2));
    expect(stutterRepeat(10)).toBeLessThanOrEqual(0.9);
    expect(stutterSkip(1)).toBeCloseTo(0.15);
    expect(stutterSkip(10)).toBeLessThanOrEqual(0.45);
  });

  it("con quantità nulla è l'originale e non tocca l'ingresso", () => {
    const input = syllables(20);
    const copy = Float32Array.from(input);
    expect(stutter([input], RATE, 0, 1)[0]).toEqual(input);
    stutter([input], RATE, 2, 1);
    expect(input).toEqual(copy);
  });

  it("stesso seme, stessa uscita; semi diversi, uscite diverse; la durata non cambia", () => {
    const input = syllables(30);
    const a = stutter([input], RATE, 2, 5)[0]!;
    expect(stutter([input], RATE, 2, 5)[0]).toEqual(a);
    expect(stutter([input], RATE, 2, 6)[0]).not.toEqual(a);
    expect(a.length).toBe(input.length);
    expect(a).not.toEqual(input);
  });

  it("usa solo suoni dell'originale (il volume non cambia) e tutti i canali seguono gli stessi tagli", () => {
    const input = syllables(30);
    const [left, right] = stutter([input, Float32Array.from(input, (v) => v * 0.5)], RATE, 2, 3);
    expect(Math.abs(rms(left!) - rms(input))).toBeLessThan(rms(input) * 0.4);
    for (let i = 0; i < left!.length; i += 97) expect(right![i]!).toBeCloseTo(left![i]! * 0.5, 5);
  });

  it("un suono più corto di due frammenti resta com'è", () => {
    const input = syllables(1);
    expect(stutter([input], RATE, 3, 1)[0]).toEqual(input);
  });
});

describe("bip e silenzio", () => {
  it("il bip a 100% sostituisce il suono con un tono a 1 kHz; a 0% è l'originale", () => {
    const input = tone(300, 0.5);
    const covered = beep(input, RATE, 1);
    expect(level(covered, BEEP_HZ)).toBeGreaterThan(0.3);
    expect(level(covered, 300)).toBeLessThan(0.01);
    expect(beep(input, RATE, 0)).toEqual(input);
    const half = beep(input, RATE, 0.5);
    expect(level(half, 300)).toBeGreaterThan(0.2);
    expect(level(half, BEEP_HZ)).toBeGreaterThan(0.1);
  });

  it("il silenzio a 100% toglie tutto, a 50% dimezza, a 0% è l'originale; l'ingresso non cambia", () => {
    const input = tone(300, 0.5);
    const copy = Float32Array.from(input);
    expect(rms(silence(input, RATE, 1))).toBe(0);
    expect(rms(silence(input, RATE, 0.5)) / rms(input)).toBeCloseTo(0.5, 2);
    expect(silence(input, RATE, 0)).toEqual(input);
    expect(input).toEqual(copy);
  });
});

describe("zone", () => {
  it("la zona in campioni sta dentro il suono; senza zona è tutto il suono; vuota o fuori è nulla", () => {
    expect(zoneRange(null, RATE, 1000)).toEqual([0, 1000]);
    expect(zoneRange({ from: 0.25, to: 0.5 }, RATE, RATE)).toEqual([4000, 8000]);
    expect(zoneRange({ from: 0.5, to: 99 }, RATE, RATE)).toEqual([8000, RATE]);
    expect(zoneRange({ from: -5, to: 0.5 }, RATE, RATE)).toEqual([0, 8000]);
    expect(zoneRange({ from: 5, to: 6 }, RATE, RATE)).toBeNull();
    expect(zoneRange({ from: -3, to: -1 }, RATE, RATE)).toBeNull();
  });

  it("l'effetto vale solo nella zona: fuori i campioni sono identici all'originale al campione", () => {
    const input = tone(300, 2);
    const [out] = inZone([input], RATE, { from: 0.5, to: 1.5 }, (part) => part.map((c) => silence(c, RATE, 1)));
    const [start, end] = zoneRange({ from: 0.5, to: 1.5 }, RATE, input.length)!;
    expect(out!.length).toBe(input.length);
    expect(out!.subarray(0, start)).toEqual(input.subarray(0, start));
    expect(out!.subarray(end)).toEqual(input.subarray(end));
    const fade = Math.round((ZONE_FADE_MS / 1000) * RATE);
    expect(rms(out!.subarray(start + fade, end - fade))).toBe(0);
  });

  it("ai bordi della zona l'effetto entra e esce con una dissolvenza, senza scatti", () => {
    const input = Float32Array.from({ length: RATE }, () => 0.5);
    const [out] = inZone([input], RATE, { from: 0.25, to: 0.75 }, (part) => part.map((c) => silence(c, RATE, 1)));
    const start = Math.round(0.25 * RATE);
    const end = Math.round(0.75 * RATE);
    let biggestStep = 0;
    for (let i = 1; i < out!.length; i++) biggestStep = Math.max(biggestStep, Math.abs(out![i]! - out![i - 1]!));
    expect(biggestStep).toBeLessThan(0.1);
    expect(out![start - 1]!).toBe(0.5);
    expect(out![start + 1]!).toBeLessThan(0.5);
    expect(out![end - 1]!).toBeLessThan(0.5);
    expect(out![end]!).toBe(0.5);
  });

  it("senza zona esegue l'effetto su tutto; con una zona fuori dal suono non cambia nulla", () => {
    const input = tone(300, 0.5);
    expect(inZone([input], RATE, null, (part) => part.map((c) => silence(c, RATE, 1)))[0]!.every((v) => v === 0)).toBe(true);
    const channels = [input];
    expect(inZone(channels, RATE, { from: 10, to: 11 }, (part) => part)).toBe(channels);
  });

  it("pasteZone non cambia l'ingresso e usa il primo canale elaborato se ne manca uno", () => {
    const original = [tone(200, 0.5), tone(200, 0.5)];
    const copy = original.map((c) => Float32Array.from(c));
    const out = pasteZone(original, [new Float32Array(1000)], 2000, RATE);
    expect(original).toEqual(copy);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual(out[0]);
  });
});

describe("disguiseChannels con i nuovi camuffamenti", () => {
  it("ogni tipo restituisce tanti canali quanti ne riceve, della stessa durata e senza superare ±1", () => {
    const input = Float32Array.from(syllables(10), (v) => v * 1.8);
    for (const kind of ["stutter", "vocoder", "hum", "beep", "silence"] as const) {
      const out = disguiseChannels(kind, [input, input], RATE, 1.5, 4);
      expect(out, kind).toHaveLength(2);
      for (const c of out) {
        expect(c.length, kind).toBe(input.length);
        expect(c.every((v) => Math.abs(v) <= 1 && Number.isFinite(v)), kind).toBe(true);
      }
    }
  });
});
