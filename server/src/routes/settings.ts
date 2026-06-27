import { Router } from "express";
import {
  getSettings,
  getSafeSettings,
  saveSettings,
  validateSettings,
  coerceSettings,
  isConfigured,
  updateSymbolSize,
  updateColourSpectrum,
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

/* Update just the symbol display size (called by the sidebar slider) */
router.patch("/settings/symbol-size", (req, res) => {
  const { symbolSize } = req.body;
  if (typeof symbolSize !== "number" || symbolSize < 24 || symbolSize > 96) {
    res.status(400).json({ error: "symbolSize must be a number 24–96" });
    return;
  }
  updateSymbolSize(symbolSize);
  res.json({ success: true });
});

/* Return the persisted custom colour spectrum, or null if none is saved */
router.get("/settings/colour-spectrum", (_req, res) => {
  const { colourSpectrum } = getSettings();
  res.json(colourSpectrum ? JSON.parse(colourSpectrum) : null);
});

/* Update the custom colour spectrum (called by the colours tab) */
router.patch("/settings/colour-spectrum", (req, res) => {
  const { colourSpectrum } = req.body;
  if (typeof colourSpectrum !== "object" || colourSpectrum === null) {
    res.status(400).json({ error: "colourSpectrum must be an object" });
    return;
  }
  if (typeof colourSpectrum.enabled !== "boolean") {
    res.status(400).json({ error: "colourSpectrum.enabled must be a boolean" });
    return;
  }
  if (!Array.isArray(colourSpectrum.stops)) {
    res.status(400).json({ error: "colourSpectrum.stops must be an array" });
    return;
  }
  updateColourSpectrum(JSON.stringify(colourSpectrum));
  res.json({ success: true });
});

/* Save new settings, test the connection, and restart the sync service */
router.post("/settings", async (req, res) => {
  const incoming = coerceSettings(req.body as Record<string, unknown>);

  /* If password is masked (unchanged), preserve the existing stored password */
  if (incoming.dbPassword === "********") {
    incoming.dbPassword = getSettings().dbPassword;
  }

  /* Validate all fields before saving */
  const errors = validateSettings(incoming);
  if (errors.length > 0) {
    logger.warn(`Settings validation failed: ${errors.join("; ")}`);
    res.status(400).json({ success: false, errors });
    return;
  }

  /* Save settings regardless of connection outcome */
  saveSettings(incoming);

  /* Test connection with the new credentials */
  const result = await testConnection(incoming);

  /* Recreate the MySQL pool and restart the sync service on successful connection */
  if (result.success) {
    try {
      await recreatePool(incoming);
      restartSync();
    } catch (err) {
      logger.error(`Failed to recreate pool or restart sync: ${err}`);
    }
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
