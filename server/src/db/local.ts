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

  /* SSI Register — subscriber metadata imported from the TetraFlex LogServer */
  CREATE TABLE IF NOT EXISTS subscribers (
    ssi INTEGER PRIMARY KEY,
    description TEXT NOT NULL DEFAULT '',
    organisation_id INTEGER,
    organisation TEXT NOT NULL DEFAULT '',
    profile_id INTEGER,
    profile_name TEXT NOT NULL DEFAULT ''
  );
`);

/* Migrations: add columns that may be missing on existing subscribers table */
try { db.exec("ALTER TABLE subscribers ADD COLUMN description TEXT NOT NULL DEFAULT ''"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE subscribers ADD COLUMN organisation_id INTEGER"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE subscribers ADD COLUMN organisation TEXT NOT NULL DEFAULT ''"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE subscribers ADD COLUMN profile_id INTEGER"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE subscribers ADD COLUMN profile_name TEXT NOT NULL DEFAULT ''"); } catch { /* already exists */ }
try { db.exec("ALTER TABLE subscribers ADD COLUMN last_location TEXT NOT NULL DEFAULT ''"); } catch { /* already exists */ }

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

/* ── Subscriber helpers ─────────────────────────────────────────────── */

/* Shape of a subscriber row enriched with aggregated reading statistics */
export interface Subscriber {
  ssi: number;
  description: string;
  organisation_id: number | null;
  organisation: string;
  profile_id: number | null;
  profile_name: string;
  readings_count: number;
  last_reading: string | null;
  last_location: string;
}

/* Return all subscribers joined with per-SSI reading counts and last timestamp */
export const getAllSubscribers = (): Subscriber[] => {
  return db
    .prepare(
      `SELECT s.ssi, s.description, s.organisation_id, s.organisation,
              s.profile_id, s.profile_name,
              COALESCE(r.cnt, 0) AS readings_count,
              r.last_reading,
              s.last_location
       FROM subscribers s
       LEFT JOIN (
         SELECT ssi, COUNT(*) AS cnt, MAX(timestamp) AS last_reading
         FROM readings GROUP BY ssi
       ) r ON s.ssi = r.ssi
       ORDER BY r.cnt DESC, s.ssi ASC`
    )
    .all() as Subscriber[];
};

/* Batch upsert subscriber metadata (used by the Import action) */
export const upsertSubscribers = (
  rows: Omit<Subscriber, "readings_count" | "last_reading" | "last_location">[]
): void => {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO subscribers
      (ssi, description, organisation_id, organisation, profile_id, profile_name)
    VALUES
      (@ssi, @description, @organisation_id, @organisation, @profile_id, @profile_name)
  `);

  const insertMany = db.transaction(
    (items: Omit<Subscriber, "readings_count" | "last_reading" | "last_location">[]) => {
      for (const item of items) stmt.run(item);
    }
  );

  insertMany(rows);
};

/* Ensure a minimal subscriber row exists for each SSI (INSERT OR IGNORE) */
export const ensureSubscribersExist = (ssiList: number[]): void => {
  const stmt = db.prepare("INSERT OR IGNORE INTO subscribers (ssi) VALUES (?)");

  const insertMany = db.transaction((items: number[]) => {
    for (const ssi of items) stmt.run(ssi);
  });

  insertMany(ssiList);
};

/* Find subscribers that have readings but no pre-computed location */
export const getSubscribersMissingLocation = (): { ssi: number; latitude: number; longitude: number }[] => {
  return db
    .prepare(
      `SELECT s.ssi, r.latitude, r.longitude
       FROM subscribers s
       INNER JOIN (
         SELECT ssi, MAX(timestamp) AS last_reading, latitude, longitude
         FROM readings GROUP BY ssi
       ) r ON s.ssi = r.ssi
       WHERE s.last_location = ''
         AND r.latitude IS NOT NULL
         AND NOT (r.latitude = 0 AND r.longitude = 0)`
    )
    .all() as { ssi: number; latitude: number; longitude: number }[];
};

/* Update the pre-computed last location string for a subscriber */
export const updateLastLocation = (ssi: number, location: string): void => {
  db.prepare("UPDATE subscribers SET last_location = ? WHERE ssi = ?").run(
    location,
    ssi
  );
};

/* Remove all subscriber rows from the local database */
export const clearSubscribers = (): number => {
  return db.prepare("DELETE FROM subscribers").run().changes;
};

/* Gracefully close the SQLite database */
export const closeDb = () => {
  db.close();
};

export default db;
