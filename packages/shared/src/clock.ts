export interface ClockSample {
  rtt: number;
  /** serverTime - clientTime, in ms. */
  offset: number;
}

/**
 * Campione NTP-style: il client invia a `sentAt`, il server risponde con `serverNow`,
 * il client riceve a `receivedAt` (tutti con l'orologio locale tranne `serverNow`).
 * Si assume che la risposta del server sia a metà del viaggio.
 */
export function makeSample(sentAt: number, serverNow: number, receivedAt: number): ClockSample {
  return { rtt: receivedAt - sentAt, offset: serverNow - (sentAt + receivedAt) / 2 };
}

/**
 * Stima l'offset dell'orologio tenendo gli ultimi N campioni e usando quello con RTT minimo
 * (meno asimmetria del percorso = stima più affidabile).
 */
export class ClockSync {
  private samples: ClockSample[] = [];

  constructor(private readonly maxSamples = 8) {}

  add(sample: ClockSample): void {
    if (sample.rtt < 0) return; // orologio locale tornato indietro: scarta
    this.samples.push(sample);
    if (this.samples.length > this.maxSamples) this.samples.shift();
  }

  get best(): ClockSample | null {
    let best: ClockSample | null = null;
    for (const s of this.samples) if (!best || s.rtt < best.rtt) best = s;
    return best;
  }

  get offset(): number {
    return this.best?.offset ?? 0;
  }

  get rtt(): number | null {
    return this.best?.rtt ?? null;
  }

  /** Converte un timestamp locale in "ora server". */
  toServerTime(localTime: number): number {
    return localTime + this.offset;
  }
}
