import { randomBytes } from "node:crypto";
import { eq, like } from "drizzle-orm";
import type { AdminError } from "@gioco/shared";
import { type Db, settings } from "./db.js";
import { checkSecret, hashSecret, hashToken } from "./secrets.js";

const PASSWORD_KEY = "admin_password_hash";
const SESSION_PREFIX = "admin_session:";
const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_FAILED = 5;
const LOCK_MS = 60_000;

export type AuthResult = { ok: true; token: string } | { ok: false; error: AdminError };

/**
 * Password admin impostata al primo avvio (salvata solo come hash) e sessioni salvate nel database
 * (solo l'hash del token, con la scadenza): un riavvio del server non obbliga a rifare il login.
 * La password non viene mai registrata nei log.
 */
export class AdminAuth {
  private failed = 0;
  private lockedUntil = 0;

  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  private storedHash(): string | undefined {
    return this.db.select().from(settings).where(eq(settings.key, PASSWORD_KEY)).get()?.value;
  }

  isConfigured(): boolean {
    return this.storedHash() !== undefined;
  }

  /**
   * Azzera la sola password della regia (dati e punteggi restano): la prossima apertura di /admin
   * chiede di sceglierne una nuova. Serve se la password è stata dimenticata; si usa da riga di comando.
   */
  reset(): void {
    this.db.delete(settings).where(eq(settings.key, PASSWORD_KEY)).run();
    this.db.delete(settings).where(like(settings.key, `${SESSION_PREFIX}%`)).run();
    this.failed = 0;
    this.lockedUntil = 0;
  }

  /** Prima impostazione della password: consentita una volta sola. */
  setup(password: string): AuthResult {
    if (this.isConfigured()) return { ok: false, error: "already_configured" };
    this.db.insert(settings).values({ key: PASSWORD_KEY, value: hashSecret(password) }).run();
    return { ok: true, token: this.newSession() };
  }

  login(password: string): AuthResult {
    if (this.lockedUntil > this.now()) return { ok: false, error: "too_many_attempts" };
    const stored = this.storedHash();
    if (!stored || !checkSecret(password, stored)) {
      if (++this.failed >= MAX_FAILED) {
        this.failed = 0;
        this.lockedUntil = this.now() + LOCK_MS;
      }
      return { ok: false, error: "bad_credentials" };
    }
    this.failed = 0;
    return { ok: true, token: this.newSession() };
  }

  verify(token: string | undefined): boolean {
    if (!token) return false;
    const key = SESSION_PREFIX + hashToken(token);
    const row = this.db.select().from(settings).where(eq(settings.key, key)).get();
    if (!row) return false;
    if (Number(row.value) <= this.now()) {
      this.db.delete(settings).where(eq(settings.key, key)).run();
      return false;
    }
    return true;
  }

  private newSession(): string {
    // Le sessioni scadute si tolgono man mano, così la tabella non cresce.
    for (const row of this.db.select().from(settings).where(like(settings.key, `${SESSION_PREFIX}%`)).all()) {
      if (Number(row.value) <= this.now()) this.db.delete(settings).where(eq(settings.key, row.key)).run();
    }
    const token = randomBytes(24).toString("hex");
    this.db.insert(settings).values({ key: SESSION_PREFIX + hashToken(token), value: String(this.now() + SESSION_MS) }).run();
    return token;
  }
}
