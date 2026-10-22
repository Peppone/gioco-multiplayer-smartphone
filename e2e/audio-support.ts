import { type APIRequestContext, type Page, expect } from "@playwright/test";
import { adminToken } from "./support";

/** WAV mono 8 kHz di silenzio (circa mezzo secondo): basta a essere un audio valido. */
export function silentWav(): Buffer {
  const samples = 4_000;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8_000, 24);
  header.writeUInt32LE(8_000, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples, 40);
  return Buffer.concat([header, Buffer.alloc(samples, 128)]);
}

/** WAV stereo 16 bit a 44,1 kHz di circa 4 s (o `seconds`): un tono sinusoidale per canale (0 Hz = silenzio). */
export function stereoTone(leftHz: number | number[], rightHz: number | number[] = leftHz, seconds = 4): Buffer {
  const rate = 44_100;
  const frames = rate * seconds;
  const data = Buffer.alloc(frames * 4);
  const sample = (hz: number | number[], i: number) => {
    const tones = [hz].flat().filter((f) => f > 0);
    if (tones.length === 0) return 0;
    return Math.round(tones.reduce((s, f) => s + Math.sin((2 * Math.PI * f * i) / rate), 0) * 0.25 * 32_767);
  };
  for (let i = 0; i < frames; i++) {
    data.writeInt16LE(sample(leftHz, i), i * 4);
    data.writeInt16LE(sample(rightHz, i), i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Inserisce un analizzatore davanti all'uscita di ogni AudioContext e ne espone il livello (`__db(hz)`, in decibel). */
export const TAP_SCRIPT = `
  const taps = [];
  const desc = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, "destination");
  Object.defineProperty(BaseAudioContext.prototype, "destination", {
    get() {
      if (!this.__tap) {
        const analyser = this.createAnalyser();
        analyser.fftSize = 2048;
        analyser.connect(desc.get.call(this));
        this.__tap = analyser;
        taps.push(analyser);
      }
      return this.__tap;
    },
  });
  window.__db = (hz) => {
    let best = -Infinity;
    for (const a of taps) {
      const buf = new Float32Array(a.frequencyBinCount);
      a.getFloatFrequencyData(buf);
      best = Math.max(best, buf[Math.round((hz * a.fftSize) / a.context.sampleRate)]);
    }
    return best;
  };`;

/**
 * Registra ogni start() e stop() delle sorgenti Web Audio dello schermo con il tempo dell'audio (`window.__sources`):
 * dimostra quando e per quanto suona ogni spezzone, senza dipendere dai timer della pagina.
 */
export const SOURCE_SPY = `
  window.__sources = [];
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when, offset) {
    window.__sources.push({ name: "start", at: this.context.currentTime, when: when || 0, offset: offset || 0 });
    return start.apply(this, arguments);
  };
  const stop = AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.stop = function (when) {
    window.__sources.push({ name: "stop", at: this.context.currentTime, when: when || 0 });
    return stop.apply(this, arguments);
  };`;

/**
 * Il tocco che sblocca l'audio dello schermo. Si aspetta l'app e si tocca un testo: in un punto fisso (in alto a
 * sinistra) c'è il pulsante del muto, e a pagina già disegnata il tocco spegnerebbe l'audio invece di sbloccarlo.
 */
export async function unlockAudio(page: Page) {
  await page.getByText("Si comincia tra poco!").click();
  await expect(page.getByRole("button", { name: "Disattiva l'audio" })).toBeVisible();
}

/** Carica un file nella mediateca della regia e restituisce il suo nome. */
export async function uploadTone(request: APIRequestContext, name: string, wav: Buffer): Promise<string> {
  const res = await request.post("/api/admin/media", {
    headers: { Authorization: `Bearer ${await adminToken(request)}`, "Content-Type": "audio/wav", "X-File-Name": name },
    data: wav,
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { file: string }).file;
}
