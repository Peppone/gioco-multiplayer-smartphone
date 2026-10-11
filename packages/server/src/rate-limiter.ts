/** Finestra scorrevole: al massimo `limit` eventi per chiave negli ultimi `windowMs` millisecondi. */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /** Libera la memoria di chi non invia da un po'. */
  forget(key: string): void {
    this.hits.delete(key);
  }
}
