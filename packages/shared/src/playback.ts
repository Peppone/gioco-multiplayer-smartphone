/**
 * Tempi dell'ascolto del quiz musicale. Funzioni pure del tempo trascorso, usate dal server (durata totale, punti)
 * e dallo schermo (quando far suonare e quando tacere), così i due non possono andare fuori sincronia.
 */

/** Ascolto a spezzoni: lo stesso brano riparte dall'inizio e dura sempre di più, con una pausa fra l'uno e l'altro. */
export interface LoopPlan {
  snippetsMs: number[];
  pauseMs: number;
}

export interface LoopPosition {
  /** Spezzone corrente (o appena finito, durante la pausa). */
  index: number;
  sounding: boolean;
  /** Posizione (ms) nel brano, contata dal punto di partenza: dove suona, o dove si è fermato. */
  songMs: number;
  /** Tempo trascorso (ms) in cui si passa da suono a pausa o viceversa; null dopo l'ultima pausa. */
  nextChangeMs: number | null;
}

/** Durata totale: tutti gli spezzoni, ciascuno seguito dalla sua pausa (l'ultima serve a rispondere). */
export function loopTotalMs(plan: LoopPlan): number {
  return plan.snippetsMs.reduce((sum, d) => sum + d + plan.pauseMs, 0);
}

export function loopPosition(plan: LoopPlan, elapsedMs: number): LoopPosition {
  const elapsed = Math.max(0, elapsedMs);
  let start = 0;
  for (let index = 0; index < plan.snippetsMs.length; index++) {
    const d = plan.snippetsMs[index]!;
    if (elapsed < start + d) return { index, sounding: true, songMs: elapsed - start, nextChangeMs: start + d };
    const end = start + d + plan.pauseMs;
    if (elapsed < end) return { index, sounding: false, songMs: d, nextChangeMs: end };
    start = end;
  }
  const last = plan.snippetsMs.length - 1;
  return { index: Math.max(0, last), sounding: false, songMs: plan.snippetsMs[last] ?? 0, nextChangeMs: null };
}

// ---- Modalità di ascolto per brano ----

/** Come si ascolta un brano. Si sceglie brano per brano; il round fornisce solo il predefinito (continuo o a spezzoni). */
export const PLAYBACK_MODES = ["continuous", "loops", "repeat", "speed", "speed_then_normal", "blur_stages"] as const;
export type PlaybackMode = (typeof PLAYBACK_MODES)[number];

/** Velocità e transizione del brano, in funzione del tempo ascoltato. */
export interface RatePlan {
  /** Velocità di partenza (1 = normale, 0,5 = metà, 2 = doppia). */
  rate: number;
  /** Tempo ascoltato (ms) a cui comincia il ritorno alla velocità normale; null = la velocità non torna normale. */
  untilMs: number | null;
  /** Durata (ms) del passaggio morbido alla velocità normale; 0 = di colpo. */
  transitionMs: number;
}

/** Suono prima molto ovattato, poi poco, poi normale, con passaggi morbidi. */
export interface BlurStagesPlan {
  /** Quanto dura la fase «molto ovattato» (ms). */
  firstMs: number;
  /** Quanto dura la fase «poco ovattato» (ms), transizioni escluse. */
  secondMs: number;
  /** Durata (ms) di ciascuno dei due passaggi; 0 = di colpo. */
  transitionMs: number;
}

/** Cosa fa la modalità di ascolto di un brano, già risolta con i predefiniti del round. */
export interface Listening {
  mode: PlaybackMode;
  /** Durata dell'ascolto (ms): tempo ascoltato, non posizione nel brano. */
  clipMs: number;
  loop: LoopPlan | null;
  /** Ripetizioni sempre più nitide: ogni giro dello stesso spezzone ha una nitidezza fissa, l'ultimo è l'originale. */
  stepped: boolean;
  rate: RatePlan | null;
  /** Con velocità diversa da 1: true = cambia solo il tempo, false = cambia anche l'intonazione (come un disco rallentato). */
  keepPitch: boolean;
  stages: BlurStagesPlan | null;
}

/** Predefiniti del round (valgono per i brani che non scelgono la propria modalità). */
export const ROUND_LISTEN_DEFAULTS = {
  playback: "continuous" as "continuous" | "loops",
  clipSeconds: 30,
  loopSeconds: [0.5, 1, 2, 4, 8],
  loopPauseSeconds: 1.5,
};

/** Predefiniti dei parametri delle nuove modalità. */
export const LISTEN_DEFAULTS = {
  speed: 0.7,
  normalAfterSeconds: 8,
  speedTransitionSeconds: 2,
  keepPitch: true,
  repeatSeconds: 6,
  repeatCount: 5,
  stage1Seconds: 8,
  stage2Seconds: 8,
  stageTransitionSeconds: 3,
};
/** Velocità consentite: fuori da questi limiti il suono non si capisce più (o il browser non le riproduce bene). */
export const SPEED_MIN = 0.5;
export const SPEED_MAX = 2;

export interface RoundListen {
  playback: "continuous" | "loops";
  clipSeconds: number;
  loopSeconds: number[];
  loopPauseSeconds: number;
}

/** Impostazioni di ascolto di un brano: ciò che manca vale il predefinito (del round o della modalità). */
export interface SongListen {
  /** «inherit» (o assente) = la modalità del round. */
  playback?: PlaybackMode | "inherit";
  clipSeconds?: number;
  /** Vuoto o assente = gli spezzoni del round. */
  loopSeconds?: number[];
  loopPauseSeconds?: number;
  /** Ripetizioni: durata dello spezzone e numero di giri (la pausa è `loopPauseSeconds`). */
  repeatSeconds?: number;
  repeatCount?: number;
  speed?: number;
  normalAfterSeconds?: number;
  speedTransitionSeconds?: number;
  keepPitch?: boolean;
  stage1Seconds?: number;
  stage2Seconds?: number;
  stageTransitionSeconds?: number;
}

const toMs = (seconds: number) => Math.round(seconds * 1000);

/** La modalità di ascolto di un brano: la sua, oppure quella del round. Pura: la usano server, schermo ed editor. */
export function resolveListening(round: Partial<RoundListen>, song: SongListen = {}): Listening {
  const base = { ...ROUND_LISTEN_DEFAULTS, ...round };
  const mode: PlaybackMode = song.playback && song.playback !== "inherit" ? song.playback : base.playback;
  const clipMs = toMs(song.clipSeconds ?? base.clipSeconds);
  const none = { loop: null, stepped: false, rate: null, stages: null, keepPitch: true };

  switch (mode) {
    case "repeat": {
      const count = Math.max(1, Math.round(song.repeatCount ?? LISTEN_DEFAULTS.repeatCount));
      const each = toMs(song.repeatSeconds ?? LISTEN_DEFAULTS.repeatSeconds);
      const loop: LoopPlan = { snippetsMs: Array.from({ length: count }, () => each), pauseMs: toMs(song.loopPauseSeconds ?? base.loopPauseSeconds) };
      return { ...none, mode, clipMs: loopTotalMs(loop), loop, stepped: true };
    }
    case "loops": {
      const seconds = song.loopSeconds && song.loopSeconds.length > 0 ? song.loopSeconds : base.loopSeconds;
      const loop: LoopPlan = { snippetsMs: seconds.map(toMs), pauseMs: toMs(song.loopPauseSeconds ?? base.loopPauseSeconds) };
      return { ...none, mode, clipMs: loopTotalMs(loop), loop };
    }
    case "speed":
    case "speed_then_normal": {
      const rate = song.speed ?? LISTEN_DEFAULTS.speed;
      const plan: RatePlan =
        mode === "speed"
          ? { rate, untilMs: null, transitionMs: 0 }
          : {
              rate,
              untilMs: toMs(song.normalAfterSeconds ?? LISTEN_DEFAULTS.normalAfterSeconds),
              transitionMs: toMs(song.speedTransitionSeconds ?? LISTEN_DEFAULTS.speedTransitionSeconds),
            };
      return { ...none, mode, clipMs, rate: plan, keepPitch: song.keepPitch ?? LISTEN_DEFAULTS.keepPitch };
    }
    case "blur_stages":
      return {
        ...none,
        mode,
        clipMs,
        stages: {
          firstMs: toMs(song.stage1Seconds ?? LISTEN_DEFAULTS.stage1Seconds),
          secondMs: toMs(song.stage2Seconds ?? LISTEN_DEFAULTS.stage2Seconds),
          transitionMs: toMs(song.stageTransitionSeconds ?? LISTEN_DEFAULTS.stageTransitionSeconds),
        },
      };
    default:
      return { ...none, mode: "continuous", clipMs };
  }
}

/** 0 prima di `start`, 1 dopo `start + duration`, con un passaggio morbido (senza spigoli) in mezzo; durata 0 = di colpo. */
function ease(t: number, start: number, duration: number): number {
  if (duration <= 0) return t >= start ? 1 : 0;
  const x = Math.min(1, Math.max(0, (t - start) / duration));
  return x * x * (3 - 2 * x);
}

/** Velocità del brano dopo `heardMs` di ascolto. */
export function rateAt(plan: RatePlan, heardMs: number): number {
  if (plan.untilMs === null) return plan.rate;
  return plan.rate + (1 - plan.rate) * ease(heardMs, plan.untilMs, plan.transitionMs);
}

/**
 * Posizione nel brano (ms dal punto di partenza) dopo `heardMs` di ascolto: l'integrale della velocità. Con velocità 1
 * coincide con il tempo ascoltato. Senza piano (`null`) il brano va a velocità normale.
 */
export function songMsAt(plan: RatePlan | null, heardMs: number): number {
  const heard = Math.max(0, heardMs);
  if (!plan) return heard;
  if (plan.untilMs === null) return plan.rate * heard;
  const { rate, untilMs: until, transitionMs: tr } = plan;
  if (heard <= until) return rate * heard;
  let pos = rate * until;
  const over = heard - until;
  if (tr > 0) {
    const x = Math.min(1, over / tr);
    // ∫ della curva morbida 3x²−2x³ da 0 a x vale x³ − x⁴/2
    pos += rate * Math.min(over, tr) + (1 - rate) * tr * (x ** 3 - x ** 4 / 2);
  }
  return pos + Math.max(0, over - tr);
}

/** Tempo ascoltato (ms) a cui la velocità è tornata normale; null se la modalità non cambia velocità o non torna normale. */
export function rateSettledMs(plan: RatePlan): number | null {
  return plan.untilMs === null ? null : plan.untilMs + plan.transitionMs;
}

/** Tempo ascoltato (ms) a cui il suono è tornato normale. */
export function stagesEndMs(plan: BlurStagesPlan): number {
  return plan.firstMs + plan.secondMs + 2 * plan.transitionMs;
}

/**
 * Livello del suono dopo `heardMs`: 0 = molto ovattato, 1 = poco ovattato, 2 = normale; i valori intermedi sono i
 * passaggi morbidi. Il browser lo traduce in una frequenza di taglio del filtro.
 */
export function stageLevel(plan: BlurStagesPlan, heardMs: number): number {
  const secondStart = plan.firstMs + plan.transitionMs + plan.secondMs;
  return ease(heardMs, plan.firstMs, plan.transitionMs) + ease(heardMs, secondStart, plan.transitionMs);
}

/** Quando (ms di ascolto) la modalità ha finito di cambiare il suono, o null se il suono non cambia nel tempo. */
export function listeningSettledMs(l: Listening): number | null {
  if (l.rate) return rateSettledMs(l.rate);
  if (l.stages) return stagesEndMs(l.stages);
  return null;
}

/** Nitidezza del giro `index` (da 0) su `count`: il primo è il più offuscato, l'ultimo l'originale (1). Con un solo giro è l'originale. */
export function repetitionClarity(index: number, count: number): number {
  if (count <= 1) return 1;
  return Math.min(1, Math.max(0, index / (count - 1)));
}

/** Punti di chi risponde durante il giro `index` (da 0) su `count`: da `max` al primo giro a `min` all'ultimo, a gradini uguali. */
export function repetitionPoints(min: number, max: number, index: number, count: number): number {
  if (count <= 1) return max;
  const x = Math.min(1, Math.max(0, index / (count - 1)));
  return Math.round(max - (max - min) * x);
}

/**
 * Quanto il suono è nitido, da 0 (offuscato del tutto) a 1 (originale), in base al tempo ascoltato. Cresce in modo
 * lineare e arriva a 1 quando è trascorsa la percentuale `clearAtPercent` dell'ascolto: da lì in poi il brano è intero.
 */
export function clarityAt(heardMs: number, clipMs: number, clearAtPercent = 100): number {
  const full = Math.max(1, (clipMs * clearAtPercent) / 100);
  return Math.min(1, Math.max(0, heardMs / full));
}
