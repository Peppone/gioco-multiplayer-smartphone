import type { AudioEffect, EffectSetting } from "@gioco/shared";

/** Frequenza di taglio (Hz) del filtro passa-basso: più è bassa, più il suono è ovattato. */
export const BLUR_CUTOFF_HZ: Record<"blur" | "heavy_blur", number> = { blur: 1_200, heavy_blur: 450 };
/** Compensazione di volume del filtro: da qui a 1 (nessuna) quando il suono diventa nitido. */
export const BLUR_MAKEUP: Record<"blur" | "heavy_blur", number> = { blur: 1.4, heavy_blur: 2.2 };
/** Sotto questa frequenza basso e grancassa sono riaggiunti al "senza voce", altrimenti sparirebbero col centro. */
export const BASS_KEEP_HZ = 140;
/** Con il suono nitido il filtro passa-basso taglia solo ciò che non si sente più. */
export const CLEAR_CUTOFF_HZ = 20_000;
/** Tempo (s) dell'eco tra una ripetizione e l'altra. */
export const ECHO_DELAY_S = 0.32;

/** Frequenza di taglio per un livello dell'ovattato a fasi: 0 = «molto sfocato», 1 = «sfocato», 2 = suono normale. Tra un livello e l'altro la frequenza cresce in modo esponenziale, come l'orecchio sente. */
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

// ---- Quantità degli effetti ----
//
// La quantità `k` è l'intensità in unità: 1 = effetto «pieno» (100%), 0 = nessun effetto, fino a 3 (300%, esteso). Le
// funzioni qui sotto dicono, per ogni effetto, che valore ha ciascun parametro audio con quella quantità. Sono pure,
// così si possono provare senza un contesto audio; lo stesso valore serve a partire e a schiarire il suono col tempo.

type Point = [k: number, value: number];

/** Interpolazione tra punti (k crescente), lineare o logaritmica (per le frequenze); oltre l'ultimo punto resta il suo valore. */
function between(points: Point[], k: number, scale: "linear" | "log"): number {
  if (k <= points[0]![0]) return points[0]![1];
  for (let i = 1; i < points.length; i++) {
    const [k1, v1] = points[i]!;
    if (k <= k1) {
      const [k0, v0] = points[i - 1]!;
      const x = (k - k0) / (k1 - k0);
      return scale === "log" ? v0 * (v1 / v0) ** x : v0 + (v1 - v0) * x;
    }
  }
  return points[points.length - 1]![1];
}

/** Frequenza di taglio dello sfocato: 20 kHz (non si sente) a 0, 1,2 kHz a 1, 60 Hz a 3 (resta quasi solo il basso). */
export const blurCutoffHz = (k: number) => between([[0, CLEAR_CUTOFF_HZ], [1, BLUR_CUTOFF_HZ.blur], [3, 60]], k, "log");

/** Banda del «telefono»: da tutto lo spettro a 300–3400 Hz, poi sempre più stretta (1200–1500 Hz a 3). */
export const telephoneBand = (k: number) => ({
  highpassHz: between([[0, 20], [1, 300], [3, 1_200]], k, "log"),
  lowpassHz: between([[0, CLEAR_CUTOFF_HZ], [1, 3_400], [3, 1_500]], k, "log"),
  /** La banda stretta toglie volume: si compensa. */
  gain: between([[0, 1], [1, 1.6], [3, 2.2]], k, "linear"),
});

/**
 * «Senza voce»: da 0 a 1 si dosa il suono senza voce contro l'originale; oltre 1 (esteso) si toglie anche il basso
 * riaggiunto, che di solito porta con sé un po' di voce.
 */
export const noVoiceMix = (k: number) => {
  const wet = Math.min(1, Math.max(0, k));
  return { wet, dry: 1 - wet, bass: 0.8 * Math.min(1, Math.max(0, 1 - (k - 1) / 2)) };
};

/** Saturazione: quanto si «spinge» il segnale nella curva (1 = quasi nulla, 25 a 300%). */
export const distortionDrive = (amountK: number) => between([[0, 1], [1, 6], [3, 25]], amountK, "linear");

/** Eco: quanto si sente la ripetizione e quanto si rinvia in ingresso (sotto 1, così non si accumula all'infinito). */
export const echoSettings = (k: number) => ({
  wet: between([[0, 0], [1, 0.55], [3, 1]], k, "linear"),
  feedback: between([[0, 0], [1, 0.4], [3, 0.8]], k, "linear"),
});

/** Curva di saturazione morbida (tanh), normalizzata perché il picco resti a 1. */
export function distortionCurve(drive: number, size = 2_048): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(size);
  const norm = Math.tanh(drive);
  for (let i = 0; i < size; i++) curve[i] = Math.tanh(((i / (size - 1)) * 2 - 1) * drive) / norm;
  return curve;
}

export interface EffectChain {
  /** Scollega tutto. */
  disconnect(): void;
  /**
   * Solo se c'è uno sfocato: il filtro segue una curva di frequenze di taglio (Hz), una ogni `stepMs`, a partire da
   * adesso; con un solo valore il filtro si ferma lì. Gli altri effetti non cambiano.
   */
  setCutoffCurve(hz: number[], stepMs: number): void;
  /**
   * Porta la nitidezza da `from` a `to` (0 = effetti pieni, 1 = originale) in `durationMs`; con durata 0 il valore è subito `to`.
   * Chiamandola di nuovo si riparte dal punto indicato.
   */
  setClarity(from: number, to: number, durationMs: number): void;
}

type Ramp = "linear" | "exponential";

/** Un effetto collegato: i parametri audio che cambiano con la quantità e con la nitidezza. */
interface Stage {
  input: AudioNode;
  output: AudioNode;
  nodes: AudioNode[];
  params: AudioParam[];
  ramps: Ramp[];
  /** Valore di ogni parametro con la quantità `amountK` dell'effetto e la nitidezza `clarity` (0 = pieno, 1 = originale). */
  values(amountK: number, clarity: number): number[];
  /** Prepara ciò che dipende dalla quantità scelta e non cambia nel tempo (la curva della saturazione). */
  setup?(amountK: number): void;
  /** Solo lo sfocato: segue una curva di frequenze di taglio. */
  followCutoff?(hz: number[], stepMs: number): void;
}

/** Costruttori dei singoli effetti: ognuno parte dal suo valore pieno (nitidezza 0) e dice come si schiarisce. */
function buildStage(ctx: AudioContext, effect: AudioEffect): Stage {
  const nodes: AudioNode[] = [];
  const make = <T extends AudioNode>(node: T): T => {
    nodes.push(node);
    return node;
  };
  const faded = (amountK: number, clarity: number) => amountK * (1 - clarity);

  switch (effect) {
    case "blur": {
      const lowpass = make(ctx.createBiquadFilter());
      lowpass.type = "lowpass";
      lowpass.Q.value = 0.5;
      // Il filtro toglie energia: si compensa un po' per non far abbassare il volume.
      const makeup = make(ctx.createGain());
      lowpass.connect(makeup);
      return {
        input: lowpass,
        output: makeup,
        nodes,
        params: [lowpass.frequency, makeup.gain],
        ramps: ["exponential", "linear"],
        values: (k, c) => {
          const hz = blurCutoffHz(faded(k, c));
          return [hz, makeupForCutoff(hz)];
        },
        followCutoff(hz, stepMs) {
          const now = ctx.currentTime;
          const follow = (param: AudioParam, values: number[]) => {
            param.cancelScheduledValues(now);
            if (values.length < 2) param.setValueAtTime(values[0] ?? param.value, now);
            else param.setValueCurveAtTime(Float32Array.from(values), now, ((values.length - 1) * stepMs) / 1000);
          };
          follow(lowpass.frequency, hz);
          follow(makeup.gain, hz.map(makeupForCutoff));
        },
      };
    }
    case "no_voice": {
      // La voce è quasi sempre incisa al centro (uguale sui due canali): sottraendo il canale destro dal sinistro si
      // cancella. Cancella anche il resto di ciò che è centrale (basso, cassa), che si rimette con un passa-basso.
      const input = make(ctx.createGain());
      const splitter = make(ctx.createChannelSplitter(2));
      const merger = make(ctx.createChannelMerger(2));
      const invert = make(ctx.createGain());
      invert.gain.value = -1;
      const level = make(ctx.createGain());
      level.gain.value = 1.5;
      input.connect(splitter);
      // sinistro + (−destro), copiato su entrambe le orecchie
      splitter.connect(merger, 0, 0);
      splitter.connect(merger, 0, 1);
      splitter.connect(invert, 1);
      invert.connect(merger, 0, 0);
      invert.connect(merger, 0, 1);
      merger.connect(level);
      const bass = make(ctx.createBiquadFilter());
      bass.type = "lowpass";
      bass.frequency.value = BASS_KEEP_HZ;
      const bassLevel = make(ctx.createGain());
      input.connect(bass);
      bass.connect(bassLevel);
      // il percorso «senza voce» e quello originale si dosano a vicenda
      const wet = make(ctx.createGain());
      const dry = make(ctx.createGain());
      const out = make(ctx.createGain());
      level.connect(wet);
      bassLevel.connect(wet);
      wet.connect(out);
      input.connect(dry);
      dry.connect(out);
      return {
        input,
        output: out,
        nodes,
        params: [wet.gain, dry.gain, bassLevel.gain],
        ramps: ["linear", "linear", "linear"],
        values: (k, c) => {
          const m = noVoiceMix(faded(k, c));
          return [m.wet, m.dry, m.bass];
        },
      };
    }
    case "telephone": {
      const highpass = make(ctx.createBiquadFilter());
      highpass.type = "highpass";
      highpass.Q.value = 0.7;
      const lowpass = make(ctx.createBiquadFilter());
      lowpass.type = "lowpass";
      lowpass.Q.value = 0.7;
      const makeup = make(ctx.createGain());
      highpass.connect(lowpass);
      lowpass.connect(makeup);
      return {
        input: highpass,
        output: makeup,
        nodes,
        params: [highpass.frequency, lowpass.frequency, makeup.gain],
        ramps: ["exponential", "exponential", "linear"],
        values: (k, c) => {
          const b = telephoneBand(faded(k, c));
          return [b.highpassHz, b.lowpassHz, b.gain];
        },
      };
    }
    case "distortion": {
      // La curva si fissa alla quantità scelta; schiarendo si passa dal suono saturato all'originale.
      const input = make(ctx.createGain());
      const shaper = make(ctx.createWaveShaper());
      shaper.oversample = "4x";
      const wet = make(ctx.createGain());
      const dry = make(ctx.createGain());
      const out = make(ctx.createGain());
      input.connect(shaper);
      shaper.connect(wet);
      wet.connect(out);
      input.connect(dry);
      dry.connect(out);
      return {
        input,
        output: out,
        nodes,
        params: [wet.gain, dry.gain],
        ramps: ["linear", "linear"],
        values: (_k, c) => [1 - c, c],
        setup: (k) => void (shaper.curve = distortionCurve(distortionDrive(k))),
      };
    }
    case "echo": {
      const input = make(ctx.createGain());
      const delay = make(ctx.createDelay(1));
      delay.delayTime.value = ECHO_DELAY_S;
      const feedback = make(ctx.createGain());
      const wet = make(ctx.createGain());
      const out = make(ctx.createGain());
      input.connect(out);
      input.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wet);
      wet.connect(out);
      return {
        input,
        output: out,
        nodes,
        params: [wet.gain, feedback.gain],
        ramps: ["linear", "linear"],
        values: (k, c) => {
          const e = echoSettings(faded(k, c));
          return [e.wet, e.feedback];
        },
      };
    }
  }
}

/**
 * Collega la sorgente alla destinazione passando per gli effetti, uno dopo l'altro nell'ordine dell'elenco (l'ordine conta:
 * un'eco dopo la saturazione non suona come prima). Un limitatore in fondo evita che la somma di più effetti sature la
 * scheda audio. Con `setClarity` gli effetti si attenuano nel tempo fino al suono originale; senza effetti la sorgente
 * va dritta alla destinazione.
 */
export function connectEffects(ctx: AudioContext, source: AudioNode, effects: readonly EffectSetting[]): EffectChain {
  const nodes: AudioNode[] = [source];
  if (effects.length === 0) {
    source.connect(ctx.destination);
    return { disconnect: () => source.disconnect(), setClarity: () => undefined, setCutoffCurve: () => undefined };
  }

  /** Porta un parametro da `a` a `b` in `seconds`; `ramp` sceglie la curva (la frequenza sale in modo esponenziale). */
  const sweep = (param: AudioParam, a: number, b: number, seconds: number, ramp: Ramp) => {
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(a, now);
    if (seconds <= 0 || a === b) param.setValueAtTime(b, now);
    else if (ramp === "exponential") param.exponentialRampToValueAtTime(b, now + seconds);
    else param.linearRampToValueAtTime(b, now + seconds);
  };

  const stages = effects.map((e) => {
    const stage = buildStage(ctx, e.type);
    const k = e.amount / 100;
    stage.setup?.(k);
    stage.values(k, 0).forEach((v, i) => (stage.params[i]!.value = v));
    nodes.push(...stage.nodes);
    return { stage, k };
  });
  // Il segnale passa da uno stadio al successivo.
  let previous: AudioNode = source;
  for (const { stage } of stages) {
    previous.connect(stage.input);
    previous = stage.output;
  }
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.1;
  nodes.push(limiter);
  previous.connect(limiter);
  limiter.connect(ctx.destination);

  return {
    disconnect: () => nodes.forEach((n) => n.disconnect()),
    setClarity(from, to, durationMs) {
      for (const { stage, k } of stages) {
        const a = stage.values(k, from);
        const b = stage.values(k, to);
        stage.params.forEach((param, i) => sweep(param, a[i]!, b[i]!, durationMs / 1000, stage.ramps[i]!));
      }
    },
    setCutoffCurve(hz, stepMs) {
      for (const { stage } of stages) stage.followCutoff?.(hz, stepMs);
    },
  };
}
