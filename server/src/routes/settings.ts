import { Router } from "express";
import {
  getSettings,
  getSafeSettings,
  saveSettings,
  validateSettings,
  isConfigured,
  type Settings,
} from "../db/settings.js";
import { testConnection } from "../utils/testConnection.js";
import { recreatePool } from "../db/remote.js";
import { restartSync } from "../services/sync.js";
import logger from "../utils/log.js";

const router = Router();

/* Return current settings with the password masked */
router.get("/settings", (_req, res) => {
  const settings = getSafeSettings();
  res.json(settings);
});

/* Test the connection using the currently saved settings */
router.post("/settings/test", async (_req, res) => {
  if (!isConfigured()) {
    res.json({ connected: false, error: "Database credentials not configured" });
    return;
  }
  const settings = getSettings();
  const result = await testConnection(settings);
  res.json({ connected: result.success, error: result.error ?? null });
});

/* Save new settings, test the connection, and restart the sync service */
router.post("/settings", async (req, res) => {
  const incoming = req.body as Settings;

  /* If password is masked (unchanged), preserve the existing stored password */
  if (incoming.dbPassword === "********") {
    incoming.dbPassword = getSettings().dbPassword;
  }

  /* Validate all fields before saving */
  const errors = validateSettings(incoming);
  if (errors.length > 0) {
    res.status(400).json({ success: false, errors });
    return;
  }

  /* Save settings regardless of connection outcome */
  saveSettings(incoming);

  /* Test connection with the new credentials */
  const result = await testConnection(incoming);

  /* Recreate the MySQL pool and restart the sync service on successful connection */
  if (result.success) {
    await recreatePool(incoming);
    restartSync();
  }

  logger.info(
    `Settings updated — connection ${result.success ? "successful" : "failed"}`
  );
  res.json({
    success: true,
    connected: result.success,
    connectionError: result.error ?? null,
  });
});

export default router;
