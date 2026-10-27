import type { BufferEffect } from "@gioco/shared";
import type { DisguiseRequest, DisguiseResponse } from "./disguise.worker";
import { disguiseChannels } from "./transforms";

/** Applica un camuffamento ai campioni senza bloccare chi chiama. Non modifica i campioni ricevuti. */
export type Disguiser = (kind: BufferEffect, channels: Float32Array[], sampleRate: number, k: number, seed: number) => Promise<Float32Array[]>;

/** Senza Worker (test in Node, browser che non li hanno): stessa funzione, nel thread di chi chiama. */
export const disguiseInline: Disguiser = async (kind, channels, sampleRate, k, seed) => disguiseChannels(kind, channels, sampleRate, k, seed);

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (c: Float32Array[]) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL("./disguise.worker.ts", import.meta.url), { type: "module" });
  w.onmessage = (event: MessageEvent<DisguiseResponse>) => {
    const reply = event.data;
    const p = pending.get(reply.id);
    if (!p) return;
    pending.delete(reply.id);
    if ("error" in reply) p.reject(new Error(reply.error));
    else p.resolve(reply.channels);
  };
  // Un Worker che muore (o non parte) fa fallire le richieste in corso: chi chiama ripiega sul calcolo in linea.
  w.onerror = () => {
    for (const p of pending.values()) p.reject(new Error("worker non disponibile"));
    pending.clear();
    w.terminate();
    worker = null;
  };
  worker = w;
  return w;
}

/** Nel Worker se c'è; se non parte o fallisce, in linea (il brano si prepara comunque, solo bloccando la pagina per un po'). */
export const disguiseInWorker: Disguiser = async (kind, channels, sampleRate, k, seed) => {
  if (typeof Worker === "undefined") return disguiseInline(kind, channels, sampleRate, k, seed);
  try {
    const id = nextId++;
    const w = getWorker();
    const done = new Promise<Float32Array[]>((resolve, reject) => pending.set(id, { resolve, reject }));
    // Si passa una copia: il chiamante conserva i suoi campioni (servono ancora fuori dalla zona).
    const copy = channels.map((c) => Float32Array.from(c));
    w.postMessage({ id, kind, channels: copy, sampleRate, k, seed } satisfies DisguiseRequest, copy.map((c) => c.buffer));
    return await done;
  } catch {
    return disguiseInline(kind, channels, sampleRate, k, seed);
  }
};
