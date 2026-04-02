import db from "./local.js";

/* Shape of the persisted database and sync configuration */
export interface Settings {
  dbHost: string;
  dbPort: number;
  dbUser: string;
  dbPassword: string;
  dbName: string;
  syncIntervalMs: number;
  syncBatchSize: number;
  retentionDays: number;
}

/* Validation limits to prevent excessive load on the logserver */
export const SYNC_INTERVAL_MIN = 5000;
export const SYNC_BATCH_MAX = 50000;
export const RETENTION_DAYS_MIN = 1;

/* Sensible defaults for a fresh deployment with no saved settings */
export const DEFAULT_SETTINGS: Settings = {
  dbHost: "",
  dbPort: 3306,
  dbUser: "",
  dbPassword: "",
  dbName: "tetraflexlogdb",
  syncIntervalMs: 60000,
  syncBatchSize: 10000,
  retentionDays: 5,
};

/* Create the settings table — single-row design enforced by CHECK constraint */
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    db_host TEXT NOT NULL DEFAULT '',
    db_port INTEGER NOT NULL DEFAULT 3306,
    db_user TEXT NOT NULL DEFAULT '',
    db_password TEXT NOT NULL DEFAULT '',
    db_name TEXT NOT NULL DEFAULT 'tetraflexlogdb',
    sync_interval_ms INTEGER NOT NULL DEFAULT 60000,
    sync_batch_size INTEGER NOT NULL DEFAULT 10000,
    retention_days INTEGER NOT NULL DEFAULT 5
  )
`);

/* Prepared statements for reading and writing settings */
const selectStmt = db.prepare("SELECT * FROM settings WHERE id = 1");
const upsertStmt = db.prepare(`
  INSERT OR REPLACE INTO settings
    (id, db_host, db_port, db_user, db_password, db_name, sync_interval_ms, sync_batch_size, retention_days)
  VALUES
    (1, @dbHost, @dbPort, @dbUser, @dbPassword, @dbName, @syncIntervalMs, @syncBatchSize, @retentionDays)
`);

/* Map a database row to the Settings interface */
interface SettingsRow {
  db_host: string;
  db_port: number;
  db_user: string;
  db_password: string;
  db_name: string;
  sync_interval_ms: number;
  sync_batch_size: number;
  retention_days: number;
}

const rowToSettings = (row: SettingsRow): Settings => ({
  dbHost: row.db_host,
  dbPort: row.db_port,
  dbUser: row.db_user,
  dbPassword: row.db_password,
  dbName: row.db_name,
  syncIntervalMs: row.sync_interval_ms,
  syncBatchSize: row.sync_batch_size,
  retentionDays: row.retention_days,
});

/* Read settings from the database, returning defaults if no row exists */
export const getSettings = (): Settings => {
  const row = selectStmt.get() as SettingsRow | undefined;
  return row ? rowToSettings(row) : { ...DEFAULT_SETTINGS };
};

/* Returns true if credentials have been configured (host and user are non-empty) */
export const isConfigured = (): boolean => {
  const s = getSettings();
  return s.dbHost.trim() !== "" && s.dbUser.trim() !== "";
};

/* Persist settings to the database (upsert via INSERT OR REPLACE) */
export const saveSettings = (s: Settings): void => {
  upsertStmt.run(s);
};

/* Return settings with password masked for client consumption */
export const getSafeSettings = (): Settings => {
  const s = getSettings();
  return {
    ...s,
    dbPassword: s.dbPassword ? "********" : "",
  };
};

/* Coerce incoming fields to their expected types (guards against untyped JSON bodies) */
export const coerceSettings = (raw: Record<string, unknown>): Settings => ({
  dbHost: String(raw.dbHost ?? ""),
  dbPort: Number(raw.dbPort),
  dbUser: String(raw.dbUser ?? ""),
  dbPassword: String(raw.dbPassword ?? ""),
  dbName: String(raw.dbName ?? ""),
  syncIntervalMs: Number(raw.syncIntervalMs),
  syncBatchSize: Number(raw.syncBatchSize),
  retentionDays: Number(raw.retentionDays),
});

/* Check that a value is a finite integer (rejects NaN, Infinity, floats) */
const isInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && Number.isInteger(v);

/* Validate settings and return an array of error messages (empty = valid) */
export const validateSettings = (s: Settings): string[] => {
  const errors: string[] = [];
  if (!s.dbHost.trim()) errors.push("DB host is required");
  if (!s.dbUser.trim()) errors.push("DB user is required");
  if (!isInt(s.dbPort) || s.dbPort < 1 || s.dbPort > 65535)
    errors.push("DB port must be an integer 1–65535");
  if (!isInt(s.syncIntervalMs) || s.syncIntervalMs < SYNC_INTERVAL_MIN)
    errors.push(`Sync interval must be an integer of at least ${SYNC_INTERVAL_MIN}ms`);
  if (!isInt(s.syncBatchSize) || s.syncBatchSize < 1 || s.syncBatchSize > SYNC_BATCH_MAX)
    errors.push(`Batch size must be an integer 1–${SYNC_BATCH_MAX}`);
  if (!isInt(s.retentionDays) || s.retentionDays < RETENTION_DAYS_MIN)
    errors.push(`Retention must be an integer of at least ${RETENTION_DAYS_MIN} day`);
  return errors;
};
