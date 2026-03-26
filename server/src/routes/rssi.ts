import { Router } from "express";
import { getAllReadings } from "../db/local.js";
import { resetSync } from "../services/sync.js";

const router = Router();

/* Return all cached RSSI readings from the local SQLite database */
router.get("/rssi", (_req, res) => {
  const readings = getAllReadings();
  res.json(readings);
});

/* Wipe the local cache and start collecting fresh data from now */
router.post("/rssi/reset", (_req, res) => {
  const syncFrom = resetSync();
  res.json({ success: true, syncFrom });
});

export default router;
