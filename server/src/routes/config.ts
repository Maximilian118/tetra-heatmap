import { Router } from "express";
import { getSettings } from "../db/settings.js";

const router = Router();

/* Return public client configuration (Mapbox token stored in the local database) */
router.get("/config", (_req, res) => {
  const { mapboxToken } = getSettings();
  res.json({ mapboxToken });
});

export default router;
