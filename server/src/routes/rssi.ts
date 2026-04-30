import { Router } from "express";
import { getAllReadings } from "../db/local.js";
import { resetSync, getClockOffsetMs, getServerTzOffsetHours } from "../services/sync.js";

const router = Router();

/* Return all cached RSSI readings along with clock/timezone metadata */
router.get("/rssi", (_req, res) => {
  res.json({
    readings: getAllReadings(),
    clockOffsetMs: getClockOffsetMs(),
    serverTzOffsetHours: getServerTzOffsetHours(),
  });
});

/* Wipe the local cache and start collecting fresh data from now */
router.post("/rssi/reset", (_req, res) => {
  const syncFrom = resetSync();
  res.json({ success: true, syncFrom });
});

export default router;
