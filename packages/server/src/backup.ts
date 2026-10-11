import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import type Database from "better-sqlite3";

/** Quante copie del database si tengono (le più vecchie si eliminano). */
export const BACKUPS_KEPT = 15;
/** Se l'ultima copia è più recente di così non se ne fa un'altra: riavvii ravvicinati non cancellano le copie buone. */
export const MIN_BACKUP_GAP_MS = 10 * 60_000;

const NAME = /^gioco-\d{8}-\d{6}\.sqlite$/;

const stamp = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/**
 * Copia di sicurezza del database accanto ad esso (`<cartella dati>/backup/gioco-AAAAMMGG-OOMMSS.sqlite`).
 * Usa il backup di SQLite, che è coerente anche a database aperto. Restituisce il file creato, o `null` se non serviva.
 */
export async function backupDatabase(sqlite: Database.Database, dbFile: string, now = new Date()): Promise<string | null> {
  const dir = join(dirname(dbFile), "backup");
  mkdirSync(dir, { recursive: true });
  const existing = readdirSync(dir).filter((f) => NAME.test(f)).sort();

  const last = existing.at(-1);
  if (last && now.getTime() - statSync(join(dir, last)).mtimeMs < MIN_BACKUP_GAP_MS) return null;

  const file = join(dir, `gioco-${stamp(now)}.sqlite`);
  if (existsSync(file)) return null;
  await sqlite.backup(file);

  for (const old of [...existing, file.slice(dir.length + 1)].sort().slice(0, -BACKUPS_KEPT)) rmSync(join(dir, old), { force: true });
  return file;
}
