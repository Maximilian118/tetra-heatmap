import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../../data/rssi.db");

/* Initialise the local SQLite database and create tables if they don't exist */
const db = new Database(DB_PATH);

/* Enable WAL mode for better concurrent read performance */
db.pragma("journal_mode = WAL");

/* Drop the old schema if it exists (from when we synced msrssilog) */
db.exec(`DROP TABLE IF EXISTS rssi_readings`);

db.exec(`
  CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY,
    timestamp TEXT NOT NULL,
    ssi INTEGER NOT NULL,
    rssi INTEGER,
    ms_distance INTEGER,
    latitude REAL,
    longitude REAL,
    position_error INTEGER,
    velocity REAL,
    direction INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_readings_timestamp
    ON readings(timestamp);

  /* Single-row table to persist sync metadata across restarts */
  CREATE TABLE IF NOT EXISTS sync_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    sync_from TEXT
  );
`);

/* Reading shape matching the sdsdata + LIP decoded fields */
export interface Reading {
  id: number;
  timestamp: string;
  ssi: number;
  rssi: number | null;
  ms_distance: number | null;
  latitude: number;
  longitude: number;
  position_error: number | null;
  velocity: number | null;
  direction: number | null;
}

/* Get the highest DbId in the local cache, or null if empty */
export const getLatestId = (): number | null => {
  const row = db.prepare(
    "SELECT MAX(id) as latest FROM readings"
  ).get() as { latest: number | null } | undefined;
  return row?.latest ?? null;
};

/* Batch insert readings using a transaction for performance */
export const insertReadings = (readings: Reading[]) => {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO readings
      (id, timestamp, ssi, rssi, ms_distance, latitude, longitude, position_error, velocity, direction)
    VALUES
      (@id, @timestamp, @ssi, @rssi, @ms_distance, @latitude, @longitude, @position_error, @velocity, @direction)
  `);

  const insertMany = db.transaction((rows: Reading[]) => {
    for (const row of rows) {
      insert.run(row);
    }
  });

  insertMany(readings);
};

/* Remove readings older than the specified retention period */
export const pruneOldReadings = (retentionDays: number): number => {
  const result = db.prepare(
    "DELETE FROM readings WHERE timestamp < datetime('now', '-' || ? || ' days')"
  ).run(retentionDays);
  return result.changes;
};

/* Delete all rows from the local cache */
export const clearAllReadings = (): number => {
  const result = db.prepare("DELETE FROM readings").run();
  return result.changes;
};

/* Fetch all cached readings, ordered by timestamp descending */
export const getAllReadings = () => {
  return db.prepare(
    "SELECT * FROM readings ORDER BY timestamp DESC"
  ).all();
};

/* Get the persisted sync-from override timestamp, or null if not set */
export const getSyncFrom = (): string | null => {
  const row = db.prepare("SELECT sync_from FROM sync_meta WHERE id = 1").get() as
    | { sync_from: string | null }
    | undefined;
  return row?.sync_from ?? null;
};

/* Persist a sync-from override timestamp (survives server restarts) */
export const setSyncFrom = (iso: string | null): void => {
  db.prepare(
    "INSERT OR REPLACE INTO sync_meta (id, sync_from) VALUES (1, ?)"
  ).run(iso);
};

/* Gracefully close the SQLite database */
export const closeDb = () => {
  db.close();
};

export default db;
