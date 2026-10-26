import { describe, expect, it } from "vitest";
import { effectsOf, materializeListening, songSource, songSummary } from "./songs";

describe("camuffamenti nell'elenco degli effetti", () => {
  it("compaiono nel riassunto con gli altri effetti, nell'ordine, e la variante solo se non è la prima", () => {
    expect(songSummary({ effects: [{ type: "blur", amount: 100 }, { type: "shuffle_syllables", amount: 150, seed: 7 }, { type: "flip_spectrum", amount: 100 }] })).toEqual([
      "effetti: Sfocato 100% + Sillabe mescolate 150% #7 + Spettro capovolto 100%",
    ]);
    expect(songSummary({ effects: [{ type: "shuffle_syllables", amount: 100, seed: 1 }] })).toEqual(["effetti: Sillabe mescolate 100%"]);
  });

  it("la variante si conserva solo per gli effetti che la usano; mancante vale 1", () => {
    expect(effectsOf({ effects: [{ type: "shuffle_syllables", amount: 100, seed: 9 }, { type: "blur", amount: 50, seed: 9 }, { type: "shuffle_syllables" }] })).toEqual([
      { type: "shuffle_syllables", amount: 100, seed: 9 },
      { type: "blur", amount: 50 },
      { type: "shuffle_syllables", amount: 100, seed: 1 },
    ]);
  });
});

describe("ascolto brano per brano", () => {
  it("il continuo con la durata normale non è una voce del riassunto, con un'altra durata sì", () => {
    expect(songSummary({ playback: "continuous", clipSeconds: 30 })).toEqual([]);
    expect(songSummary({ playback: "continuous", clipSeconds: 45 })).toEqual(["ascolto continuo, 45 s"]);
  });

  it("un brano che segue il round riceve i valori del round, così suona come prima", () => {
    expect(materializeListening({ answer: "a", playback: "inherit" }, { playback: "continuous", clipSeconds: 45 })).toEqual({ answer: "a", playback: "continuous", clipSeconds: 45 });
    expect(materializeListening({ answer: "a" }, { playback: "loops", loopSeconds: [1, 3], loopPauseSeconds: 2 })).toEqual({ answer: "a", playback: "loops", loopSeconds: [1, 3], loopPauseSeconds: 2 });
  });

  it("i valori propri del brano vincono su quelli del round; mancando entrambi valgono i predefiniti", () => {
    expect(materializeListening({ playback: "inherit", clipSeconds: 12 }, { clipSeconds: 45 })).toMatchObject({ clipSeconds: 12 });
    expect(materializeListening({ playback: "inherit", loopSeconds: [0.5] }, { playback: "loops", loopSeconds: [1, 3] })).toMatchObject({ loopSeconds: [0.5] });
    expect(materializeListening({ playback: "inherit" }, {})).toEqual({ playback: "continuous", clipSeconds: 30 });
    expect(materializeListening({ playback: "inherit" }, { playback: "loops" })).toEqual({ playback: "loops", loopSeconds: [0.5, 1, 2, 4, 8], loopPauseSeconds: 1.5 });
  });

  it("un brano con una modalità sua riceve solo i valori che gli mancano, ed è idempotente", () => {
    const own = { playback: "speed", speed: 1.5, clipSeconds: 20 };
    expect(materializeListening(own, { playback: "loops" })).toBe(own);
    expect(materializeListening({ playback: "speed", speed: 1.5 }, { clipSeconds: 45 })).toEqual({ playback: "speed", speed: 1.5, clipSeconds: 45 });
    // passando a «a spezzoni» compaiono gli spezzoni e la pausa, così non restano campi vuoti che dipendono da valori nascosti
    expect(materializeListening({ playback: "loops", loopSeconds: [] }, {})).toEqual({ playback: "loops", loopSeconds: [0.5, 1, 2, 4, 8], loopPauseSeconds: 1.5 });
    expect(materializeListening({ playback: "loops", loopSeconds: [3], loopPauseSeconds: 4 }, {})).toEqual({ playback: "loops", loopSeconds: [3], loopPauseSeconds: 4 });
    const once = materializeListening({ playback: "inherit" }, { clipSeconds: 20 });
    expect(materializeListening(once, { clipSeconds: 99 })).toBe(once);
  });
});

describe("riassunto di un brano", () => {
  it("un brano con le impostazioni predefinite non ha nessuna voce", () => {
    expect(songSummary({ audio: "a.mp3", answer: "x", startSeconds: 0, effects: [], playback: "inherit", categories: [] })).toEqual([]);
  });

  it("elenca solo ciò che è stato cambiato, nell'ordine: partenza, ascolto, effetti, categorie, punti", () => {
    expect(
      songSummary({
        startSeconds: 12.5,
        playback: "loops",
        loopSeconds: [0.5, 1, 2],
        effects: [{ type: "blur", amount: 165 }, { type: "echo", amount: 55 }],
        categories: ["Anni 80", "Rock"],
        points: 200,
      }),
    ).toEqual(["parte da 12,5 s", "ascolto a spezzoni crescenti (0,5 · 1 · 2 s)", "effetti: Sfocato 165% + Eco 55%", "categorie: Anni 80, Rock", "200 punti"]);
  });

  it("velocità e durata dell'ascolto del brano", () => {
    expect(songSummary({ playback: "speed", speed: 2, clipSeconds: 20 })).toEqual(["ascolto più lento o più veloce (×2), 20 s"]);
    expect(songSummary({ playback: "inherit", clipSeconds: 45 })).toEqual(["ascolto 45 s"]);
  });

  it("il vecchio effetto singolo conta come primo dell'elenco e la quantità mancante vale 100", () => {
    expect(effectsOf({ effect: "heavy_blur", effects: [{ type: "echo" }] })).toEqual([{ type: "blur", amount: 165 }, { type: "echo", amount: 100 }]);
    expect(songSummary({ effect: "no_voice" })).toEqual(["effetti: Senza voce 100%"]);
    expect(effectsOf({ effects: [{ type: "inesistente", amount: 5 }] })).toEqual([]);
  });

  it("ignora valori incompleti o fuori tipo", () => {
    expect(songSummary({ startSeconds: "x", effects: "no", categories: [1, " "], points: null })).toEqual([]);
  });
});

describe("sorgente di un brano", () => {
  const library = [{ file: "abc.mp3", name: "Mio brano.mp3", size: 1 }];

  it("file della mediateca col nome originale, o segnalato se non c'è più", () => {
    expect(songSource({ audio: "abc.mp3" }, library)).toEqual({ kind: "file", label: "Mio brano.mp3" });
    expect(songSource({ audio: "zzz.mp3" }, library)).toEqual({ kind: "file", label: "(file non trovato)" });
  });

  it("link YouTube riconosciuto o no", () => {
    expect(songSource({ youtube: "https://youtu.be/_9HHju9_hMM" }, [])).toEqual({ kind: "youtube", label: "YouTube _9HHju9_hMM" });
    expect(songSource({ youtube: "boh" }, [])?.label).toBe("link YouTube non riconosciuto");
  });

  it("senza né file né link non c'è sorgente", () => {
    expect(songSource({ audio: "", youtube: " " }, [])).toBeNull();
    expect(songSource({}, [])).toBeNull();
  });
});
