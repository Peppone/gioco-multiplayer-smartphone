/**
 * Cronometri del Game Master: tengono il conto di quanto tempo è passato, anche a intervalli fissi
 * (es. «ogni 5 minuti»). Sono un aiuto per il GM e non arrivano mai a schermo né ai telefoni.
 * Funzioni pure: il tempo arriva sempre da `now` (ora server), mai da `Date.now()`.
 */

export const MAX_TIMERS = 10;

export interface TimerState {
  id: string;
  label: string;
  /** Intervallo fisso in secondi, oppure null per un semplice cronometro. */
  intervalSec: number | null;
  running: boolean;
  /** Ora (server) dell'ultima partenza; valido solo se `running`. */
  startedAt: number;
  /** Millisecondi già trascorsi prima dell'ultima partenza. */
  accumulatedMs: number;
  /** Quanti intervalli interi sono già passati (e segnalati al GM). */
  laps: number;
}

export const elapsedMs = (t: TimerState, now: number): number => t.accumulatedMs + (t.running ? Math.max(0, now - t.startedAt) : 0);

export const lapsAt = (t: TimerState, now: number): number => (t.intervalSec ? Math.floor(elapsedMs(t, now) / (t.intervalSec * 1000)) : 0);

export function newTimer(id: string, label: string, intervalSec: number | null): TimerState {
  return { id, label, intervalSec, running: false, startedAt: 0, accumulatedMs: 0, laps: 0 };
}

export const startTimer = (t: TimerState, now: number): TimerState => (t.running ? t : { ...t, running: true, startedAt: now });

export const pauseTimer = (t: TimerState, now: number): TimerState =>
  t.running ? { ...t, running: false, accumulatedMs: elapsedMs(t, now), startedAt: 0, laps: Math.max(t.laps, lapsAt(t, now)) } : t;

export const resetTimer = (t: TimerState): TimerState => ({ ...t, running: false, startedAt: 0, accumulatedMs: 0, laps: 0 });

/** «12 min 30 s» / «1 h 05 min»: per il diario del GM. */
export function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  if (m > 0) return s > 0 ? `${m} min ${s} s` : `${m} min`;
  return `${s} s`;
}
