import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { AdminError } from "@gioco/shared";
import { type Db, settings } from "./db.js";
import { checkSecret, hashSecret, hashToken } from "./secrets.js";

const PASSWORD_KEY = "admin_password_hash";
const SESSION_MS = 12 * 60 * 60 * 1000;
const MAX_FAILED = 5;
const LOCK_MS = 60_000;

export type AuthResult = { ok: true; token: string } | { ok: false; error: AdminError };

/**
 * Password admin impostata al primo avvio (salvata solo come hash) e sessioni in memoria:
 * un riavvio del server richiede un nuovo login. La password non viene mai registrata nei log.
 */
export class AdminAuth {
  private sessions = new Map<string, number>(); // hash del token → scadenza
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
    const key = hashToken(token);
    const expires = this.sessions.get(key);
    if (expires === undefined) return false;
    if (expires <= this.now()) {
      this.sessions.delete(key);
      return false;
    }
    return true;
  }

  private newSession(): string {
    const token = randomBytes(24).toString("hex");
    this.sessions.set(hashToken(token), this.now() + SESSION_MS);
    return token;
  }
}
