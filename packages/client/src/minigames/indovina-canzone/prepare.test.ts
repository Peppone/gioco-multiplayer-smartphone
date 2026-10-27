import { describe, expect, it } from "vitest";
import type { EffectSetting } from "@gioco/shared";
import { type EffectRenderer, PREPARE_MAX_SECONDS, encodeWav, prepareWindow, renderChain, renderSnippets, splitChain } from "./prepare";
import { snippetReveals } from "./reveal";
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

  it("un effetto su una zona vale solo lì (anche uno in tempo reale), e si sposta se il file preparato parte più avanti", async () => {
    const { calls, render } = recorder();
    const input = [tone(300, 4)];
    // «silence» su 1–2 s: fuori resta l'originale al campione, dentro tace
    const silenced = await renderChain([{ type: "silence", amount: 100, from: 1, to: 2 }], input, RATE, render);
    expect(silenced[0]!.subarray(0, RATE * 0.9)).toEqual(input[0]!.subarray(0, RATE * 0.9));
    expect(silenced[0]!.subarray(RATE * 1.1, RATE * 1.9).every((v) => v === 0)).toBe(true);
    expect(silenced[0]!.subarray(RATE * 2.1)).toEqual(input[0]!.subarray(RATE * 2.1));
    // un effetto in tempo reale con zona passa dal renderer solo sulla zona
    await renderChain([{ type: "echo", amount: 50, from: 1, to: 2 }], input, RATE, render);
    expect(calls).toEqual([["echo"]]);
    // il file preparato comincia al secondo 10: la zona 11–12 cade a 1–2 s del file
    const shifted = await renderChain([{ type: "silence", amount: 100, from: 11, to: 12 }], input, RATE, render, 10);
    expect(shifted).toEqual(silenced);
    // una zona fuori dal tratto preparato non cambia nulla
    expect(await renderChain([{ type: "silence", amount: 100, from: 50, to: 60 }], input, RATE, render, 10)).toEqual(input);
  });

  it("«Svela gradualmente»: il camuffamento si attenua lungo il brano e a fine rampa resta l'originale", async () => {
    const { render } = recorder();
    const input = [Float32Array.from({ length: RATE * 8 }, (_, i) => 0.6 * Math.sin(i / 5) * Math.sin(i / 900))];
    const clarity = (s: number) => Math.min(1, Math.max(0, s / 4)); // nitido dopo 4 s
    const out = (await renderChain([{ type: "reverse_chunks", amount: 200 }], input, RATE, render, 0, clarity))[0]!;
    const full = disguiseChannels("reverse_chunks", input, RATE, 2, 1)[0]!;
    const diff = (a: Float32Array, b: Float32Array, from: number, to: number) => {
      let d = 0;
      for (let i = Math.round(from * RATE); i < Math.round(to * RATE); i++) d += Math.abs(a[i]! - b[i]!);
      return d / ((to - from) * RATE);
    };
    // all'inizio è il camuffamento pieno; verso la fine della rampa se ne discosta; dopo la rampa è l'originale al campione
    expect(diff(out, full, 0.05, 0.4)).toBeLessThan(0.05);
    expect(diff(out, input[0]!, 3.2, 3.9)).toBeLessThan(diff(full, input[0]!, 3.2, 3.9));
    expect(out.subarray(Math.round(4.1 * RATE))).toEqual(input[0]!.subarray(Math.round(4.1 * RATE)));
  });

  it("«Svela gradualmente» rispetta la zona e lo spostamento del file preparato", async () => {
    const { render } = recorder();
    const input = [tone(300, 4)];
    const never = () => 0; // sempre pieno: equivale a nessuna rampa
    const plain = await renderChain([{ type: "silence", amount: 100, from: 11, to: 12 }], input, RATE, render, 10);
    expect(await renderChain([{ type: "silence", amount: 100, from: 11, to: 12 }], input, RATE, render, 10, never)).toEqual(plain);
    // la rampa che finisce a 11,5 s del brano: la seconda metà della zona (11,5–12) torna all'originale
    const half = await renderChain([{ type: "silence", amount: 100, from: 11, to: 12 }], input, RATE, render, 10, (s) => (s >= 11.5 ? 1 : 0));
    expect(half[0]!.subarray(Math.round(1.1 * RATE), Math.round(1.4 * RATE)).every((v) => v === 0)).toBe(true);
    expect(half[0]!.subarray(Math.round(1.6 * RATE), Math.round(1.9 * RATE))).toEqual(input[0]!.subarray(Math.round(1.6 * RATE), Math.round(1.9 * RATE)));
    // fuori dalla zona non cambia nulla
    expect(half[0]!.subarray(0, Math.round(0.9 * RATE))).toEqual(input[0]!.subarray(0, Math.round(0.9 * RATE)));
  });

  it("a spezzoni: una versione per spezzone, una dopo l'altra, ognuna con la nitidezza del suo momento", async () => {
    const { render } = recorder();
    const input = [Float32Array.from({ length: RATE * 12 }, (_, i) => 0.6 * Math.sin(i / 5) * Math.sin(i / 900))];
    const loop = { snippetsMs: [1_000, 2_000, 2_000], pauseMs: 500 };
    const snippets = snippetReveals(loop, 4, { clipMs: 8_000, clearAtPercent: 50 }); // nitido dopo 4 s ascoltati
    const out = (await renderSnippets([{ type: "reverse_chunks", amount: 200 }], input, RATE, snippets, render))[0]!;
    expect(out.length).toBe(RATE * 5);
    const at = (s: number) => Math.round(s * RATE);
    const original = (from: number, to: number) => input[0]!.subarray(at(from), at(to));
    const full = disguiseChannels("reverse_chunks", [original(4, 5)], RATE, 2, 1)[0]!;
    // il primo spezzone (1 s, tutto camuffato) è il camuffamento pieno di 1 s di brano dal secondo 4
    const first = out.subarray(0, at(1));
    let d = 0;
    for (let i = at(0.05); i < at(0.4); i++) d += Math.abs(first[i]! - full[i]!);
    expect(d / (at(0.4) - at(0.05))).toBeLessThan(0.05);
    // il terzo spezzone comincia quando sono già passati 1+0,5+2+0,5 = 4 s: è nitido, quindi è l'originale al campione
    expect(out.subarray(at(3), at(5))).toEqual(original(4, 6));
    // il secondo (3 s ascoltati su 4) è quasi nitido: più vicino all'originale del primo
    const diff = (a: Float32Array, b: Float32Array) => a.reduce((s, v, i) => s + Math.abs(v - b[i]!), 0) / a.length;
    expect(diff(out.subarray(at(1), at(1.5)), original(4, 4.5))).toBeLessThan(diff(out.subarray(0, at(0.5)), original(4, 4.5)));
  });

  it("a spezzoni: uno spezzone oltre la fine del brano si chiude col silenzio e gli spostamenti restano quelli del piano", async () => {
    const { render } = recorder();
    const input = [tone(300, 3)];
    const snippets = snippetReveals({ snippetsMs: [1_000, 1_000], pauseMs: 0 }, 2.5, { clipMs: 2_000, clearAtPercent: 100 });
    const out = (await renderSnippets([{ type: "silence", amount: 100, from: 0, to: 100 }], input, RATE, snippets, render))[0]!;
    expect(out.length).toBe(RATE * 2);
    expect(snippets[1]!.offsetSeconds).toBe(1);
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
