import { EFFECT_SEED, type EffectSetting, isBufferEffect } from "@gioco/shared";
import { connectEffects } from "./effects";
import { disguiseChannels, limitChannels } from "./transforms";

// ---- Preparazione del file: i camuffamenti rielaborano i campioni prima che il brano suoni ----
//
// Gli effetti «in tempo reale» (sfocato, telefono…) filtrano il suono mentre suona; i camuffamenti (al contrario a pezzi,
// spettro capovolto, sillabe mescolate) no: servono i campioni. L'elenco degli effetti si applica comunque in serie, nel
// suo ordine, quindi tutto ciò che sta fino all'ultimo camuffamento si prepara in anticipo (sul file decodificato) e il
// resto resta in tempo reale, dove «Svela gradualmente» può ancora attenuarlo.

/** Frequenza a cui si prepara il file (il browser ricampiona alla decodifica). */
export const PREPARE_RATE = 44_100;
/** Quanto brano (s) si prepara al massimo, a partire da «Parti da»: oltre, il file preparato finisce e il brano tace. */
export const PREPARE_MAX_SECONDS = 240;

/** Divide l'elenco: `pre` (fino all'ultimo camuffamento compreso) si prepara in anticipo, `live` suona in tempo reale. */
export function splitChain(effects: readonly EffectSetting[]): { pre: EffectSetting[]; live: EffectSetting[] } {
  let last = -1;
  effects.forEach((e, i) => isBufferEffect(e.type) && (last = i));
  return { pre: effects.slice(0, last + 1), live: effects.slice(last + 1) };
}

/**
 * La parte del file da preparare, in campioni: da «Parti da» (arrotondato per difetto al secondo) per al più
 * `PREPARE_MAX_SECONDS`. Un brano che parte a metà non prepara l'inizio che non suonerà mai, e uno lungo non riempie la memoria.
 */
export function prepareWindow(startSeconds: number, totalFrames: number, sampleRate: number): { from: number; to: number; offsetSeconds: number } {
  const offsetSeconds = Math.floor(Math.max(0, startSeconds));
  const from = Math.min(totalFrames, offsetSeconds * sampleRate);
  return { from, to: Math.min(totalFrames, from + PREPARE_MAX_SECONDS * sampleRate), offsetSeconds: from / sampleRate };
}

/** Fa passare i campioni da una serie di effetti in tempo reale (a parte, perché serve un contesto audio). */
export type EffectRenderer = (effects: EffectSetting[], channels: Float32Array[], sampleRate: number) => Promise<Float32Array[]>;

/**
 * Applica `pre` ai campioni, nell'ordine: i camuffamenti con le funzioni pure di `transforms.ts`, i gruppi di effetti
 * consecutivi con `render`. Il risultato non supera mai ±1.
 */
export async function renderChain(pre: readonly EffectSetting[], channels: Float32Array[], sampleRate: number, render: EffectRenderer): Promise<Float32Array[]> {
  let current = channels;
  let run: EffectSetting[] = [];
  const flush = async () => {
    if (run.length === 0) return;
    current = await render(run, current, sampleRate);
    run = [];
  };
  for (const effect of pre) {
    if (isBufferEffect(effect.type)) {
      await flush();
      current = disguiseChannels(effect.type, current, sampleRate, effect.amount / 100, effect.seed ?? EFFECT_SEED.default);
    } else {
      run.push(effect);
    }
  }
  await flush();
  return limitChannels(current);
}

/** Gli effetti in tempo reale applicati a dei campioni, con un contesto audio «senza scheda audio» (più veloce del tempo reale). */
export const renderEffectsOffline: EffectRenderer = async (effects, channels, sampleRate) => {
  const length = Math.max(1, channels[0]?.length ?? 1);
  const ctx = new OfflineAudioContext(channels.length, length, sampleRate);
  const buffer = ctx.createBuffer(channels.length, length, sampleRate);
  channels.forEach((c, i) => buffer.copyToChannel(c as Float32Array<ArrayBuffer>, i));
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  connectEffects(ctx, source, effects);
  source.start();
  const rendered = await ctx.startRendering();
  return Array.from({ length: rendered.numberOfChannels }, (_, i) => Float32Array.from(rendered.getChannelData(i)));
};

/** I campioni come file WAV a 16 bit (intero, per darlo a un elemento audio come `blob:`). */
export function encodeWav(channels: Float32Array[], sampleRate: number): Blob {
  const count = channels.length;
  const frames = channels[0]?.length ?? 0;
  const bytes = frames * count * 2;
  const buffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(buffer);
  const text = (at: number, s: string) => [...s].forEach((ch, i) => view.setUint8(at + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, bytes, true);
  let at = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < count; c++) {
      const v = Math.max(-1, Math.min(1, channels[c]![i]!));
      view.setInt16(at, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      at += 2;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** Un file già rielaborato, pronto da suonare: `url` è un `blob:` da liberare con `dispose`. */
export interface PreparedFile {
  url: string;
  /** Il file preparato comincia a questo secondo del brano originale: i punti da cui far suonare vanno spostati indietro di tanto. */
  offsetSeconds: number;
  dispose(): void;
}

/**
 * Scarica il file, lo decodifica, applica `pre` e lo restituisce come WAV in memoria. Se `signal` si ferma prima della
 * fine non restituisce nulla (rifiuta con `AbortError`).
 */
export async function prepareFile(file: string, pre: readonly EffectSetting[], options: { startSeconds?: number; signal?: AbortSignal } = {}): Promise<PreparedFile> {
  const { signal } = options;
  const response = await fetch(`/media/${file}`, { signal });
  const data = await response.arrayBuffer();
  const decoded = await new OfflineAudioContext(1, 1, PREPARE_RATE).decodeAudioData(data);
  const { from, to, offsetSeconds } = prepareWindow(options.startSeconds ?? 0, decoded.length, PREPARE_RATE);
  const channels = Array.from({ length: Math.min(2, decoded.numberOfChannels) }, (_, c) => decoded.getChannelData(c).slice(from, to));
  const out = await renderChain(pre, channels, PREPARE_RATE, renderEffectsOffline);
  signal?.throwIfAborted();
  const url = URL.createObjectURL(encodeWav(out, PREPARE_RATE));
  return { url, offsetSeconds, dispose: () => URL.revokeObjectURL(url) };
}
