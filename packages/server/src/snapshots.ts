import { eq, ne } from "drizzle-orm";
import { type Db, matchStateSnapshots, matches } from "./db.js";
import type { Engine, EngineSnapshot } from "./engine.js";

export interface RestoreReport {
  restored: string | null;
  /** Partite rimaste «avviate» senza fotografia (es. arresto brusco): chiuse per non lasciarle bloccate. */
  abandoned: string[];
}

/**
 * Salva di continuo lo stato della partita in corso e lo ripristina all'avvio.
 * `sync()` è economico: non fa nulla se l'engine non è cambiato dall'ultimo salvataggio.
 */
export class SnapshotStore {
  private savedVersion = -1;

  constructor(
    private readonly db: Db,
    private readonly engine: Engine,
    private readonly now: () => number = Date.now,
  ) {}

  sync(): void {
    if (this.engine.version === this.savedVersion) return;
    this.savedVersion = this.engine.version;
    const snap = this.engine.snapshot();
    const matchId = this.engine.activeMatchId;
    if (!snap || !matchId) {
      this.db.delete(matchStateSnapshots).run(); // nessuna partita in corso: niente da riprendere
      return;
    }
    const row = { matchId, stateJson: JSON.stringify(snap), ts: this.now() };
    this.db.transaction((tx) => {
      tx.delete(matchStateSnapshots).where(ne(matchStateSnapshots.matchId, matchId)).run();
      tx.insert(matchStateSnapshots).values(row).onConflictDoUpdate({ target: matchStateSnapshots.matchId, set: { stateJson: row.stateJson, ts: row.ts } }).run();
    });
  }

  /** All'avvio: riprende la partita salvata e chiude le partite «avviate» che non si possono riprendere. */
  restoreOnStart(): RestoreReport {
    const report: RestoreReport = { restored: null, abandoned: [] };
    const rows = this.db.select().from(matchStateSnapshots).all().sort((a, b) => b.ts - a.ts);
    for (const row of rows) {
      const match = this.db.select().from(matches).where(eq(matches.id, row.matchId)).get();
      if (report.restored || !match || match.status !== "running") continue;
      try {
        const snap = JSON.parse(row.stateJson) as EngineSnapshot;
        if (snap.v !== 1) continue;
        this.engine.restore(snap);
        report.restored = row.matchId;
      } catch {
        /* fotografia illeggibile: la partita verrà chiusa qui sotto */
      }
    }
    for (const m of this.db.select().from(matches).where(eq(matches.status, "running")).all()) {
      if (m.id === report.restored) continue;
      this.db.update(matches).set({ status: "done" }).where(eq(matches.id, m.id)).run();
      report.abandoned.push(m.id);
    }
    this.db.delete(matchStateSnapshots).where(report.restored ? ne(matchStateSnapshots.matchId, report.restored) : undefined).run();
    this.savedVersion = this.engine.version;
    return report;
  }
}
