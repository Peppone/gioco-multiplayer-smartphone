import { describe, expect, it } from "vitest";
import type { EffectSetting } from "@gioco/shared";
import { type EffectRenderer, PREPARE_MAX_SECONDS, encodeWav, prepareWindow, renderChain, splitChain } from "./prepare";
import { disguiseChannels } from "./transforms";

const RATE = 16_000;
const tone = (hz: number, seconds: number, amplitude = 0.5) =>
  Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => amplitude * Math.sin((2 * Math.PI * hz * i) / RATE));
const peak = (s: Float32Array) => s.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

const blur: EffectSetting = { type: "blur", amount: 100 };
const echo: EffectSetting = { type: "echo", amount: 50 };
const flip: EffectSetting = { type: "flip_spectrum", amount: 100 };
const shuffle: EffectSetting = { type: "shuffle_syllables", amount: 100, seed: 3 };

describe("divisione dell'elenco degli effetti", () => {
  it("senza camuffamenti tutto resta in tempo reale", () => {
    expect(splitChain([])).toEqual({ pre: [], live: [] });
    expect(splitChain([blur, echo])).toEqual({ pre: [], live: [blur, echo] });
  });

  it("si prepara in anticipo tutto fino all'ultimo camuffamento, il resto resta in tempo reale", () => {
    expect(splitChain([flip])).toEqual({ pre: [flip], live: [] });
    expect(splitChain([blur, flip, echo])).toEqual({ pre: [blur, flip], live: [echo] });
    expect(splitChain([flip, blur, shuffle, echo])).toEqual({ pre: [flip, blur, shuffle], live: [echo] });
  });
});

describe("preparazione del file", () => {
  /** Finto «effetti in tempo reale»: registra cosa gli arriva e cambia il suono, così si vede quante volte e in che ordine passa. */
  const recorder = () => {
    const calls: string[][] = [];
    const render: EffectRenderer = async (effects, channels) => {
      calls.push(effects.map((e) => e.type));
      // non lineare (radice quadrata): se fosse una semplice scala commuterebbe con i camuffamenti e l'ordine non si vedrebbe
      return channels.map((c) => c.map((v) => Math.sign(v) * Math.sqrt(Math.abs(v)) * 0.5));
    };
    return { calls, render };
  };

  it("senza effetti restituisce i campioni com'erano", async () => {
    const { calls, render } = recorder();
    const input = [tone(500, 0.5)];
    expect(await renderChain([], input, RATE, render)).toEqual(input);
    expect(calls).toEqual([]);
  });

  it("gli effetti consecutivi passano insieme, i camuffamenti li separano, nell'ordine dell'elenco", async () => {
    const { calls, render } = recorder();
    await renderChain([blur, echo, flip, blur, shuffle], [tone(500, 1)], RATE, render);
    expect(calls).toEqual([["blur", "echo"], ["blur"]]);
  });

  it("l'ordine conta: effetto e poi camuffamento non dà lo stesso suono di camuffamento e poi effetto", async () => {
    const { render } = recorder();
    const input = [tone(1_000, 1), tone(1_000, 1)];
    const a = await renderChain([blur, flip], input, RATE, render);
    const b = await renderChain([flip, blur], input, RATE, render);
    expect(a).not.toEqual(b);
    // un camuffamento solo equivale alla funzione pura (con il limite a ±1)
    expect(await renderChain([flip], input, RATE, render)).toEqual(disguiseChannels("flip_spectrum", input, RATE, 1, 1));
  });

  it("il seme conta e il valore mancante vale 1; il risultato non supera ±1 nemmeno dopo effetti che amplificano", async () => {
    const { render } = recorder();
    const input = [Float32Array.from({ length: RATE * 2 }, (_, i) => 0.9 * Math.sin(i / 7))];
    const seed1 = await renderChain([{ type: "shuffle_syllables", amount: 100 }], input, RATE, render);
    expect(seed1).toEqual(await renderChain([{ type: "shuffle_syllables", amount: 100, seed: 1 }], input, RATE, render));
    expect(seed1).not.toEqual(await renderChain([{ type: "shuffle_syllables", amount: 100, seed: 2 }], input, RATE, render));
    const loud: EffectRenderer = async (_, channels) => channels.map((c) => c.map((v) => v * 4));
    for (const c of await renderChain([blur, flip], input, RATE, loud)) expect(peak(c)).toBeLessThanOrEqual(1);
  });

  it("la finestra preparata parte da «Parti da» e dura al massimo il limite, senza uscire dal file", () => {
    const rate = 1_000;
    const total = 600 * rate; // dieci minuti
    expect(prepareWindow(0, total, rate)).toEqual({ from: 0, to: PREPARE_MAX_SECONDS * rate, offsetSeconds: 0 });
    expect(prepareWindow(-5, total, rate).from).toBe(0);
    // un brano che parte oltre il limite non resta muto: la finestra comincia dal suo punto di partenza
    expect(prepareWindow(300.7, total, rate)).toEqual({ from: 300 * rate, to: 540 * rate, offsetSeconds: 300 });
    // vicino alla fine si ferma al file; oltre la fine è vuota
    expect(prepareWindow(500, total, rate)).toEqual({ from: 500 * rate, to: 600 * rate, offsetSeconds: 500 });
    expect(prepareWindow(900, total, rate)).toEqual({ from: total, to: total, offsetSeconds: 600 });
  });
});

describe("file WAV in memoria", () => {
  it("intestazione, durata e valori dei campioni", async () => {
    const wav = encodeWav([Float32Array.from([0, 1, -1, 0.5]), Float32Array.from([0, 0, 0, 0])], 8_000);
    expect(wav.type).toBe("audio/wav");
    expect(wav.size).toBe(44 + 4 * 2 * 2);
    const view = new DataView(await wav.arrayBuffer());
    const text = (at: number, n: number) => String.fromCharCode(...Array.from({ length: n }, (_, i) => view.getUint8(at + i)));
    expect([text(0, 4), text(8, 4), text(12, 4), text(36, 4)]).toEqual(["RIFF", "WAVE", "fmt ", "data"]);
    expect([view.getUint16(22, true), view.getUint32(24, true), view.getUint16(34, true), view.getUint32(40, true)]).toEqual([2, 8_000, 16, 16]);
    // campioni interleaved: sinistro 1 → 0x7fff, sinistro −1 → −0x8000
    expect(view.getInt16(44 + 4, true)).toBe(0x7fff);
    expect(view.getInt16(44 + 8, true)).toBe(-0x8000);
    expect(view.getInt16(44 + 12, true)).toBe(Math.trunc(0.5 * 0x7fff));
  });

  it("oltre ±1 satura invece di girare intorno", async () => {
    const view = new DataView(await encodeWav([Float32Array.from([3, -3])], 8_000).arrayBuffer());
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });
});
