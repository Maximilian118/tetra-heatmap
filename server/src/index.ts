import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

/* Load .env from the project root */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
import express from "express";
import cors from "cors";
import rssiRoutes from "./routes/rssi.js";
import { startSync, stopSync } from "./services/sync.js";
import { closePool } from "./db/remote.js";
import { closeDb } from "./db/local.js";

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

/* Mount API routes */
app.use("/api", rssiRoutes);

/* Cancel pending syncs, close MySQL pool and SQLite DB on process exit (prevents MySQL host blocking from tsx watch restarts) */
const shutdown = async () => {
  console.log("[server] Shutting down gracefully...");
  stopSync();
  await closePool();
  closeDb();
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT}`);
  /* Begin syncing RSSI data from the remote TetraFlex database */
  startSync();
});
