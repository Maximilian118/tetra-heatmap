import { Router } from "express";
import type { RowDataPacket } from "mysql2";
import { getPool } from "../db/remote.js";
import {
  getAllSubscribers,
  upsertSubscribers,
  clearSubscribers,
  getSubscribersMissingLocation,
  updateLastLocation,
} from "../db/local.js";
import logger from "../utils/log.js";

const router = Router();

/* Return all subscribers with per-SSI reading statistics and pre-computed last location */
router.get("/subscribers", (_req, res) => {
  const subscribers = getAllSubscribers();
  res.json(subscribers);
});

/* Lazy-load the offline geocoder so a missing package never crashes the route */
let getNearestCity: ((lat: number, lon: number) => { cityName?: string; countryName?: string }) | null = null;
import("offline-geocode-city")
  .then((mod) => { getNearestCity = mod.getNearestCity; })
  .catch(() => { /* package unavailable — backfill disabled */ });

/* Backfill missing location data for subscribers that have readings but no location */
router.post("/subscribers/backfill-locations", (_req, res) => {
  if (!getNearestCity) {
    res.json({ success: true, updated: 0 });
    return;
  }

  const missing = getSubscribersMissingLocation();
  let updated = 0;

  for (const { ssi, latitude, longitude } of missing) {
    try {
      const result = getNearestCity(latitude, longitude);
      if (result?.cityName) {
        const location = result.countryName
          ? `${result.cityName}, ${result.countryName}`
          : result.cityName;
        updateLastLocation(ssi, location);
        updated++;
      }
    } catch { /* geocoding failure — skip this SSI */ }
  }

  if (updated > 0) {
    logger.info(`Backfilled location for ${updated} subscriber(s)`);
  }

  res.json({ success: true, updated });
});

/* Shape of a row returned by the remote subscriber JOIN query */
interface SubscriberRow extends RowDataPacket {
  SSI: number;
  Description: string;
  ProfileId: number | null;
  ProfileName: string;
  OrganisationId: number;
  Organisation: string;
}

/* Import the full SSI Register from the remote TetraFlex LogServer */
router.post("/subscribers/import", async (_req, res) => {
  const pool = getPool();
  if (!pool) {
    res.status(503).json({ success: false, error: "No database connection" });
    return;
  }

  try {
    /* Fetch individual subscribers (exclude groups and soft-deleted rows) */
    const [rows] = await pool.query<SubscriberRow[]>(`
      SELECT s.SSI, s.Description, s.ProfileId,
             COALESCE(p.Description, '') AS ProfileName,
             COALESCE(o.DbId, 0)        AS OrganisationId,
             COALESCE(o.Description, '') AS Organisation
      FROM subscriber s
      LEFT JOIN profile p      ON s.ProfileId = p.ProfileId
      LEFT JOIN organization o ON p.OrganizationId = o.DbId
      WHERE s.GroupSubscriber = 0
        AND s.MarkedForDeletion = 0
    `);

    /* Map remote rows to local subscriber shape and upsert */
    const mapped = rows.map((r) => ({
      ssi: r.SSI,
      description: r.Description,
      organisation_id: r.OrganisationId || null,
      organisation: r.Organisation,
      profile_id: r.ProfileId,
      profile_name: r.ProfileName,
    }));

    upsertSubscribers(mapped);
    logger.info(`SSI Register imported — ${mapped.length} subscribers`);
    res.json({ success: true, imported: mapped.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`SSI Register import failed: ${message}`);
    res.status(500).json({ success: false, error: message });
  }
});

/* Clear all local subscriber data */
router.post("/subscribers/clear", (_req, res) => {
  const cleared = clearSubscribers();
  logger.info(`SSI Register cleared — ${cleared} subscribers removed`);
  res.json({ success: true, cleared });
});

export default router;
