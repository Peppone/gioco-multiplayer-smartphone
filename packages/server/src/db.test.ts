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

  it("le partite in modalità duello diventano classiche con un round-duello, senza gli sfidanti", () => {
    const dir = mkdtempSync(join(tmpdir(), "gioco-db-"));
    try {
      const file = join(dir, "duello.sqlite");
      const first = openDb(file).sqlite;
      first.exec(`INSERT INTO matches VALUES ('m1', 'e1', 1, 'Finale', 'pending', 'knight-duel', '{"kind":"teams","sideA":"t1","sideB":"t2","pool":["q1"],"hp":15}');
        INSERT INTO matches VALUES ('m2', 'e1', 2, 'Vuoto', 'pending', 'knight-duel', '{}');
        INSERT INTO matches VALUES ('m3', 'e1', 3, 'Quiz', 'pending', 'classic', '{}');`);
      first.close();

      const { sqlite } = openDb(file);
      expect(sqlite.prepare("SELECT id, mode, mode_config_json FROM matches ORDER BY id").all()).toEqual([
        { id: "m1", mode: "classic", mode_config_json: "{}" },
        { id: "m2", mode: "classic", mode_config_json: "{}" },
        { id: "m3", mode: "classic", mode_config_json: "{}" },
      ]);
      const rounds = sqlite.prepare("SELECT r.match_id, i.type_id, i.title, i.config_json FROM match_rounds r JOIN minigame_instances i ON i.id = r.instance_id").all() as { match_id: string; type_id: string; title: string; config_json: string }[];
      expect(rounds).toHaveLength(1); // la partita senza configurazione resta senza round
      expect(rounds[0]).toMatchObject({ match_id: "m1", type_id: "knight-duel", title: "Duello: Finale" });
      expect(JSON.parse(rounds[0]!.config_json)).toEqual({ kind: "teams", pool: ["q1"], hp: 15 });
      sqlite.close();
      const again = openDb(file).sqlite; // una seconda apertura non duplica nulla
      expect(again.prepare("SELECT count(*) AS n FROM match_rounds").get()).toEqual({ n: 1 });
      again.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
