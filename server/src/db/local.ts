import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, "../../data/rssi.db");

/* Initialise the local SQLite database and create tables if they don't exist */
const db = new Database(DB_PATH);

/* Enable WAL mode for better concurrent read performance */
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS rssi_readings (
    id INTEGER PRIMARY KEY,
    timestamp TEXT NOT NULL,
    node_no INTEGER NOT NULL,
    node_descr TEXT NOT NULL,
    org_id INTEGER NOT NULL,
    org_descr TEXT NOT NULL,
    ssi INTEGER NOT NULL,
    ms_descr TEXT,
    rssi INTEGER,
    ms_distance INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_rssi_timestamp
    ON rssi_readings(timestamp);
`);

/* Get the most recent timestamp in the local cache, or null if empty */
export const getLatestTimestamp = (): string | null => {
  const row = db.prepare(
    "SELECT MAX(timestamp) as latest FROM rssi_readings"
  ).get() as { latest: string | null } | undefined;
  return row?.latest ?? null;
};

/* Batch insert RSSI readings using a transaction for performance */
export const insertReadings = (
  readings: {
    id: number;
    timestamp: string;
    node_no: number;
    node_descr: string;
    org_id: number;
    org_descr: string;
    ssi: number;
    ms_descr: string | null;
    rssi: number | null;
    ms_distance: number | null;
  }[]
) => {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO rssi_readings
      (id, timestamp, node_no, node_descr, org_id, org_descr, ssi, ms_descr, rssi, ms_distance)
    VALUES
      (@id, @timestamp, @node_no, @node_descr, @org_id, @org_descr, @ssi, @ms_descr, @rssi, @ms_distance)
  `);

  const insertMany = db.transaction((rows: typeof readings) => {
    for (const row of rows) {
      insert.run(row);
    }
  });

  insertMany(readings);
};

/* Remove readings older than the configured retention period */
const RETENTION_DAYS = Number(process.env.RETENTION_DAYS) || 5;

export const pruneOldReadings = (): number => {
  const result = db.prepare(
    `DELETE FROM rssi_readings WHERE timestamp < datetime('now', '-${RETENTION_DAYS} days')`
  ).run();
  return result.changes;
};

/* Delete all rows from the local cache */
export const clearAllReadings = (): number => {
  const result = db.prepare("DELETE FROM rssi_readings").run();
  return result.changes;
};

/* Fetch all cached readings, ordered by timestamp descending */
export const getAllReadings = () => {
  return db.prepare(
    "SELECT * FROM rssi_readings ORDER BY timestamp DESC"
  ).all();
};

/* Gracefully close the SQLite database */
export const closeDb = () => {
  db.close();
};

export default db;
