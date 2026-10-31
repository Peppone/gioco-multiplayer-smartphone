import { type RatePlan, clarityAt, repetitionClarity, songMsAt } from "@gioco/shared";

// ---- «Svela gradualmente» per i camuffamenti ----
//
// Gli effetti in tempo reale si schiariscono con una rampa sul lettore; i camuffamenti rielaborano i campioni prima, quindi
// la rampa va «cotta» nel file: il brano si divide in tratti, e ogni tratto ha il camuffamento con la quantità che gli
// spetta in base alla nitidezza di quel momento. Vale per l'ascolto continuo (anche a velocità diversa): negli ascolti a
// spezzoni ogni spezzone riparte dall'inizio con un tempo ascoltato diverso, e servirebbe una versione per spezzone.

/** In quanti gradini si schiarisce un camuffamento (0 = pieno, l'ultimo gradino vale 1 - 1/STEPS; poi è l'originale). */
export const REVEAL_STEPS = 8;
/** Ogni quanti secondi del brano si controlla il gradino. */
const SCAN_SECONDS = 0.1;

/** Come si schiarisce il brano: gli stessi dati con cui il lettore schiarisce gli effetti in tempo reale. */
export interface RevealPlan {
  clipMs: number;
  clearAtPercent: number;
  /** Ripetizioni sempre più nitide: ogni spezzone ha una nitidezza fissa (la prima volta la più offuscata, l'ultima l'originale). */
  stepped?: boolean;
}

/** Il tempo ascoltato (ms) a cui il brano è arrivato al punto `songMs` dall'inizio dell'ascolto: l'inverso di `songMsAt`, che non scende mai. */
export function heardAtSong(rate: RatePlan | null, songMs: number, maxMs: number): number {
  if (songMs <= 0) return 0;
  if (songMsAt(rate, maxMs) <= songMs) return maxMs;
  let low = 0;
  let high = maxMs;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (songMsAt(rate, mid) < songMs) low = mid;
    else high = mid;
  }
  return high;
}

/** La nitidezza (0 = camuffamento pieno, 1 = originale) al secondo `songSeconds` del brano, per un ascolto continuo che parte da `startSeconds`. */
export function revealClarity(plan: RevealPlan, rate: RatePlan | null, startSeconds: number): (songSeconds: number) => number {
  const maxMs = Math.max(1, (plan.clipMs * plan.clearAtPercent) / 100);
  return (songSeconds) => clarityAt(heardAtSong(rate, (songSeconds - startSeconds) * 1000, maxMs), plan.clipMs, plan.clearAtPercent);
}

export interface SnippetReveal {
  /** Dove comincia lo spezzone nel brano (s) e quanto dura (s). */
  fromSeconds: number;
  lengthSeconds: number;
  /** Dove comincia lo spezzone nel file preparato (s): gli spezzoni sono messi uno dopo l'altro. */
  offsetSeconds: number;
  /** La nitidezza al secondo del brano, contando il tempo già ascoltato negli spezzoni precedenti e nelle pause. */
  clarity: (songSeconds: number) => number;
}

/**
 * Negli ascolti a spezzoni ogni spezzone riparte dallo stesso punto del brano, ma con un tempo ascoltato diverso: serve una
 * versione per spezzone. Qui il piano di ognuna (il file preparato è la loro successione).
 */
export function snippetReveals(loop: { snippetsMs: readonly number[]; pauseMs: number }, startSeconds: number, plan: RevealPlan): SnippetReveal[] {
  let heardMs = 0;
  let offsetSeconds = 0;
  return loop.snippetsMs.map((durationMs, index, all) => {
    const heardStartMs = heardMs;
    const out: SnippetReveal = {
      fromSeconds: startSeconds,
      lengthSeconds: durationMs / 1000,
      offsetSeconds,
      clarity: plan.stepped
        ? () => repetitionClarity(index, all.length)
        : (songSeconds) => clarityAt(heardStartMs + Math.max(0, songSeconds - startSeconds) * 1000, plan.clipMs, plan.clearAtPercent),
    };
    heardMs += durationMs + loop.pauseMs;
    offsetSeconds += durationMs / 1000;
    return out;
  });
}

export interface RevealRegion {
  /** Secondi del brano. */
  from: number;
  to: number;
  /** Nitidezza del tratto (un multiplo di 1/REVEAL_STEPS, sotto 1). */
  clarity: number;
}

/**
 * I tratti tra `from` e `to` (secondi del brano) in cui il camuffamento ha una nitidezza fissa. Dove il brano è già del
 * tutto nitido non c'è nessun tratto: lì il suono resta l'originale. Il gradino è quello di inizio tratto (mai più nitido del vero).
 */
export function revealRegions(clarity: (songSeconds: number) => number, from: number, to: number, steps = REVEAL_STEPS): RevealRegion[] {
  const regions: RevealRegion[] = [];
  for (let t = from; t < to; t += SCAN_SECONDS) {
    const end = Math.min(to, t + SCAN_SECONDS);
    const step = Math.min(steps, Math.floor(clarity(t) * steps + 1e-9));
    if (step >= steps) continue;
    const last = regions[regions.length - 1];
    if (last && last.clarity === step / steps && last.to === t) last.to = end;
    else regions.push({ from: t, to: end, clarity: step / steps });
  }
  return regions;
}
