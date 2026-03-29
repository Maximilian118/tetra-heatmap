import { getPool } from "../db/remote.js";
import {
  getLatestId,
  insertReadings,
  pruneOldReadings,
  clearAllReadings,
} from "../db/local.js";
import type { Reading } from "../db/local.js";
import type { RowDataPacket } from "mysql2";
import { decodeLipReport } from "../utils/lip.js";

/* Retention period in days, configurable via env var (default: 5) */
const RETENTION_DAYS = Number(process.env.RETENTION_DAYS) || 5;

/* Maximum rows to fetch per sync batch, configurable via env var (default: 10000) */
const SYNC_BATCH_SIZE = Number(process.env.SYNC_BATCH_SIZE) || 10_000;

/* When set, the next empty-DB sync will fetch only data after this timestamp instead of backfilling */
let syncFromOverride: string | null = null;

/* Tracks whether the last sync failed due to a connection error */
let isDisconnected = false;

/* Connection error codes that indicate the database is unreachable */
const CONNECTION_ERRORS = new Set([
  "ETIMEDOUT",
  "ECONNREFUSED",
  "ECONNRESET",
  "PROTOCOL_CONNECTION_LOST",
]);

/* Shape of a row from the remote sdsdata table (LIP messages only) */
interface SdsRow extends RowDataPacket {
  DbId: number;
  Timestamp: string;
  CallingSsi: number;
  Rssi: number | null;
  MsDistance: number | null;
  UserData: Buffer;
}

/* Fetch new LIP readings from the remote TetraFlex database and store them locally */
const syncReadings = async () => {
  const start = performance.now();
  console.log("[sync] Sync started");

  try {
    const latestId = getLatestId();

    /* Build query — only fetch SDS messages with ProtocolIdentifier=10 (LIP) */
    let query: string;
    let params: (string | number)[];

    if (latestId) {
      /* Incremental sync — fetch rows with a DbId higher than our latest cached id */
      query = `SELECT DbId, Timestamp, CallingSsi, Rssi, MsDistance, UserData
               FROM sdsdata WHERE ProtocolIdentifier = 10 AND DbId > ?
               ORDER BY DbId ASC LIMIT ${SYNC_BATCH_SIZE}`;
      params = [latestId];
    } else if (syncFromOverride) {
      /* Post-reset sync — only fetch data after the reset timestamp, no backfill */
      query = `SELECT DbId, Timestamp, CallingSsi, Rssi, MsDistance, UserData
               FROM sdsdata WHERE ProtocolIdentifier = 10 AND Timestamp > ?
               ORDER BY DbId ASC LIMIT ${SYNC_BATCH_SIZE}`;
      params = [syncFromOverride];
      syncFromOverride = null;
    } else {
      /* First sync — only fetch data within the retention window */
      query = `SELECT DbId, Timestamp, CallingSsi, Rssi, MsDistance, UserData
               FROM sdsdata WHERE ProtocolIdentifier = 10 AND Timestamp > DATE_SUB(NOW(), INTERVAL ${RETENTION_DAYS} DAY)
               ORDER BY DbId ASC LIMIT ${SYNC_BATCH_SIZE}`;
      params = [];
    }

    const [rows] = await getPool().query<SdsRow[]>(query, params);

    /* If we were disconnected, restore the normal sync interval */
    if (isDisconnected) {
      console.log("[sync] TetraFlex database connection restored");
      isDisconnected = false;
      setSyncInterval(SYNC_INTERVAL_MS);
    }

    /* Decode LIP PDUs and filter out rows with no GPS fix */
    if (rows.length > 0) {
      const readings: Reading[] = [];

      for (const row of rows) {
        const lip = decodeLipReport(row.UserData);
        if (!lip) continue;

        readings.push({
          id: row.DbId,
          timestamp: new Date(row.Timestamp).toISOString(),
          ssi: row.CallingSsi,
          rssi: row.Rssi,
          ms_distance: row.MsDistance,
          latitude: lip.latitude,
          longitude: lip.longitude,
          position_error: lip.positionError,
          velocity: lip.velocity,
          direction: lip.direction,
        });
      }

      if (readings.length > 0) {
        insertReadings(readings);
      }

      /* Log how many rows had valid GPS vs total fetched */
      const elapsed = Math.round(performance.now() - start);
      const parts = [`${rows.length} LIP messages fetched`];
      if (readings.length < rows.length) {
        parts.push(`${readings.length} with GPS fix`);
      }
      const pruned = pruneOldReadings();
      if (pruned > 0) parts.push(`${pruned} pruned`);
      console.log(`[sync] Sync finished — ${parts.join(", ")} (${elapsed}ms)`);
    } else {
      /* Remove data older than the retention period */
      pruneOldReadings();

      const elapsed = Math.round(performance.now() - start);
      console.log(`[sync] Sync finished — no new readings (${elapsed}ms)`);
    }
  } catch (err) {
    const code = (err as { code?: string }).code;

    /* Connection errors get a clean one-liner and a slower retry interval */
    if (code && CONNECTION_ERRORS.has(code)) {
      console.warn(
        `[sync] Cannot reach TetraFlex database (${process.env.DB_HOST}:${process.env.DB_PORT}) — retrying in 5m`
      );
      if (!isDisconnected) {
        isDisconnected = true;
        setSyncInterval(RETRY_INTERVAL_MS);
      }
    } else {
      /* Non-connection errors (query failures, etc.) keep the full log */
      const elapsed = Math.round(performance.now() - start);
      console.error(
        `[sync] Sync failed after ${elapsed}ms (host: ${process.env.DB_HOST}:${process.env.DB_PORT}):`,
        err
      );
    }
  }
};

/* Sync interval in milliseconds, configurable via env var (default: 60s) */
const SYNC_INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS) || 60_000;

/* Retry interval when the database is unreachable (5 minutes) */
const RETRY_INTERVAL_MS = 5 * 60_000;

/* Delay before first sync — prevents MySQL connections during rapid tsx watch restarts */
const STARTUP_DELAY_MS = 3_000;

/* Timer handles so we can cancel them on shutdown */
let startupTimeout: ReturnType<typeof setTimeout> | null = null;
let syncInterval: ReturnType<typeof setInterval> | null = null;

/* Replace the current sync interval with a new one */
const setSyncInterval = (ms: number) => {
  if (syncInterval) clearInterval(syncInterval);
  syncInterval = setInterval(syncReadings, ms);
};

/* Start the sync loop — waits 3s before first sync then runs on the configured interval */
export const startSync = () => {
  console.log(`[sync] Starting sync service (first sync in ${STARTUP_DELAY_MS / 1000}s, interval: ${SYNC_INTERVAL_MS / 1000}s)`);
  startupTimeout = setTimeout(() => {
    syncReadings();
    syncInterval = setInterval(syncReadings, SYNC_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
};

/* Cancel any pending sync timers (called during graceful shutdown) */
export const stopSync = () => {
  if (startupTimeout) clearTimeout(startupTimeout);
  if (syncInterval) clearInterval(syncInterval);
};

/* Clear the local cache and set a sync override so the next cycle only fetches new data from now */
export const resetSync = (): string => {
  const now = new Date().toISOString();
  const cleared = clearAllReadings();
  syncFromOverride = now;
  console.log(`[sync] Cache reset — cleared ${cleared} readings, syncing from ${now}`);
  return now;
};
