/// <reference lib="webworker" />
import type { BufferEffect } from "@gioco/shared";
import { disguiseChannels } from "./transforms";

// Worker dei camuffamenti: le trasformazioni sono funzioni pure sui campioni (vocoder e canticchiato impiegano secondi su un
// brano intero), qui non bloccano la pagina. Gli effetti in tempo reale restano fuori: servono un contesto audio.

export interface DisguiseRequest {
  id: number;
  kind: BufferEffect;
  channels: Float32Array[];
  sampleRate: number;
  k: number;
  seed: number;
}
export type DisguiseResponse = { id: number; channels: Float32Array[] } | { id: number; error: string };

self.onmessage = (event: MessageEvent<DisguiseRequest>) => {
  const { id, kind, channels, sampleRate, k, seed } = event.data;
  try {
    const out = disguiseChannels(kind, channels, sampleRate, k, seed);
    (self as unknown as Worker).postMessage({ id, channels: out } satisfies DisguiseResponse, out.map((c) => c.buffer));
  } catch (e) {
    (self as unknown as Worker).postMessage({ id, error: e instanceof Error ? e.message : String(e) } satisfies DisguiseResponse);
  }
};
