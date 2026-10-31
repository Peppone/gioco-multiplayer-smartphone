import { describe, expect, it } from "vitest";
import { AUDIO_EFFECTS, EFFECT_AMOUNT, EFFECT_SEED, isBufferEffect } from "@gioco/shared";
import { AUDIO_KINDS, PRESET_LEVELS, hasVariants, nextVariant, presetEffects } from "./presets";

describe("preset di camuffamento", () => {
  it("ogni preset è un elenco valido: effetti noti, quantità nei limiti, almeno un effetto", () => {
    for (const kind of AUDIO_KINDS) {
      for (const level of PRESET_LEVELS) {
        const list = presetEffects(kind, level);
        expect(list.length).toBeGreaterThan(0);
        for (const e of list) {
          expect(AUDIO_EFFECTS).toContain(e.type);
          expect(e.amount).toBeGreaterThanOrEqual(EFFECT_AMOUNT.min);
          expect(e.amount).toBeLessThanOrEqual(EFFECT_AMOUNT.max);
          // bip e silenzio hanno bisogno di una zona: non stanno in un preset
          expect(["beep", "silence"]).not.toContain(e.type);
        }
      }
    }
  });

  it("per voce e canzone i livelli più forti non sono più leggeri, e voce e jingle medi/forti hanno un camuffamento", () => {
    for (const kind of ["voice", "jingle"] as const) {
      expect(presetEffects(kind, "medium").some((e) => isBufferEffect(e.type))).toBe(true);
      expect(presetEffects(kind, "strong").some((e) => isBufferEffect(e.type))).toBe(true);
    }
    for (const kind of AUDIO_KINDS) {
      const [light, medium] = [presetEffects(kind, "light"), presetEffects(kind, "medium")];
      expect(medium.length + medium.reduce((s, e) => s + e.amount, 0)).toBeGreaterThan(light.length + light.reduce((s, e) => s + e.amount, 0) - 1);
    }
  });

  it("restituisce copie: modificarle non cambia il preset", () => {
    presetEffects("voice", "light")[0]!.amount = 300;
    expect(presetEffects("voice", "light")[0]!.amount).toBe(80);
  });
});

describe("altre varianti", () => {
  it("cambia il seme degli effetti che lo usano e lascia il resto", () => {
    const strong = presetEffects("jingle", "strong");
    expect(hasVariants(strong)).toBe(true);
    const next = nextVariant(strong);
    expect(next[0]).toEqual(strong[0]);
    expect(next[1]!.seed).not.toBe(strong[1]!.seed);
    expect(next[1]!.type).toBe("shuffle_syllables");
    expect(next[1]!.amount).toBe(100);
  });

  it("senza effetti con un seme non c'è nulla da cambiare", () => {
    expect(hasVariants(presetEffects("voice", "light"))).toBe(false);
    expect(nextVariant(presetEffects("voice", "light"))).toEqual(presetEffects("voice", "light"));
  });

  it("i semi restano nel limite, cambiano sempre e non tornano uguali dopo pochi passi", () => {
    let list = presetEffects("song", "strong");
    const seen = new Set<number>();
    for (let i = 0; i < 20; i++) {
      list = nextVariant(list);
      const seed = list[1]!.seed!;
      expect(seed).toBeGreaterThanOrEqual(EFFECT_SEED.min);
      expect(seed).toBeLessThanOrEqual(EFFECT_SEED.max);
      seen.add(seed);
    }
    expect(seen.size).toBe(20);
  });

  it("due effetti con seme ricevono semi diversi anche se partono uguali", () => {
    const next = nextVariant([
      { type: "vocoder", amount: 100, seed: 5 },
      { type: "stutter", amount: 100, seed: 5 },
    ]);
    expect(next[0]!.seed).not.toBe(next[1]!.seed);
  });
});
