import { describe, expect, it } from "vitest";
import { BLUR_CUTOFF_HZ, CLEAR_CUTOFF_HZ, blurCutoffHz, distortionCurve, distortionDrive, echoSettings, noVoiceMix, telephoneBand } from "./effects";

describe("quantità degli effetti", () => {
  it("sfocato: 0 non si sente, 100 è il vecchio «sfocato», 165 è il vecchio «molto sfocato», 300 lascia quasi solo il basso", () => {
    expect(blurCutoffHz(0)).toBe(CLEAR_CUTOFF_HZ);
    expect(blurCutoffHz(1)).toBeCloseTo(BLUR_CUTOFF_HZ.blur, 6);
    expect(blurCutoffHz(1.65)).toBeGreaterThan(BLUR_CUTOFF_HZ.heavy_blur * 0.95);
    expect(blurCutoffHz(1.65)).toBeLessThan(BLUR_CUTOFF_HZ.heavy_blur * 1.05);
    expect(blurCutoffHz(3)).toBeCloseTo(60, 6);
  });

  it("più quantità = effetto più forte, senza salti, in tutto l'intervallo 0–300%", () => {
    const strength = {
      blur: (k: number) => -Math.log(blurCutoffHz(k)),
      telephoneLow: (k: number) => -Math.log(telephoneBand(k).lowpassHz),
      telephoneHigh: (k: number) => Math.log(telephoneBand(k).highpassHz),
      // quanto «senza voce» (dosaggio) più quanto basso riaggiunto è stato tolto
      noVoice: (k: number) => noVoiceMix(k).wet + (1 - noVoiceMix(k).bass / 0.8),
      drive: distortionDrive,
      echoWet: (k: number) => echoSettings(k).wet,
      echoFeedback: (k: number) => echoSettings(k).feedback,
    };
    for (const [name, f] of Object.entries(strength)) {
      let last = f(0);
      for (let k = 0.1; k <= 3.001; k += 0.1) {
        const v = f(k);
        expect(v, `${name} a ${Math.round(k * 100)}%`).toBeGreaterThanOrEqual(last - 1e-9);
        last = v;
      }
      expect(f(3), name).toBeGreaterThan(f(1));
    }
  });

  it("l'effetto a quantità 0 non cambia il suono", () => {
    expect(telephoneBand(0)).toMatchObject({ highpassHz: 20, lowpassHz: CLEAR_CUTOFF_HZ, gain: 1 });
    expect(noVoiceMix(0)).toMatchObject({ wet: 0, dry: 1 });
    expect(echoSettings(0)).toEqual({ wet: 0, feedback: 0 });
    expect(distortionDrive(0)).toBe(1);
  });

  it("senza voce: a 100% è quello di prima; oltre si toglie anche il basso riaggiunto", () => {
    expect(noVoiceMix(1)).toEqual({ wet: 1, dry: 0, bass: 0.8 });
    expect(noVoiceMix(2).bass).toBeCloseTo(0.4, 6);
    expect(noVoiceMix(3).bass).toBe(0);
    expect(noVoiceMix(3).wet).toBe(1);
  });

  it("l'eco non si accumula all'infinito: il rinvio resta sotto 1 anche al massimo", () => {
    expect(echoSettings(3).feedback).toBeLessThan(1);
    expect(echoSettings(1).wet).toBeGreaterThan(0);
  });

  it("la curva di saturazione è dispari, normalizzata a ±1 e più piatta con più spinta", () => {
    const soft = distortionCurve(distortionDrive(0.5), 129);
    const hard = distortionCurve(distortionDrive(3), 129);
    for (const c of [soft, hard]) {
      expect(c[0]).toBeCloseTo(-1, 6);
      expect(c[128]).toBeCloseTo(1, 6);
      expect(c[64]).toBeCloseTo(0, 6);
      expect(c[10]! + c[118]!).toBeCloseTo(0, 6);
    }
    // a metà strada tra 0 e il picco il suono saturato è già più vicino al picco
    expect(hard[96]!).toBeGreaterThan(soft[96]!);
  });
});
