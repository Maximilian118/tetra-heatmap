import type { Reading } from "./api";

/* Format a GPS position error in metres as a human-readable accuracy label */
export const formatAccuracy = (metres: number | null): string => {
  if (metres === null) return "Unknown";
  if (metres >= 1000) return `< ${metres / 1000}km`;
  return `< ${metres}m`;
};

/* ── Timezone-aware timestamp formatting ────────────────────────────── */

/* Recover the raw MySQL server time from a stored ISO timestamp and
   format it in the server's timezone. The clockOffsetMs and tzOffsetHours
   values come from the /rssi API response. */
export const formatServerTime = (
  iso: string,
  clockOffsetMs: number,
  serverTzOffsetHours: number,
): string => {
  const stored = new Date(iso).getTime();
  const rawMysqlEpoch = stored + clockOffsetMs + serverTzOffsetHours * 3_600_000;
  return new Date(rawMysqlEpoch).toLocaleString("en-GB", { timeZone: "UTC" });
};

/* Format a timezone label with the local offset, e.g. "UTC -4" or "UTC (+2) -6".
   The local offset tells the user how many hours to add to get their local time.
   When server and browser are in the same timezone, no offset is shown. */
export const formatTzLabel = (serverTzOffsetHours: number): string => {
  const browserOffsetHours = -new Date().getTimezoneOffset() / 60;
  const diff = browserOffsetHours - serverTzOffsetHours;
  const serverLabel = serverTzOffsetHours === 0
    ? "UTC"
    : `UTC (${serverTzOffsetHours > 0 ? "+" : ""}${serverTzOffsetHours})`;
  if (diff === 0) return serverLabel;
  const diffSign = diff > 0 ? "+" : "";
  return `${serverLabel} ${diffSign}${diff}`;
};

/* ── Reading summary ────────────────────────────────────────────────── */

/* Format a Date as DD/MM/YY */
const toShortDate = (d: Date): string => {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

/* Format a timestamp epoch in the MySQL server's timezone as HH:MM:SS */
const toServerTime = (epoch: number, clockOffsetMs: number, serverTzOffsetHours: number): string => {
  const raw = epoch + clockOffsetMs + serverTzOffsetHours * 3_600_000;
  return new Date(raw).toLocaleTimeString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

/**
 * Single-line summary combining count and time coverage.
 * clockOffsetMs adjusts the "Today" age check so shifted timestamps
 * don't break the date-vs-time display heuristic.
 */
export const formatReadingSummary = (
  readings: Reading[],
  clockOffsetMs = 0,
  serverTzOffsetHours = 0,
): string => {
  if (readings.length === 0) return "No readings";

  const count = `${readings.length.toLocaleString()} reading${readings.length !== 1 ? "s" : ""}`;

  let minMs = Infinity;
  let maxMs = -Infinity;

  for (const r of readings) {
    const t = new Date(r.timestamp).getTime();
    if (t < minMs) minMs = t;
    if (t > maxMs) maxMs = t;
  }

  const latest = new Date(maxMs);
  const earliest = new Date(minMs);
  const ageMs = (Date.now() - clockOffsetMs) - maxMs;
  const ONE_DAY = 24 * 60 * 60 * 1000;

  /* Recent data — show time of last reading in server timezone */
  if (ageMs < ONE_DAY) {
    return `${count} – Today ${toServerTime(maxMs, clockOffsetMs, serverTzOffsetHours)}`;
  }

  /* Older data — show date range */
  const latestDate = toShortDate(latest);
  const earliestDate = toShortDate(earliest);

  if (earliestDate === latestDate) {
    return `${count} – ${latestDate}`;
  }

  return `${count} – ${earliestDate} – ${latestDate}`;
};
