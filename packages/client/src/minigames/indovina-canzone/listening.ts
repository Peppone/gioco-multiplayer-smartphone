import { type Listening, type LoopPosition, type BlurStagesPlan, clarityAt, loopPosition, rateAt, songMsAt, stageLevel, stagesEndMs } from "@gioco/shared";
import type { MusicBackend } from "./backends";
import { cutoffForStage } from "./effects";

/** Ogni quanto si aggiorna la velocità durante il passaggio alla velocità normale (ms). */
export const RATE_STEP_MS = 50;
/** Di quanto (ms) un timer del browser può scattare in anticipo rispetto all'orologio. */
export const TIMER_SLACK_MS = 8;
/** Distanza (ms) tra i punti della curva con cui il filtro segue le fasi. */
export const CURVE_STEP_MS = 50;

/** Frequenze di taglio del filtro da `heardMs` in poi, un punto ogni `stepMs`, fino a quando il suono è tornato normale. Un solo valore = il filtro resta lì. */
export function stagesCurve(plan: BlurStagesPlan, heardMs: number, stepMs = CURVE_STEP_MS): number[] {
  const end = stagesEndMs(plan);
  if (heardMs >= end) return [cutoffForStage(2)];
  const n = Math.ceil((end - heardMs) / stepMs) + 1;
  return Array.from({ length: n }, (_, i) => cutoffForStage(stageLevel(plan, Math.min(end, heardMs + i * stepMs))));
}

/** Cosa fa suonare e come, dal punto di vista di un lettore: tutto in funzione del tempo ascoltato. */
export interface ListeningRun {
  listening: Pick<Listening, "loop" | "rate" | "stages">;
  /** Punto del brano da cui parte l'ascolto (secondi). */
  startSeconds: number;
  /** Tempo ascoltato (ms) alla partenza (o ripartenza) e ora, nella scala di `now`, in cui l'ascolto (ri)parte. */
  offsetMs: number;
  segmentStart: number;
  /** Ora in cui l'ascolto finisce e la musica si ferma; null se non c'è un termine. */
  stopAt: number | null;
  clipMs: number;
  /** Con «Svela gradualmente»: percentuale dell'ascolto a cui l'effetto è sparito; altrimenti null. */
  clearAtPercent: number | null;
  /** L'ora corrente nella scala di `segmentStart` (lo schermo usa l'ora del server, l'editor l'orologio locale). */
  now: () => number;
  /** Negli ascolti a spezzoni: lo spezzone in corso, o null quando non si ascolta più. */
  onLoop?: (position: LoopPosition | null) => void;
}

const clarityOf = (run: Pick<ListeningRun, "clearAtPercent" | "clipMs">, heardMs: number) =>
  run.clearAtPercent === null ? 0 : clarityAt(heardMs, run.clipMs, run.clearAtPercent);

/** La musica è ferma: il suono resta com'era al momento dello stop (nitidezza e frequenza del filtro). */
export function holdListening(b: MusicBackend, run: Pick<ListeningRun, "listening" | "offsetMs" | "clipMs" | "clearAtPercent" | "onLoop">): void {
  b.pause();
  const held = clarityOf(run, run.offsetMs);
  b.setClarity(held, held, 0);
  if (run.listening.stages) b.setCutoffCurve([cutoffForStage(stageLevel(run.listening.stages, run.offsetMs))], CURVE_STEP_MS);
  run.onLoop?.(null);
}

/**
 * Fa suonare il brano come dice la modalità di ascolto: continuo (alla velocità del piano, se c'è), a spezzoni (suona e
 * tace agli istanti del piano) e con il filtro che segue le fasi o la rampa della nitidezza. Restituisce l'annullamento.
 * Tutto dipende dal tempo ascoltato, quindi riprendere a metà dà lo stesso suono di non essersi mai fermati.
 */
export function startListening(b: MusicBackend, run: ListeningRun): () => void {
  const { loop, rate, stages } = run.listening;
  const heardNow = () => run.offsetMs + Math.max(0, run.now() - run.segmentStart);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let ramp: ReturnType<typeof setInterval> | undefined;

  const step = () => {
    let heard = heardNow();
    if (!loop) {
      // La velocità si imposta prima di partire: il brano non comincia a una velocità sbagliata.
      if (rate) b.setRate(rateAt(rate, heard));
      b.playAt(run.startSeconds + songMsAt(rate, heard) / 1000);
      return;
    }
    let pos = loopPosition(loop, heard);
    // Un timer può scattare qualche millisecondo prima del previsto: se al cambio manca pochissimo ci si è già, altrimenti
    // partirebbe uno «spezzone» di un millisecondo (inudibile, ma sbagliato) e il vero cambio salterebbe.
    if (pos.nextChangeMs !== null && pos.nextChangeMs - heard < TIMER_SLACK_MS) {
      heard = pos.nextChangeMs;
      pos = loopPosition(loop, heard);
    }
    run.onLoop?.(pos);
    if (pos.sounding) b.playAt(run.startSeconds + pos.songMs / 1000, pos.nextChangeMs! - heard);
    else {
      b.pause();
      b.cue(run.startSeconds); // il prossimo spezzone riparte dall'inizio senza ritardo
    }
    if (pos.nextChangeMs !== null) timer = setTimeout(step, Math.max(1, run.segmentStart + pos.nextChangeMs - run.offsetMs - run.now()));
  };

  const begin = () => {
    // Negli ascolti a spezzoni il server fissa l'inizio poco nel futuro: si aspetta, così il primo spezzone è intero.
    const early = run.segmentStart - run.now();
    if (early > 0) {
      timer = setTimeout(begin, early);
      return;
    }
    step();
    const heard = heardNow();
    if (run.clearAtPercent !== null) b.setClarity(clarityOf(run, heard), 1, Math.max(0, (run.clipMs * run.clearAtPercent) / 100 - heard));
    if (stages) b.setCutoffCurve(stagesCurve(stages, heard), CURVE_STEP_MS);
    // Il passaggio alla velocità normale: si aggiorna la velocità a piccoli passi finché non è tornata normale.
    if (rate && rate.untilMs !== null && heard < rate.untilMs + rate.transitionMs) {
      const settled = rate.untilMs + rate.transitionMs;
      ramp = setInterval(() => {
        const h = heardNow();
        b.setRate(rateAt(rate, h));
        if (h >= settled) clearInterval(ramp);
      }, RATE_STEP_MS);
    }
  };

  const cancel = b.whenReady(begin);
  const stop = run.stopAt === null ? undefined : setTimeout(() => b.pause(), Math.max(0, run.stopAt - run.now()));
  return () => {
    cancel();
    clearTimeout(timer);
    clearInterval(ramp);
    clearTimeout(stop);
  };
}
