import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { type Db, settings } from "./db.js";
import { hashToken } from "./secrets.js";

const KEY = "master_session";
const SESSION_MS = 12 * 60 * 60 * 1000;

interface Stored {
  hash: string;
  expiresAt: number;
  matchId: string;
}

/**
 * Accesso del Game Master con link limitato: un solo token alla volta, legato a una partita, con scadenza
 * (fine della partita, al massimo 12 h). Il database ne salva solo l'hash, come per le sessioni della regia.
 * Il token vale solo per i comandi del plugin del round in corso: non apre il CRUD né l'engine.
 */
export class MasterAuth {
  private listeners: (() => void)[] = [];

  constructor(
    private readonly db: Db,
    private readonly activeMatchId: () => string | null,
    private readonly now: () => number = Date.now,
  ) {}

  private read(): Stored | null {
    const row = this.db.select().from(settings).where(eq(settings.key, KEY)).get();
    if (!row) return null;
    try {
      return JSON.parse(row.value) as Stored;
    } catch {
      return null;
    }
  }

  /** Emette un nuovo token (il precedente smette di valere e i suoi socket vengono chiusi). */
  issue(matchId: string): { token: string; expiresAt: number } {
    if (this.read()) this.revoke();
    const token = randomBytes(24).toString("hex");
    const expiresAt = this.now() + SESSION_MS;
    const value = JSON.stringify({ hash: hashToken(token), expiresAt, matchId } satisfies Stored);
    this.db.insert(settings).values({ key: KEY, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
    return { token, expiresAt };
  }

  verify(token: string | undefined): boolean {
    if (!token) return false;
    const s = this.read();
    if (!s || s.hash !== hashToken(token)) return false;
    return s.expiresAt > this.now() && s.matchId === this.activeMatchId();
  }

  revoke(): void {
    this.db.delete(settings).where(eq(settings.key, KEY)).run();
    for (const fn of this.listeners) fn();
  }

  /** Chiamata quando il token viene revocato: serve a disconnettere i socket del GM. */
  onRevoke(fn: () => void): void {
    this.listeners.push(fn);
  }
}
