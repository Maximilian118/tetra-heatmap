import type { Reading } from "./api";

/* Format a Date as DD/MM/YY */
const toShortDate = (d: Date): string => {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

/* Format a Date as HH:MM:SS */
const toTime = (d: Date): string =>
  d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/**
 * Single-line summary combining count and time coverage.
 * - No readings                     → "No readings"
 * - Recent (< 24h)                  → "345 readings – Today 17:03:23"
 * - Older, single calendar day      → "208 readings – 28/03/26"
 * - Older, spans multiple days      → "208 readings – 26/03/26 – 28/03/26"
 */
export const formatReadingSummary = (readings: Reading[]): string => {
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
  const ageMs = Date.now() - maxMs;
  const ONE_DAY = 24 * 60 * 60 * 1000;

  /* Recent data — show time of last reading */
  if (ageMs < ONE_DAY) {
    return `${count} – Today ${toTime(latest)}`;
  }

  /* Older data — show date range */
  const latestDate = toShortDate(latest);
  const earliestDate = toShortDate(earliest);

  if (earliestDate === latestDate) {
    return `${count} – ${latestDate}`;
  }

  return `${count} – ${earliestDate} – ${latestDate}`;
};
