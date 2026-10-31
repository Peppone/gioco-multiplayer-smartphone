import { EFFECT_SEED, type EffectSetting, SEEDED_EFFECTS } from "@gioco/shared";

// ---- Preset di camuffamento ----
//
// Un preset non è un sistema nuovo: riempie l'elenco degli effetti del brano con una combinazione predefinita (da
// calibrare a orecchio, vedi docs/PIANO-CAMUFFAMENTO-AUDIO.md), che poi si ascolta con l'anteprima e si ritocca a mano.

export const AUDIO_KINDS = ["voice", "jingle", "song"] as const;
export type AudioKind = (typeof AUDIO_KINDS)[number];
export const PRESET_LEVELS = ["light", "medium", "strong"] as const;
export type PresetLevel = (typeof PRESET_LEVELS)[number];

export const AUDIO_KIND_NAMES: Record<AudioKind, string> = { voice: "Voce / slogan", jingle: "Jingle", song: "Canzone" };
export const PRESET_LEVEL_NAMES: Record<PresetLevel, string> = { light: "Leggero", medium: "Medio", strong: "Forte" };

const fx = (type: EffectSetting["type"], amount: number): EffectSetting => ({ type, amount });

const PRESETS: Record<AudioKind, Record<PresetLevel, EffectSetting[]>> = {
  voice: {
    light: [fx("reverse_chunks", 80)],
    medium: [fx("reverse_chunks", 150), fx("telephone", 60)],
    strong: [fx("hum", 100)],
  },
  jingle: {
    light: [fx("blur", 100)],
    medium: [fx("flip_spectrum", 60), fx("blur", 80)],
    strong: [fx("flip_spectrum", 100), { ...fx("shuffle_syllables", 100), seed: EFFECT_SEED.default }],
  },
  song: {
    light: [fx("no_voice", 100)],
    medium: [fx("no_voice", 100), fx("reverse_chunks", 80)],
    strong: [fx("no_voice", 100), { ...fx("vocoder", 100), seed: EFFECT_SEED.default }], // 100% = 4 bande
  },
};

/** L'elenco degli effetti del preset (una copia: si può modificare). */
export function presetEffects(kind: AudioKind, level: PresetLevel): EffectSetting[] {
  return PRESETS[kind][level].map((e) => ({ ...e }));
}

const isSeeded = (e: EffectSetting) => (SEEDED_EFFECTS as readonly string[]).includes(e.type);

/** Se l'elenco ha effetti con una variante (un seme) da cambiare. */
export const hasVariants = (effects: readonly EffectSetting[]) => effects.some(isSeeded);

/**
 * Un'altra variante: cambia il seme degli effetti che lo usano (ognuno di un passo diverso, perché due effetti con lo
 * stesso seme non si ripetano), il resto resta com'è. Dopo l'ultimo seme si ricomincia dal primo.
 */
export function nextVariant(effects: readonly EffectSetting[]): EffectSetting[] {
  const size = EFFECT_SEED.max - EFFECT_SEED.min + 1;
  let n = 0;
  return effects.map((e) => {
    if (!isSeeded(e)) return { ...e };
    n++;
    const from = e.seed ?? EFFECT_SEED.default;
    return { ...e, seed: ((from - EFFECT_SEED.min + 7 * n) % size) + EFFECT_SEED.min };
  });
}
