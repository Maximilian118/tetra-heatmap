import { Router } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  getAllKmlFiles,
  getKmlFile,
  insertKmlFile,
  deleteKmlFile,
} from "../db/local.js";

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KML_DIR = path.resolve(__dirname, "../../data/kml");

/* Ensure the KML storage directory exists */
fs.mkdirSync(KML_DIR, { recursive: true });

/* Squared equirectangular distance — only used for relative ordering so no sqrt needed */
const distanceSq = (
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number => {
  const DEG_TO_RAD = Math.PI / 180;
  const cosLat = Math.cos(((lat1 + lat2) / 2) * DEG_TO_RAD);
  const dLat = lat2 - lat1;
  const dLng = (lng2 - lng1) * cosLat;
  return dLat * dLat + dLng * dLng;
};

/* Return all KML file metadata, optionally sorted by proximity to a given center */
router.get("/kml", (req, res) => {
  const files = getAllKmlFiles();

  const centerLat = parseFloat(req.query.centerLat as string);
  const centerLng = parseFloat(req.query.centerLng as string);

  if (!isNaN(centerLat) && !isNaN(centerLng)) {
    files.sort(
      (a, b) =>
        distanceSq(centerLat, centerLng, a.center_lat, a.center_lng) -
        distanceSq(centerLat, centerLng, b.center_lat, b.center_lng)
    );
  }

  res.json(files);
});

/* Return the raw KML file content for a given id */
router.get("/kml/:id", (req, res) => {
  const meta = getKmlFile(req.params.id);
  if (!meta) {
    res.status(404).json({ error: "KML file not found" });
    return;
  }

  const filePath = path.join(KML_DIR, `${req.params.id}.kml`);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "KML file content missing from disk" });
    return;
  }

  res.setHeader("Content-Type", "application/vnd.google-earth.kml+xml");
  res.sendFile(filePath);
});

/* Upload a new KML file — metadata in SQLite, content on disk */
router.post("/kml", (req, res) => {
  const { id, filename, center_lat, center_lng, content } = req.body;

  if (!id || !filename || typeof center_lat !== "number" || typeof center_lng !== "number" || !content) {
    res.status(400).json({ error: "Missing required fields: id, filename, center_lat, center_lng, content" });
    return;
  }

  /* Write the KML content to disk */
  const filePath = path.join(KML_DIR, `${id}.kml`);
  fs.writeFileSync(filePath, content, "utf-8");

  /* Insert metadata into SQLite */
  insertKmlFile({
    id,
    filename,
    center_lat,
    center_lng,
    uploaded_at: new Date().toISOString(),
  });

  res.json({ success: true });
});

/* Delete a KML file — remove from SQLite and disk */
router.delete("/kml/:id", (req, res) => {
  deleteKmlFile(req.params.id);

  const filePath = path.join(KML_DIR, `${req.params.id}.kml`);
  try {
    fs.unlinkSync(filePath);
  } catch {
    /* File may already be missing — that's fine */
  }

  res.json({ success: true });
});

export default router;
