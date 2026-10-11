import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { openDb } from "./db.js";

describe("migrazione del database", () => {
  it("un database creato prima della colonna `pin` la riceve senza perdere i giocatori", () => {
    const dir = mkdtempSync(join(tmpdir(), "gioco-db-"));
    try {
      const file = join(dir, "vecchio.sqlite");
      const old = new Database(file);
      old.exec(`CREATE TABLE players (id TEXT PRIMARY KEY, nickname TEXT NOT NULL, avatar TEXT NOT NULL, color TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE, pin_hash TEXT NOT NULL, created_at INTEGER NOT NULL);
        INSERT INTO players VALUES ('1', 'Resta', '🦊', '#112233', 'th', 'ph', 5);`);
      old.close();

      const { sqlite } = openDb(file);
      expect(sqlite.prepare("SELECT nickname, pin FROM players").all()).toEqual([{ nickname: "Resta", pin: null }]);
      sqlite.close();
      openDb(file).sqlite.close(); // una seconda apertura non rifà la migrazione né dà errore
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
