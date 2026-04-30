import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

/* Load .env from the project root */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
import express from "express";
import compression from "compression";
import cors from "cors";
import rssiRoutes from "./routes/rssi.js";
import settingsRoutes from "./routes/settings.js";
import configRoutes from "./routes/config.js";
import subscriberRoutes from "./routes/subscribers.js";
import statsRoutes from "./routes/stats.js";
import { startSync, stopSync } from "./services/sync.js";
import { createPool, closePool } from "./db/remote.js";
import { closeDb } from "./db/local.js";
import { getSettings, isConfigured } from "./db/settings.js";
import logger from "./utils/log.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || "localhost";

app.use(compression());
app.use(cors());
app.use(express.json());

/* Mount API routes */
app.use("/api", rssiRoutes);
app.use("/api", settingsRoutes);
app.use("/api", configRoutes);
app.use("/api", subscriberRoutes);
app.use("/api", statsRoutes);

/* Serve the built Vite client as static files (production mode) */
const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist, { maxAge: "1y", immutable: true }));
app.get("/{*splat}", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(path.join(clientDist, "index.html"));
});

/* Cancel pending syncs, close MySQL pool and SQLite DB on process exit (prevents MySQL host blocking from tsx watch restarts) */
const shutdown = async () => {
  logger.info("Shutting down gracefully...");
  stopSync();
  await closePool();
  closeDb();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

app.listen(PORT, HOST, () => {
  logger.info(`Running on http://${HOST}:${PORT}`);

  /* Initialize MySQL pool and sync service only if credentials are configured */
  if (isConfigured()) {
    const settings = getSettings();
    createPool(settings);
    startSync();
  } else {
    logger.info("Waiting for database configuration via UI");
  }
});
