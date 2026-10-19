/**
 * Porte e pattuglie di «Pilota alla cieca» come funzioni pure del tempo trascorso dall'inizio del livello.
 * Le calcolano allo stesso modo il server (per giudicare i passi) e i telefoni dei navigatori (per mostrarle):
 * nessun cambio di stato per animarle, solo l'orologio sincronizzato.
 */

/** Una porta: aperta a periodi alterni (aperta, chiusa, aperta…). `offset` sfasa le porte tra loro. */
export interface Door {
  cell: number;
  /** Durata di ogni fase (aperta o chiusa), in ms. */
  period: number;
  offset: number;
}

/** Una pattuglia: va avanti e indietro lungo `path` (celle adiacenti), una cella ogni `stepMs`. */
export interface Patrol {
  path: number[];
  stepMs: number;
  offset: number;
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** La porta è aperta dopo `elapsedMs` dall'inizio del livello? Si parte con le fasi pari aperte. */
export function doorOpen(d: Door, elapsedMs: number): boolean {
  return mod(Math.floor((elapsedMs + d.offset) / d.period), 2) === 0;
}

/** Millisecondi che mancano al prossimo cambio di stato della porta (sempre tra 1 e `period`). */
export function doorChangesIn(d: Door, elapsedMs: number): number {
  return d.period - mod(elapsedMs + d.offset, d.period);
}

/** Posizione della pattuglia nel suo percorso (indice di `path`) dopo `elapsedMs`: va e torna, senza saltare. */
export function patrolIndex(p: Patrol, elapsedMs: number): number {
  const n = p.path.length;
  if (n <= 1) return 0;
  const cycle = 2 * (n - 1);
  const k = mod(Math.floor((elapsedMs + p.offset) / p.stepMs), cycle);
  return k < n ? k : cycle - k;
}

/** La cella in cui si trova la pattuglia dopo `elapsedMs`. */
export function patrolCell(p: Patrol, elapsedMs: number): number {
  return p.path[patrolIndex(p, elapsedMs)]!;
}
