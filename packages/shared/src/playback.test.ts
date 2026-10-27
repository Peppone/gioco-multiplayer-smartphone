import { describe, expect, it } from "vitest";
import {
  type BlurStagesPlan,
  type LoopPlan,
  type RatePlan,
  ROUND_LISTEN_DEFAULTS,
  clarityAt,
  listeningSettledMs,
  loopPosition,
  loopTotalMs,
  rateAt,
  repetitionClarity,
  repetitionPoints,
  resolveListening,
  songMsAt,
  stageLevel,
  stagesEndMs,
} from "./playback.js";

const plan: LoopPlan = { snippetsMs: [500, 1_000, 2_000], pauseMs: 1_000 };

describe("ascolto a spezzoni", () => {
  it("la durata totale somma gli spezzoni e le loro pause (anche l'ultima)", () => {
    expect(loopTotalMs(plan)).toBe(500 + 1_000 + 2_000 + 3 * 1_000);
  });

  it("suona il primo spezzone, tace, poi riparte dall'inizio del brano con uno spezzone più lungo", () => {
    expect(loopPosition(plan, 0)).toEqual({ index: 0, sounding: true, songMs: 0, nextChangeMs: 500 });
    expect(loopPosition(plan, 300)).toEqual({ index: 0, sounding: true, songMs: 300, nextChangeMs: 500 });
    expect(loopPosition(plan, 500)).toEqual({ index: 0, sounding: false, songMs: 500, nextChangeMs: 1_500 });
    expect(loopPosition(plan, 1_499)).toMatchObject({ sounding: false, nextChangeMs: 1_500 });
    expect(loopPosition(plan, 1_500)).toEqual({ index: 1, sounding: true, songMs: 0, nextChangeMs: 2_500 });
    expect(loopPosition(plan, 3_000)).toEqual({ index: 1, sounding: false, songMs: 1_000, nextChangeMs: 3_500 });
    expect(loopPosition(plan, 3_500)).toEqual({ index: 2, sounding: true, songMs: 0, nextChangeMs: 5_500 });
  });

  it("dopo l'ultima pausa non cambia più nulla", () => {
    const end = loopTotalMs(plan);
    expect(loopPosition(plan, end)).toEqual({ index: 2, sounding: false, songMs: 2_000, nextChangeMs: null });
    expect(loopPosition(plan, end + 10_000).nextChangeMs).toBeNull();
  });

  it("riprendendo da un punto a metà spezzone riparte dalla posizione giusta", () => {
    // 1,5 s di pausa + 0,6 s del secondo spezzone
    expect(loopPosition(plan, 2_100)).toMatchObject({ index: 1, sounding: true, songMs: 600 });
  });

  it("un tempo negativo vale come l'inizio", () => {
    expect(loopPosition(plan, -50)).toMatchObject({ index: 0, sounding: true, songMs: 0 });
  });
});

describe("ripetizioni sempre più nitide", () => {
  const l = resolveListening({}, { playback: "repeat", repeatSeconds: 4, repeatCount: 3, loopPauseSeconds: 1 });

  it("ripete lo stesso spezzone, con la pausa dopo ciascuno", () => {
    expect(l).toMatchObject({ mode: "repeat", stepped: true, loop: { snippetsMs: [4_000, 4_000, 4_000], pauseMs: 1_000 }, clipMs: 15_000 });
    expect(resolveListening({}, { playback: "loops" }).stepped).toBe(false);
  });

  it("la nitidezza sale a gradini uguali e l'ultimo giro è l'originale", () => {
    expect([0, 1, 2].map((i) => repetitionClarity(i, 3))).toEqual([0, 0.5, 1]);
    expect(repetitionClarity(0, 1)).toBe(1);
    expect(repetitionClarity(9, 3)).toBe(1);
  });

  it("i punti scendono a ogni giro, da massimi a minimi", () => {
    expect([0, 1, 2, 3, 4].map((i) => repetitionPoints(20, 100, i, 5))).toEqual([100, 80, 60, 40, 20]);
    expect(repetitionPoints(20, 100, 0, 1)).toBe(100);
  });
});

describe("velocità del brano", () => {
  const slow: RatePlan = { rate: 0.5, untilMs: null, transitionMs: 0 };
  const slowThenNormal: RatePlan = { rate: 0.5, untilMs: 8_000, transitionMs: 2_000 };
  const abrupt: RatePlan = { rate: 2, untilMs: 4_000, transitionMs: 0 };

  it("a velocità costante la posizione nel brano è il tempo ascoltato per la velocità", () => {
    expect(songMsAt(slow, 10_000)).toBe(5_000);
    expect(songMsAt({ rate: 2, untilMs: null, transitionMs: 0 }, 10_000)).toBe(20_000);
    expect(rateAt(slow, 123_456)).toBe(0.5);
  });

  it("senza piano il brano va a velocità normale; un tempo negativo vale l'inizio", () => {
    expect(songMsAt(null, 7_000)).toBe(7_000);
    expect(songMsAt(slow, -500)).toBe(0);
  });

  it("prima lento, poi normale: la velocità sale in modo morbido e poi resta 1", () => {
    expect(rateAt(slowThenNormal, 0)).toBe(0.5);
    expect(rateAt(slowThenNormal, 8_000)).toBe(0.5);
    expect(rateAt(slowThenNormal, 9_000)).toBeCloseTo(0.75); // a metà del passaggio
    expect(rateAt(slowThenNormal, 10_000)).toBe(1);
    expect(rateAt(slowThenNormal, 60_000)).toBe(1);
    // morbido: all'inizio e alla fine del passaggio la velocità cambia pianissimo
    expect(rateAt(slowThenNormal, 8_100) - 0.5).toBeLessThan(0.01);
    expect(1 - rateAt(slowThenNormal, 9_900)).toBeLessThan(0.01);
  });

  it("la velocità non scende mai sotto la minima né supera la massima durante il passaggio", () => {
    for (let t = 0; t <= 12_000; t += 50) {
      expect(rateAt(slowThenNormal, t)).toBeGreaterThanOrEqual(0.5);
      expect(rateAt(slowThenNormal, t)).toBeLessThanOrEqual(1);
    }
  });

  it("la velocità cresce senza mai tornare indietro (nessun salto nel passaggio)", () => {
    let prev = rateAt(slowThenNormal, 0);
    for (let t = 0; t <= 12_000; t += 10) {
      const r = rateAt(slowThenNormal, t);
      expect(r).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(r - prev).toBeLessThan(0.01);
      prev = r;
    }
  });

  it("la posizione nel brano è continua e coincide con l'integrale numerico della velocità", () => {
    for (const plan of [slowThenNormal, abrupt, { rate: 0.7, untilMs: 3_000, transitionMs: 1_500 }]) {
      let numeric = 0;
      const dt = 1;
      for (let t = 0; t < 12_000; t += dt) {
        numeric += rateAt(plan, t + dt / 2) * dt;
        if ((t + dt) % 1_500 === 0) expect(songMsAt(plan, t + dt), `piano ${JSON.stringify(plan)} a ${t + dt} ms`).toBeCloseTo(numeric, 0);
      }
    }
  });

  it("dopo il passaggio il brano avanza di un secondo per ogni secondo ascoltato", () => {
    const at = (t: number) => songMsAt(slowThenNormal, t);
    expect(at(8_000)).toBe(4_000);
    expect(at(10_000)).toBeCloseTo(4_000 + 2_000 * 0.75); // la velocità media del passaggio è (0,5 + 1) / 2
    expect(at(15_000) - at(14_000)).toBeCloseTo(1_000);
  });

  it("con il passaggio di colpo la velocità cambia esattamente al tempo scelto", () => {
    expect(rateAt(abrupt, 3_999)).toBe(2);
    expect(rateAt(abrupt, 4_000)).toBe(1);
    expect(songMsAt(abrupt, 6_000)).toBe(2 * 4_000 + 2_000);
  });
});

describe("ovattato a fasi", () => {
  const plan: BlurStagesPlan = { firstMs: 6_000, secondMs: 4_000, transitionMs: 2_000 };

  it("finisce dopo le due fasi e i due passaggi", () => {
    expect(stagesEndMs(plan)).toBe(6_000 + 4_000 + 2 * 2_000);
  });

  it("molto ovattato, poi poco, poi normale (livelli 0, 1, 2)", () => {
    expect(stageLevel(plan, 0)).toBe(0);
    expect(stageLevel(plan, 5_999)).toBeCloseTo(0, 3);
    expect(stageLevel(plan, 8_000)).toBe(1); // fine del primo passaggio
    expect(stageLevel(plan, 11_000)).toBe(1); // dentro la seconda fase
    expect(stageLevel(plan, 12_000)).toBe(1); // fine della seconda fase: comincia il secondo passaggio
    expect(stageLevel(plan, 14_000)).toBe(2);
    expect(stageLevel(plan, 100_000)).toBe(2);
  });

  it("i passaggi sono morbidi: a metà il livello è a metà e i bordi sono piatti", () => {
    expect(stageLevel(plan, 7_000)).toBeCloseTo(0.5);
    expect(stageLevel(plan, 13_000)).toBeCloseTo(1.5);
    expect(stageLevel(plan, 6_100)).toBeLessThan(0.01);
    expect(stageLevel(plan, 7_900)).toBeGreaterThan(0.99);
  });

  it("il livello non scende mai e non fa salti: ogni 10 ms cambia pochissimo", () => {
    let prev = stageLevel(plan, 0);
    for (let t = 0; t <= 16_000; t += 10) {
      const l = stageLevel(plan, t);
      expect(l).toBeGreaterThanOrEqual(prev);
      expect(l - prev).toBeLessThan(0.02);
      prev = l;
    }
  });

  it("con i passaggi a zero il livello cambia di colpo", () => {
    const hard: BlurStagesPlan = { firstMs: 3_000, secondMs: 2_000, transitionMs: 0 };
    expect(stageLevel(hard, 2_999)).toBe(0);
    expect(stageLevel(hard, 3_000)).toBe(1);
    expect(stageLevel(hard, 4_999)).toBe(1);
    expect(stageLevel(hard, 5_000)).toBe(2);
    expect(stagesEndMs(hard)).toBe(5_000);
  });
});

describe("modalità di ascolto di un brano", () => {
  const round = { playback: "continuous" as const, clipSeconds: 30, loopSeconds: [1, 2], loopPauseSeconds: 1 };

  it("senza una scelta propria il brano segue il round", () => {
    expect(resolveListening(round, {})).toMatchObject({ mode: "continuous", clipMs: 30_000, loop: null, rate: null, stages: null });
    expect(resolveListening(round, { playback: "inherit" }).mode).toBe("continuous");
    const loops = resolveListening({ ...round, playback: "loops" }, { playback: "inherit" });
    expect(loops).toMatchObject({ mode: "loops", loop: { snippetsMs: [1_000, 2_000], pauseMs: 1_000 }, clipMs: 3_000 + 2 * 1_000 });
  });

  it("senza round né brano valgono i predefiniti", () => {
    expect(resolveListening({}, {})).toMatchObject({ mode: ROUND_LISTEN_DEFAULTS.playback, clipMs: 30_000 });
  });

  it("ogni brano sceglie la propria modalità, anche contro quella del round", () => {
    const loopRound = { ...round, playback: "loops" as const };
    expect(resolveListening(loopRound, { playback: "continuous", clipSeconds: 12 })).toMatchObject({ mode: "continuous", clipMs: 12_000, loop: null });
    expect(resolveListening(round, { playback: "loops" })).toMatchObject({ mode: "loops", loop: { snippetsMs: [1_000, 2_000] } });
  });

  it("un brano a spezzoni può avere spezzoni e pausa propri; spezzoni vuoti = quelli del round", () => {
    const l = resolveListening(round, { playback: "loops", loopSeconds: [0.5, 0.5, 4], loopPauseSeconds: 2 });
    expect(l.loop).toEqual({ snippetsMs: [500, 500, 4_000], pauseMs: 2_000 });
    expect(l.clipMs).toBe(500 + 500 + 4_000 + 3 * 2_000);
    expect(resolveListening(round, { playback: "loops", loopSeconds: [] }).loop?.snippetsMs).toEqual([1_000, 2_000]);
  });

  it("la durata dell'ascolto è del brano, se la sceglie; negli spezzoni non vale", () => {
    expect(resolveListening(round, { clipSeconds: 8 }).clipMs).toBe(8_000);
    expect(resolveListening(round, { playback: "loops", clipSeconds: 8 }).clipMs).toBe(3_000 + 2 * 1_000);
  });

  it("più lento o più veloce: velocità costante, che non torna normale", () => {
    const l = resolveListening(round, { playback: "speed", speed: 1.5, keepPitch: false });
    expect(l).toMatchObject({ mode: "speed", rate: { rate: 1.5, untilMs: null, transitionMs: 0 }, keepPitch: false, loop: null, stages: null });
    expect(listeningSettledMs(l)).toBeNull();
  });

  it("prima lento poi normale: velocità, istante e passaggio in millisecondi", () => {
    const l = resolveListening(round, { playback: "speed_then_normal", speed: 0.6, normalAfterSeconds: 7.5, speedTransitionSeconds: 1.5 });
    expect(l.rate).toEqual({ rate: 0.6, untilMs: 7_500, transitionMs: 1_500 });
    expect(l.keepPitch).toBe(true);
    expect(listeningSettledMs(l)).toBe(9_000);
  });

  it("ovattato a fasi: durata delle fasi e dei passaggi in millisecondi", () => {
    const l = resolveListening(round, { playback: "blur_stages", stage1Seconds: 5, stage2Seconds: 4, stageTransitionSeconds: 2.5 });
    expect(l.stages).toEqual({ firstMs: 5_000, secondMs: 4_000, transitionMs: 2_500 });
    expect(l.rate).toBeNull();
    expect(listeningSettledMs(l)).toBe(5_000 + 4_000 + 5_000);
  });

  it("i parametri non dati valgono i predefiniti della modalità", () => {
    expect(resolveListening(round, { playback: "speed_then_normal" }).rate).toEqual({ rate: 0.7, untilMs: 8_000, transitionMs: 2_000 });
    expect(resolveListening(round, { playback: "blur_stages" }).stages).toEqual({ firstMs: 8_000, secondMs: 8_000, transitionMs: 3_000 });
  });

  it("le modalità continua e a spezzoni non cambiano il suono nel tempo", () => {
    expect(listeningSettledMs(resolveListening(round, {}))).toBeNull();
    expect(listeningSettledMs(resolveListening(round, { playback: "loops" }))).toBeNull();
  });
});

describe("nitidezza progressiva", () => {
  it("cresce con il tempo e arriva a 1 a fine ascolto", () => {
    expect(clarityAt(0, 30_000)).toBe(0);
    expect(clarityAt(15_000, 30_000)).toBeCloseTo(0.5);
    expect(clarityAt(30_000, 30_000)).toBe(1);
    expect(clarityAt(45_000, 30_000)).toBe(1);
  });

  it("con una percentuale il brano è nitido prima della fine", () => {
    expect(clarityAt(12_000, 30_000, 80)).toBeCloseTo(0.5);
    expect(clarityAt(24_000, 30_000, 80)).toBe(1);
    expect(clarityAt(27_000, 30_000, 80)).toBe(1);
  });
});
