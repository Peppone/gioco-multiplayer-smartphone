/** Tolleranza (ms) per errori di stima dell'orologio. */
const CLOCK_MARGIN_MS = 50;

export interface FairTimeInput {
  /** Ora della pressione dichiarata dal client, già convertita in "ora server". */
  claimed: number;
  /** Ora server di arrivo del messaggio. */
  receivedAt: number;
  /** RTT misurato per quel giocatore (null se sconosciuto). */
  rtt: number | null;
  /** Ora server in cui il minigioco ha aperto gli input (es. buzzer armato). */
  openedAt: number;
}

/**
 * Ora "equa" di una pressione. Il timestamp dichiarato dal client è usato solo se plausibile:
 * - non può essere nel futuro rispetto all'arrivo del messaggio;
 * - non può precedere l'arrivo di più della latenza di andata (≤ RTT, più un margine);
 * - non può precedere l'apertura degli input.
 * Un valore fuori dai limiti viene riportato al limite più vicino, non scartato: così un
 * telefono con orologio sballato non può né barare né essere penalizzato oltre il suo ritardo reale.
 */
export function fairTime({ claimed, receivedAt, rtt, openedAt }: FairTimeInput): number {
  const maxOneWay = (rtt ?? 1000) + CLOCK_MARGIN_MS;
  let t = Number.isFinite(claimed) ? claimed : receivedAt;
  t = Math.min(t, receivedAt);
  t = Math.max(t, receivedAt - maxOneWay);
  t = Math.max(t, openedAt);
  return t;
}
