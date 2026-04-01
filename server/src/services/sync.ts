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
import { getSettings, isConfigured } from "../db/settings.js";
import logger from "../utils/log.js";

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
  /* Skip sync if credentials are not yet configured */
  if (!isConfigured()) return;

  const pool = getPool();
  if (!pool) return;

  const settings = getSettings();
  const start = performance.now();
  logger.info("Sync started");

  try {
    const latestId = getLatestId();

    /* Build query — only fetch SDS messages with ProtocolIdentifier=10 (LIP) */
    let query: string;
    let params: (string | number)[];

    if (latestId) {
      /* Incremental sync — fetch rows with a DbId higher than our latest cached id */
      query = `SELECT DbId, Timestamp, CallingSsi, Rssi, MsDistance, UserData
               FROM sdsdata WHERE ProtocolIdentifier = 10 AND DbId > ?
               ORDER BY DbId ASC LIMIT ${settings.syncBatchSize}`;
      params = [latestId];
    } else if (syncFromOverride) {
      /* Post-reset sync — only fetch data after the reset timestamp, no backfill */
      query = `SELECT DbId, Timestamp, CallingSsi, Rssi, MsDistance, UserData
               FROM sdsdata WHERE ProtocolIdentifier = 10 AND Timestamp > ?
               ORDER BY DbId ASC LIMIT ${settings.syncBatchSize}`;
      params = [syncFromOverride];
      syncFromOverride = null;
    } else {
      /* First sync — only fetch data within the retention window */
      query = `SELECT DbId, Timestamp, CallingSsi, Rssi, MsDistance, UserData
               FROM sdsdata WHERE ProtocolIdentifier = 10 AND Timestamp > DATE_SUB(NOW(), INTERVAL ${settings.retentionDays} DAY)
               ORDER BY DbId ASC LIMIT ${settings.syncBatchSize}`;
      params = [];
    }

    const [rows] = await pool.query<SdsRow[]>(query, params);

    /* If we were disconnected, restore the normal sync interval */
    if (isDisconnected) {
      logger.info("TetraFlex database connection restored");
      isDisconnected = false;
      setSyncInterval(settings.syncIntervalMs);
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
      const pruned = pruneOldReadings(settings.retentionDays);
      if (pruned > 0) parts.push(`${pruned} pruned`);
      logger.info(`Sync finished — ${parts.join(", ")} (${elapsed}ms)`);
    } else {
      /* Remove data older than the retention period */
      pruneOldReadings(settings.retentionDays);

      const elapsed = Math.round(performance.now() - start);
      logger.info(`Sync finished — no new readings (${elapsed}ms)`);
    }
  } catch (err) {
    const code = (err as { code?: string }).code;

    /* Connection errors get a clean one-liner and a slower retry interval */
    if (code && CONNECTION_ERRORS.has(code)) {
      logger.warn(
        `Cannot reach TetraFlex database (${settings.dbHost}:${settings.dbPort}) — retrying in 5m`
      );
      if (!isDisconnected) {
        isDisconnected = true;
        setSyncInterval(RETRY_INTERVAL_MS);
      }
    } else {
      /* Non-connection errors (query failures, etc.) keep the full log */
      const elapsed = Math.round(performance.now() - start);
      logger.error(
        `Sync failed after ${elapsed}ms (host: ${settings.dbHost}:${settings.dbPort}): ${err}`
      );
    }
  }
};

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
  if (!isConfigured()) {
    logger.info("Sync service not started — database credentials not configured");
    return;
  }

  const intervalMs = getSettings().syncIntervalMs;
  logger.info(`Starting sync service (first sync in ${STARTUP_DELAY_MS / 1000}s, interval: ${intervalMs / 1000}s)`);
  startupTimeout = setTimeout(() => {
    syncReadings();
    syncInterval = setInterval(syncReadings, intervalMs);
  }, STARTUP_DELAY_MS);
};

/* Cancel any pending sync timers (called during graceful shutdown) */
export const stopSync = () => {
  if (startupTimeout) clearTimeout(startupTimeout);
  if (syncInterval) clearInterval(syncInterval);
  startupTimeout = null;
  syncInterval = null;
};

/* Stop the current sync loop and start a new one with the current settings */
export const restartSync = () => {
  stopSync();
  isDisconnected = false;
  const intervalMs = getSettings().syncIntervalMs;
  logger.info(`Restarting sync service (interval: ${intervalMs / 1000}s)`);
  startupTimeout = setTimeout(() => {
    syncReadings();
    syncInterval = setInterval(syncReadings, intervalMs);
  }, STARTUP_DELAY_MS);
};

/* Clear the local cache and set a sync override so the next cycle only fetches new data from now */
export const resetSync = (): string => {
  const now = new Date().toISOString();
  const cleared = clearAllReadings();
  syncFromOverride = now;
  logger.info(`Cache reset — cleared ${cleared} readings, syncing from ${now}`);
  return now;
};