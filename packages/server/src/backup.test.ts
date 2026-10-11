import { mkdtempSync, readdirSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BACKUPS_KEPT, MIN_BACKUP_GAP_MS, backupDatabase } from "./backup.js";

describe("copia di sicurezza del database", () => {
  let dir: string;
  let dbFile: string;
  let sqlite: Database.Database;
  const files = () => readdirSync(join(dir, "backup")).sort();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gioco-backup-"));
    dbFile = join(dir, "gioco.sqlite");
    sqlite = new Database(dbFile);
    sqlite.exec("CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('dato importante');");
  });
  afterEach(() => {
    sqlite.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("crea una copia leggibile con i dati dentro", async () => {
    const file = await backupDatabase(sqlite, dbFile, new Date(2026, 9, 11, 21, 0, 0));
    expect(file).toContain("gioco-20261011-210000.sqlite");
    const copy = new Database(file!, { readonly: true });
    expect(copy.prepare("SELECT v FROM t").get()).toEqual({ v: "dato importante" });
    copy.close();
  });

  it("non ne fa un'altra se l'ultima è recentissima", async () => {
    const t = Date.now();
    await backupDatabase(sqlite, dbFile, new Date(t));
    expect(await backupDatabase(sqlite, dbFile, new Date(t + 60_000))).toBeNull();
    expect(files()).toHaveLength(1);
  });

  it("tiene solo le ultime copie", async () => {
    let t = Date.now() - 100 * MIN_BACKUP_GAP_MS;
    for (let i = 0; i < BACKUPS_KEPT + 3; i++) {
      const file = await backupDatabase(sqlite, dbFile, new Date(t));
      expect(file).not.toBeNull();
      utimesSync(file!, new Date(t), new Date(t)); // la data del file segue quella simulata
      t += MIN_BACKUP_GAP_MS + 1_000;
    }
    expect(files()).toHaveLength(BACKUPS_KEPT);
  });
});
