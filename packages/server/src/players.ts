import { randomBytes, randomInt, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { CreatePlayerInput, JoinError } from "@gioco/shared";
import { type Db, type PlayerRow, players } from "./db.js";
import { checkSecret, hashSecret, hashToken } from "./secrets.js";

const MAX_FAILED_PINS = 5;
const LOCK_MS = 60_000;

export type PlayerResult =
  | { ok: true; player: PlayerRow; token: string; pin?: string }
  | { ok: false; error: JoinError };

/** Profili senza registrazione: token sul telefono + PIN a 4 cifre per cambiare dispositivo. */
export class PlayerService {
  /** Tentativi di PIN falliti per nickname: dopo 5 errori il recupero si blocca per 60 s. */
  private failures = new Map<string, { count: number; lockedUntil: number }>();

  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  list(): PlayerRow[] {
    return this.db.select().from(players).all();
  }

  create(input: CreatePlayerInput): PlayerResult {
    const taken = this.db
      .select({ id: players.id })
      .from(players)
      .where(sql`lower(${players.nickname}) = lower(${input.nickname})`)
      .get();
    if (taken) return { ok: false, error: "nickname_taken" };

    const token = randomBytes(24).toString("hex");
    const pin = String(randomInt(0, 10_000)).padStart(4, "0");
    const row: PlayerRow = {
      id: randomUUID(),
      nickname: input.nickname,
      avatar: input.avatar,
      color: input.color,
      tokenHash: hashToken(token),
      pinHash: hashSecret(pin),
      createdAt: this.now(),
    };
    this.db.insert(players).values(row).run();
    return { ok: true, player: row, token, pin };
  }

  resume(token: string): PlayerResult {
    const row = this.db.select().from(players).where(eq(players.tokenHash, hashToken(token))).get();
    return row ? { ok: true, player: row, token } : { ok: false, error: "bad_credentials" };
  }

  /** Recupero da un altro telefono: emette un nuovo token e invalida quello vecchio. */
  recover(nickname: string, pin: string): PlayerResult {
    const key = nickname.toLowerCase();
    const state = this.failures.get(key);
    if (state && state.lockedUntil > this.now()) return { ok: false, error: "too_many_attempts" };

    const row = this.db
      .select()
      .from(players)
      .where(sql`lower(${players.nickname}) = ${key}`)
      .get();
    if (!row || !checkSecret(pin, row.pinHash)) {
      const count = (state?.count ?? 0) + 1;
      this.failures.set(
        key,
        count >= MAX_FAILED_PINS
          ? { count: 0, lockedUntil: this.now() + LOCK_MS }
          : { count, lockedUntil: 0 },
      );
      return { ok: false, error: "bad_credentials" };
    }

    this.failures.delete(key);
    const token = randomBytes(24).toString("hex");
    this.db.update(players).set({ tokenHash: hashToken(token) }).where(eq(players.id, row.id)).run();
    return { ok: true, player: row, token };
  }
}
