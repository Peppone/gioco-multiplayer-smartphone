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

/**
 * Quanto il suono è nitido, da 0 (offuscato del tutto) a 1 (originale), in base al tempo ascoltato. Cresce in modo
 * lineare e arriva a 1 quando è trascorsa la percentuale `clearAtPercent` dell'ascolto: da lì in poi il brano è intero.
 */
export function clarityAt(heardMs: number, clipMs: number, clearAtPercent = 100): number {
  const full = Math.max(1, (clipMs * clearAtPercent) / 100);
  return Math.min(1, Math.max(0, heardMs / full));
}
