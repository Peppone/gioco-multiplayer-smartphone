// Sintetizza gli effetti sonori dei temi (nessun asset esterno: licenza non applicabile).
// Uso: node tools/sounds/generate.mjs   →   packages/client/public/sounds/<tema>/<evento>.wav
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RATE = 22050;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../packages/client/public/sounds");

// Frequenze (Hz) di una scala di Do maggiore.
const N = { C4: 261.63, E4: 329.63, G4: 392.0, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, C6: 1046.5, A3: 220, E3: 164.81 };

/** Timbro per tema: forma d'onda e velocità di decadimento. */
const THEMES = {
  gameshow: { wave: "bell", decay: 5 },
  pixel: { wave: "pulse", decay: 7 },
  manga: { wave: "saw", decay: 9 },
  retro80: { wave: "synth", decay: 4 },
};

function osc(wave, phase, t) {
  const p = phase % 1;
  switch (wave) {
    case "bell":
      return Math.sin(2 * Math.PI * phase) + 0.5 * Math.sin(4 * Math.PI * phase) + 0.25 * Math.sin(6 * Math.PI * phase * 1.01);
    case "pulse":
      return p < 0.25 ? 1 : -1;
    case "saw":
      return 2 * p - 1;
    case "synth":
      return (2 * p - 1) * 0.6 + Math.sin(2 * Math.PI * phase * 2.003) * 0.4;
    case "noise":
      return Math.random() * 2 - 1;
    default:
      return Math.sin(2 * Math.PI * phase) * (t >= 0 ? 1 : 1);
  }
}

/** Una nota: frequenza (con eventuale glissando verso `to`), durata in secondi. */
function note({ wave, decay }, freq, dur, { to = freq, vol = 0.5 } = {}) {
  const n = Math.floor(dur * RATE);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / RATE;
    const f = freq + (to - freq) * (i / n);
    phase += f / RATE;
    const attack = Math.min(1, t / 0.004);
    const env = attack * Math.exp(-decay * (t / dur));
    out[i] = osc(wave, phase, t) * env * vol;
  }
  return out;
}

const silence = (dur) => new Float32Array(Math.floor(dur * RATE));
const concat = (parts) => {
  const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) (out.set(p, o), (o += p.length));
  return out;
};

const EVENTS = {
  tick: (t) => note(t, N.C6, 0.04, { vol: 0.35 }),
  start: (t) => concat([N.C5, N.E5, N.G5].map((f) => note(t, f, 0.09))),
  buzz: (t) => note(t, N.E4, 0.12, { to: N.G4, vol: 0.6 }),
  correct: (t) => concat([note(t, N.C5, 0.1), note(t, N.G5, 0.22)]),
  wrong: (t) => concat([note(t, N.A3, 0.14, { to: N.E3 }), note(t, N.E3, 0.22, { to: 110 })]),
  reveal: (t) => concat([note({ wave: "noise", decay: 12 }, 0, 0.05, { vol: 0.5 }), note(t, N.C4, 0.35, { to: N.A3 })]),
  // Avvisi del Game Master: un «din-don» ascendente per le richieste, una nota sola più morbida per la posta.
  notify: (t) => concat([note(t, N.G5, 0.12, { vol: 0.55 }), silence(0.02), note(t, N.C6, 0.3, { vol: 0.55 })]),
  mail: (t) => note(t, N.E5, 0.14, { vol: 0.4 }),
  fanfare: (t) =>
    concat([
      note(t, N.C5, 0.12),
      note(t, N.C5, 0.12),
      note(t, N.E5, 0.12),
      note(t, N.G5, 0.18),
      silence(0.04),
      note(t, N.E5, 0.1),
      note(t, N.G5, 0.45),
    ]),
};

function wav8(samples) {
  const data = Buffer.alloc(samples.length);
  samples.forEach((s, i) => (data[i] = Math.max(0, Math.min(255, Math.round(128 + Math.max(-1, Math.min(1, s)) * 127)))));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE, 28); // byte rate (8 bit mono)
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

let total = 0;
for (const [theme, timbre] of Object.entries(THEMES)) {
  mkdirSync(join(OUT, theme), { recursive: true });
  for (const [name, make] of Object.entries(EVENTS)) {
    const buf = wav8(make(timbre));
    writeFileSync(join(OUT, theme, `${name}.wav`), buf);
    total += buf.length;
  }
}
console.log(`Generati ${Object.keys(THEMES).length * Object.keys(EVENTS).length} suoni, ${(total / 1024).toFixed(0)} KB in totale`);
