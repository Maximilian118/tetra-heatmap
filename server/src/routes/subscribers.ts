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
import { geocodeLocation } from "../utils/geocode.js";

const router = Router();

/* Return all subscribers with per-SSI reading statistics and pre-computed last location */
router.get("/subscribers", (_req, res) => {
  const subscribers = getAllSubscribers();
  res.json(subscribers);
});

/* Backfill missing location data for subscribers that have readings but no location */
router.post("/subscribers/backfill-locations", (_req, res) => {
  const missing = getSubscribersMissingLocation();
  let updated = 0;

  for (const { ssi, latitude, longitude } of missing) {
    const location = geocodeLocation(latitude, longitude);
    if (location) {
      updateLastLocation(ssi, location);
      updated++;
    }
  }

  if (updated > 0) {
    logger.info(`Backfilled location for ${updated} subscriber(s)`);
  }

  res.json({ success: true, updated });
});

/* Batch reverse-geocode an array of coordinate pairs into location strings */
router.post("/subscribers/geocode", (req, res) => {
  const coords = req.body as { latitude: number; longitude: number }[];
  if (!Array.isArray(coords)) {
    res.status(400).json({ error: "Expected array of {latitude, longitude}" });
    return;
  }

  const locations = coords.map(({ latitude, longitude }) => geocodeLocation(latitude, longitude));
  res.json({ locations });
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
      LEFT JOIN profile p      ON s.ProfileId = p.DbId
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
