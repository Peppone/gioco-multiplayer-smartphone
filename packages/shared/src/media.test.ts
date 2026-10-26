import { describe, expect, it } from "vitest";
import { AUDIO_EFFECTS, AUDIO_TYPES, EFFECT_AMOUNT, MEDIA_FILE_PATTERN, STAGES_BLUR_AMOUNT, effectsForListening, legacyEffectSettings, mediaContentType } from "./media.js";

describe("tipo del file da caricare", () => {
  it("usa quello del browser se il server lo riconosce", () => {
    expect(mediaContentType("clip.mp4", "video/mp4")).toBe("video/mp4");
    expect(mediaContentType("brano.mp3", "audio/mpeg")).toBe("audio/mpeg");
    expect(mediaContentType("brano.m4a", "audio/mp4; codecs=mp4a.40.2")).toBe("audio/mp4");
  });

  it("se il browser non dice il tipo, o ne dà uno sconosciuto, vale l'estensione", () => {
    expect(mediaContentType("Videoclip.MP4", "")).toBe("video/mp4");
    expect(mediaContentType("clip.mp4", "video/x-m4v")).toBe("video/mp4");
    expect(mediaContentType("brano.m4a", "audio/x-m4a")).toBe("audio/mp4");
    expect(mediaContentType("brano.flac", "")).toBe("audio/flac");
  });

  it("un file senza estensione né tipo si tratta come mp3 (come prima)", () => {
    expect(mediaContentType("brano", "")).toBe("audio/mpeg");
  });
});

describe("nomi della mediateca", () => {
  it("ogni estensione accettata ha un nome valido, anche mp4", () => {
    for (const ext of Object.keys(AUDIO_TYPES)) {
      expect(`11111111-1111-4111-8111-111111111111.${ext}`).toMatch(MEDIA_FILE_PATTERN);
    }
    expect("11111111-1111-4111-8111-111111111111.mp4").toMatch(MEDIA_FILE_PATTERN);
    expect("11111111-1111-4111-8111-111111111111.mov").not.toMatch(MEDIA_FILE_PATTERN);
  });
});

describe("effetti sull'audio di un brano", () => {
  it("il vecchio effetto singolo diventa un elenco con la stessa intensità di prima", () => {
    expect(legacyEffectSettings(undefined)).toEqual([]);
    expect(legacyEffectSettings("none")).toEqual([]);
    expect(legacyEffectSettings("blur")).toEqual([{ type: "blur", amount: 100 }]);
    expect(legacyEffectSettings("heavy_blur")).toEqual([{ type: "blur", amount: STAGES_BLUR_AMOUNT }]);
    expect(legacyEffectSettings("no_voice")).toEqual([{ type: "no_voice", amount: 100 }]);
  });

  it("la quantità predefinita sta nell'intervallo, che arriva oltre il 100%", () => {
    expect(EFFECT_AMOUNT.default).toBeGreaterThanOrEqual(EFFECT_AMOUNT.min);
    expect(EFFECT_AMOUNT.default).toBeLessThan(EFFECT_AMOUNT.max);
    expect(EFFECT_AMOUNT.max).toBeGreaterThanOrEqual(300);
    expect(new Set(AUDIO_EFFECTS).size).toBe(AUDIO_EFFECTS.length);
  });

  it("con le fasi lo sfocato del brano lo sostituiscono le fasi, gli altri effetti restano in ordine", () => {
    const effects = [{ type: "echo", amount: 120 }, { type: "blur", amount: 80 }, { type: "distortion", amount: 200 }] as const;
    expect(effectsForListening([...effects], null)).toEqual(effects);
    expect(effectsForListening([...effects], { firstMs: 1 })).toEqual([
      { type: "blur", amount: STAGES_BLUR_AMOUNT },
      { type: "echo", amount: 120 },
      { type: "distortion", amount: 200 },
    ]);
    expect(effectsForListening([], { firstMs: 1 })).toEqual([{ type: "blur", amount: STAGES_BLUR_AMOUNT }]);
  });
});
