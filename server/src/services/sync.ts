import { getPool } from "../db/remote.js";
import {
  getLatestId,
  insertReadings,
  pruneOldReadings,
  clearAllReadings,
  getSyncFrom,
  setSyncFrom,
  ensureSubscribersExist,
  updateLastLocation,
} from "../db/local.js";
import type { Reading } from "../db/local.js";
import type { RowDataPacket } from "mysql2";
import { decodeLipReportDetailed } from "../utils/lip.js";
import type { LipRejectReason } from "../utils/lip.js";

/* Lazy-load the offline geocoder so a broken/missing package never crashes the sync service */
let getNearestCity: ((lat: number, lon: number) => { cityName?: string; countryName?: string }) | null = null;
import("offline-geocode-city")
  .then((mod) => { getNearestCity = mod.getNearestCity; })
  .catch(() => { /* package unavailable — location features disabled */ });
import { getSettings, isConfigured } from "../db/settings.js";
import logger from "../utils/log.js";

/* Human-readable labels for each LIP rejection reason */
const REJECT_LABELS: Record<LipRejectReason, string> = {
  buffer_too_short: "short buffer",
  unsupported_pdu: "unsupported PDU",
  insufficient_bits: "insufficient bits",
  no_gps_fix: "no fix",
  out_of_range: "out of range",
  low_accuracy: "low accuracy",
};

/* Format a position error value in metres as a compact log label */
const formatMetres = (m: number): string => (m >= 1000 ? `${m / 1000}km` : `${m}m`);

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

    /* Check for a persisted sync-from override (set by cache reset, survives restarts) */
    const syncFrom = getSyncFrom();

    if (latestId) {
      /* Incremental sync — fetch rows with a DbId higher than our latest cached id */
      query = `SELECT DbId, Timestamp, CallingSsi, Rssi, MsDistance, UserData
               FROM sdsdata WHERE ProtocolIdentifier = 10 AND DbId > ?
               ORDER BY DbId ASC LIMIT ?`;
      params = [latestId, settings.syncBatchSize];
    } else if (syncFrom) {
      /* Post-reset sync — only fetch data after the reset timestamp, no backfill */
      query = `SELECT DbId, Timestamp, CallingSsi, Rssi, MsDistance, UserData
               FROM sdsdata WHERE ProtocolIdentifier = 10 AND Timestamp > ?
               ORDER BY DbId ASC LIMIT ?`;
      params = [syncFrom, settings.syncBatchSize];
      setSyncFrom(null);
    } else {
      /* First sync — only fetch data within the retention window */
      query = `SELECT DbId, Timestamp, CallingSsi, Rssi, MsDistance, UserData
               FROM sdsdata WHERE ProtocolIdentifier = 10 AND Timestamp > DATE_SUB(NOW(), INTERVAL ? DAY)
               ORDER BY DbId ASC LIMIT ?`;
      params = [settings.retentionDays, settings.syncBatchSize];
    }

    const [rows] = await pool.query<SdsRow[]>(query, params);

    /* If we were disconnected, restore the normal sync interval */
    if (isDisconnected) {
      logger.info("TetraFlex database connection restored");
      isDisconnected = false;
      setSyncInterval(settings.syncIntervalMs);
    }

    /* Decode LIP PDUs, tally rejections and accuracy distribution */
    if (rows.length > 0) {
      const readings: Reading[] = [];
      const rejectCounts: Record<LipRejectReason, number> = {
        buffer_too_short: 0,
        unsupported_pdu: 0,
        insufficient_bits: 0,
        no_gps_fix: 0,
        out_of_range: 0,
        low_accuracy: 0,
      };
      const accuracyCounts: Record<number, number> = {};

      for (const row of rows) {
        const result = decodeLipReportDetailed(row.UserData);

        if (!result.ok) {
          rejectCounts[result.reason]++;
          continue;
        }

        const lip = result.report;

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

        /* Tally accuracy distribution */
        if (lip.positionError !== null) {
          accuracyCounts[lip.positionError] = (accuracyCounts[lip.positionError] || 0) + 1;
        }
      }

      if (readings.length > 0) {
        insertReadings(readings);

        /* Ensure every SSI seen in this batch has a row in the subscribers table */
        const uniqueSsis = [...new Set(readings.map((r) => r.ssi))];
        ensureSubscribersExist(uniqueSsis);

        /* Pre-compute the last reading location for each SSI in this batch */
        if (getNearestCity) {
          for (const ssi of uniqueSsis) {
            const latest = readings
              .filter((r) => r.ssi === ssi)
              .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
            if (!latest || (latest.latitude === 0 && latest.longitude === 0)) continue;
            try {
              const result = getNearestCity(latest.latitude, latest.longitude);
              if (result?.cityName) {
                const location = result.countryName
                  ? `${result.cityName}, ${result.countryName}`
                  : result.cityName;
                updateLastLocation(ssi, location);
              }
            } catch { /* geocoding failure — leave existing location unchanged */ }
          }
        }
      }

      /* Build the enhanced sync log line */
      const elapsed = Math.round(performance.now() - start);
      const totalRejected = Object.values(rejectCounts).reduce((a, b) => a + b, 0);

      /* Format accuracy distribution: "1x <2m, 1x <20m" or "<2m" when all the same */
      const accuracyParts: string[] = [];
      for (const m of [2, 20, 200, 2000]) {
        const count = accuracyCounts[m];
        if (!count) continue;
        const label = `<${formatMetres(m)}`;
        accuracyParts.push(count === 1 && readings.length === 1 ? label : `${count}x ${label}`);
      }
      const accuracyStr = accuracyParts.length > 0 ? ` (${accuracyParts.join(", ")})` : "";

      /* Format rejection breakdown: "29 no fix, 1 low accuracy" */
      const rejectParts: string[] = [];
      for (const [reason, count] of Object.entries(rejectCounts)) {
        if (count > 0) rejectParts.push(`${count} ${REJECT_LABELS[reason as LipRejectReason]}`);
      }

      const parts = [`${rows.length} LIP fetched`];
      if (readings.length > 0) parts.push(`${readings.length} stored${accuracyStr}`);
      if (totalRejected > 0) parts.push(`${totalRejected} rejected (${rejectParts.join(", ")})`);

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
      /* Non-connection errors (query failures, etc.) keep the full log with stack trace */
      const elapsed = Math.round(performance.now() - start);
      const detail = err instanceof Error ? err.stack ?? err.message : String(err);
      logger.error(
        `Sync failed after ${elapsed}ms (host: ${settings.dbHost}:${settings.dbPort}): ${detail}`
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

/* Clear the local cache and persist a sync override so the next cycle only fetches new data from now */
export const resetSync = (): string => {
  const now = new Date().toISOString();
  const cleared = clearAllReadings();
  setSyncFrom(now);
  logger.info(`Cache reset — cleared ${cleared} readings, syncing from ${now}`);
  return now;
};