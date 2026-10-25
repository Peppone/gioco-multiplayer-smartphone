import type { AudioEffect } from "@gioco/shared";

/** Frequenza di taglio (Hz) del filtro passa-basso: più è bassa, più il suono è ovattato. */
export const BLUR_CUTOFF_HZ: Record<"blur" | "heavy_blur", number> = { blur: 1_200, heavy_blur: 450 };
/** Compensazione di volume del filtro: da qui a 1 (nessuna) quando il suono diventa nitido. */
export const BLUR_MAKEUP: Record<"blur" | "heavy_blur", number> = { blur: 1.4, heavy_blur: 2.2 };
/** Sotto questa frequenza basso e grancassa sono riaggiunti al "senza voce", altrimenti sparirebbero col centro. */
export const BASS_KEEP_HZ = 140;
/** Con il suono nitido il filtro passa-basso taglia solo ciò che non si sente più. */
export const CLEAR_CUTOFF_HZ = 20_000;

/** Frequenza di taglio con nitidezza `clarity` (0 = effetto pieno, 1 = suono originale): cresce in modo esponenziale, come l'orecchio sente. */
export const cutoffAt = (base: number, clarity: number) => base * (CLEAR_CUTOFF_HZ / base) ** clarity;

/**
 * Frequenza di taglio per un livello dell'ovattato a fasi: 0 = «molto sfocato», 1 = «sfocato», 2 = suono normale. Tra un
 * livello e l'altro la frequenza cresce in modo esponenziale, come l'orecchio sente, quindi un livello a metà strada
 * suona a metà strada.
 */
export function cutoffForStage(level: number): number {
  const l = Math.min(2, Math.max(0, level));
  const [from, to, x] = l <= 1 ? [BLUR_CUTOFF_HZ.heavy_blur, BLUR_CUTOFF_HZ.blur, l] : [BLUR_CUTOFF_HZ.blur, CLEAR_CUTOFF_HZ, l - 1];
  return from * (to / from) ** x;
}

/** Compensazione di volume per una frequenza di taglio: interpola, in scala logaritmica, tra quelle dei due filtri e l'assenza di filtro. */
export function makeupForCutoff(hz: number): number {
  const heavy = BLUR_CUTOFF_HZ.heavy_blur;
  const light = BLUR_CUTOFF_HZ.blur;
  if (hz <= heavy) return BLUR_MAKEUP.heavy_blur;
  const [from, to, gainFrom, gainTo] =
    hz <= light ? [heavy, light, BLUR_MAKEUP.heavy_blur, BLUR_MAKEUP.blur] : [light, CLEAR_CUTOFF_HZ, BLUR_MAKEUP.blur, 1];
  const x = Math.min(1, Math.log(hz / from) / Math.log(to / from));
  return gainFrom + (gainTo - gainFrom) * x;
}

export interface EffectChain {
  /** Scollega tutto. */
  disconnect(): void;
  /**
   * Solo con un filtro passa-basso (sfocato, molto sfocato): segue una curva di frequenze di taglio (Hz), una ogni `stepMs`,
   * a partire da adesso; con un solo valore il filtro si ferma lì. Con gli altri effetti non fa nulla.
   */
  setCutoffCurve(hz: number[], stepMs: number): void;
  /**
   * Porta la nitidezza da `from` a `to` (0 = effetto pieno, 1 = originale) in `durationMs`; con durata 0 il valore è subito `to`.
   * Chiamandola di nuovo si riparte dal punto indicato.
   */
  setClarity(from: number, to: number, durationMs: number): void;
}

/**
 * Collega l'elemento audio alla destinazione applicando l'effetto. Con `setClarity` l'effetto si può attenuare nel tempo
 * fino al suono originale.
 *
 * - `blur` / `heavy_blur`: filtro passa-basso. Le consonanti e gli alti scompaiono, melodia e ritmo restano
 *   ma il brano è meno riconoscibile. Col tempo la frequenza di taglio sale fino a non sentirsi più.
 * - `no_voice`: la voce è quasi sempre incisa al centro (uguale sui due canali), quindi sottraendo il canale
 *   destro dal sinistro si cancella. Cancella anche il resto di ciò che è centrale (basso, cassa), per questo
 *   i bassi si rimettono con un filtro passa-basso. Con brani mono non cancella nulla. Col tempo il suono senza
 *   voce sfuma nel brano originale.
 */
export function connectEffect(ctx: AudioContext, source: AudioNode, effect: AudioEffect): EffectChain {
  const nodes: AudioNode[] = [source];
  const chain = <T extends AudioNode>(node: T): T => {
    nodes.push(node);
    return node;
  };
  /** Porta un parametro da `a` a `b` in `seconds`; `ramp` sceglie la curva (la frequenza sale in modo esponenziale). */
  const sweep = (param: AudioParam, a: number, b: number, seconds: number, ramp: "linear" | "exponential") => {
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(a, now);
    if (seconds <= 0 || a === b) param.setValueAtTime(b, now);
    else if (ramp === "exponential") param.exponentialRampToValueAtTime(b, now + seconds);
    else param.linearRampToValueAtTime(b, now + seconds);
  };

  let setClarity: EffectChain["setClarity"] = () => undefined;
  let setCutoffCurve: EffectChain["setCutoffCurve"] = () => undefined;

  if (effect === "blur" || effect === "heavy_blur") {
    const base = BLUR_CUTOFF_HZ[effect];
    const makeupFrom = BLUR_MAKEUP[effect];
    const lowpass = chain(ctx.createBiquadFilter());
    lowpass.type = "lowpass";
    lowpass.frequency.value = base;
    lowpass.Q.value = 0.5;
    // Il filtro toglie energia: si compensa un po' per non far abbassare il volume.
    const makeup = chain(ctx.createGain());
    makeup.gain.value = makeupFrom;
    source.connect(lowpass);
    lowpass.connect(makeup);
    makeup.connect(ctx.destination);
    setClarity = (from, to, durationMs) => {
      sweep(lowpass.frequency, cutoffAt(base, from), cutoffAt(base, to), durationMs / 1000, "exponential");
      sweep(makeup.gain, makeupFrom + (1 - makeupFrom) * from, makeupFrom + (1 - makeupFrom) * to, durationMs / 1000, "linear");
    };
    setCutoffCurve = (hz, stepMs) => {
      const now = ctx.currentTime;
      const follow = (param: AudioParam, values: number[]) => {
        param.cancelScheduledValues(now);
        if (values.length < 2) param.setValueAtTime(values[0] ?? param.value, now);
        else param.setValueCurveAtTime(Float32Array.from(values), now, ((values.length - 1) * stepMs) / 1000);
      };
      follow(lowpass.frequency, hz);
      follow(makeup.gain, hz.map(makeupForCutoff));
    };
  } else if (effect === "no_voice") {
    const splitter = chain(ctx.createChannelSplitter(2));
    const merger = chain(ctx.createChannelMerger(2));
    const invert = chain(ctx.createGain());
    invert.gain.value = -1;
    const level = chain(ctx.createGain());
    level.gain.value = 1.5;
    source.connect(splitter);
    // sinistro + (−destro), copiato su entrambe le orecchie
    splitter.connect(merger, 0, 0);
    splitter.connect(merger, 0, 1);
    splitter.connect(invert, 1);
    invert.connect(merger, 0, 0);
    invert.connect(merger, 0, 1);
    merger.connect(level);
    // basso e cassa, che stavano al centro e sono stati cancellati
    const bass = chain(ctx.createBiquadFilter());
    bass.type = "lowpass";
    bass.frequency.value = BASS_KEEP_HZ;
    const bassLevel = chain(ctx.createGain());
    bassLevel.gain.value = 0.8;
    source.connect(bass);
    bass.connect(bassLevel);
    // il percorso «senza voce» e quello originale si dosano a vicenda
    const wet = chain(ctx.createGain());
    const dry = chain(ctx.createGain());
    dry.gain.value = 0;
    level.connect(wet);
    bassLevel.connect(wet);
    wet.connect(ctx.destination);
    source.connect(dry);
    dry.connect(ctx.destination);
    setClarity = (from, to, durationMs) => {
      sweep(wet.gain, 1 - from, 1 - to, durationMs / 1000, "linear");
      sweep(dry.gain, from, to, durationMs / 1000, "linear");
    };
  } else {
    source.connect(ctx.destination);
  }

  return { disconnect: () => nodes.forEach((n) => n.disconnect()), setClarity, setCutoffCurve };
}
