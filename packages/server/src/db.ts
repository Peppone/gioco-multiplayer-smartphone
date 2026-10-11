import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  nickname: text("nickname").notNull(),
  avatar: text("avatar").notNull(),
  color: text("color").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  pinHash: text("pin_hash").notNull(),
  createdAt: integer("created_at").notNull(),
});

/** Impostazioni chiave/valore (es. hash della password admin). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  emblem: text("emblem").notNull(),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const eventTeams = sqliteTable(
  "event_teams",
  {
    eventId: text("event_id").notNull(),
    teamId: text("team_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.teamId] })],
);

export const eventPlayers = sqliteTable(
  "event_players",
  {
    eventId: text("event_id").notNull(),
    playerId: text("player_id").notNull(),
    teamId: text("team_id"),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.playerId] })],
);

export const matches = sqliteTable("matches", {
  id: text("id").primaryKey(),
  eventId: text("event_id").notNull(),
  order: integer("order").notNull(),
  name: text("name").notNull(),
  status: text("status").notNull(),
  mode: text("mode").notNull(),
  modeConfigJson: text("mode_config_json").notNull(),
});

/** Libreria riutilizzabile: contenuto creato dall'admin per un tipo di minigioco. */
export const minigameInstances = sqliteTable("minigame_instances", {
  id: text("id").primaryKey(),
  typeId: text("type_id").notNull(),
  title: text("title").notNull(),
  theme: text("theme").notNull(),
  configJson: text("config_json").notNull(),
});

export const matchRounds = sqliteTable("match_rounds", {
  id: text("id").primaryKey(),
  matchId: text("match_id").notNull(),
  order: integer("order").notNull(),
  instanceId: text("instance_id").notNull(),
});

/** Registro dei punti: da qui si calcolano classifica individuale e a squadre. */
export const scoreEntries = sqliteTable("score_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: text("event_id").notNull(),
  matchId: text("match_id"),
  roundId: text("round_id"),
  playerId: text("player_id"),
  teamId: text("team_id"),
  points: integer("points").notNull(),
  reason: text("reason").notNull(),
  ts: integer("ts").notNull(),
});

/** Stato della partita in corso, salvato di continuo: se il PC si riavvia la partita riprende. */
export const matchStateSnapshots = sqliteTable("match_state_snapshots", {
  matchId: text("match_id").primaryKey(),
  stateJson: text("state_json").notNull(),
  ts: integer("ts").notNull(),
});

export type PlayerRow = typeof players.$inferSelect;
export type InstanceRow = typeof minigameInstances.$inferSelect;
export type MatchRoundRow = typeof matchRounds.$inferSelect;
export type TeamRow = typeof teams.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type MatchRow = typeof matches.$inferSelect;

/** Apre il database (`:memory:` per i test) e crea le tabelle se mancano. */
export function openDb(file: string) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      avatar TEXT NOT NULL,
      color TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      pin_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS players_nickname_nocase ON players (lower(nickname));
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      emblem TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS teams_name_nocase ON teams (lower(name));
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS event_teams (
      event_id TEXT NOT NULL,
      team_id TEXT NOT NULL,
      PRIMARY KEY (event_id, team_id)
    );
    CREATE TABLE IF NOT EXISTS event_players (
      event_id TEXT NOT NULL,
      player_id TEXT NOT NULL,
      team_id TEXT,
      PRIMARY KEY (event_id, player_id)
    );
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      "order" INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      mode TEXT NOT NULL,
      mode_config_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS minigame_instances (
      id TEXT PRIMARY KEY,
      type_id TEXT NOT NULL,
      title TEXT NOT NULL,
      theme TEXT NOT NULL,
      config_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS match_rounds (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL,
      "order" INTEGER NOT NULL,
      instance_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS score_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL,
      match_id TEXT,
      round_id TEXT,
      player_id TEXT,
      team_id TEXT,
      points INTEGER NOT NULL,
      reason TEXT NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS score_entries_event ON score_entries (event_id);
    CREATE TABLE IF NOT EXISTS match_state_snapshots (
      match_id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      ts INTEGER NOT NULL
    );
  `);
  return { sqlite, db: drizzle(sqlite) };
}

export type Db = ReturnType<typeof openDb>["db"];
