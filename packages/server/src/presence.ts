/** Chi è connesso e con quale latenza. Un giocatore può avere più socket (es. una vecchia connessione ancora aperta). */
export class Presence {
  private sockets = new Map<string, string>(); // socketId → playerId
  private rtt = new Map<string, number>(); // playerId → ms

  attach(socketId: string, playerId: string): void {
    this.sockets.set(socketId, playerId);
  }

  /** Restituisce il giocatore a cui era associato il socket, se c'era. */
  detach(socketId: string): string | undefined {
    const playerId = this.sockets.get(socketId);
    this.sockets.delete(socketId);
    if (playerId && !this.isConnected(playerId)) this.rtt.delete(playerId);
    return playerId;
  }

  playerOf(socketId: string): string | undefined {
    return this.sockets.get(socketId);
  }

  /** Tutti i socket associati a un giocatore, come coppie [socketId, playerId]. */
  entries(): [string, string][] {
    return [...this.sockets.entries()];
  }

  isConnected(playerId: string): boolean {
    for (const id of this.sockets.values()) if (id === playerId) return true;
    return false;
  }

  setRtt(playerId: string, ms: number): void {
    this.rtt.set(playerId, Math.round(ms));
  }

  getRtt(playerId: string): number | null {
    return this.rtt.get(playerId) ?? null;
  }
}
