import { Router } from "express";
import {
  getAllSymbols,
  insertSymbol,
  updateSymbolPosition,
  updateSymbolDirection,
  deleteSymbol,
} from "../db/local.js";

const router = Router();

/* Return all placed map symbols */
router.get("/symbols", (_req, res) => {
  const symbols = getAllSymbols();
  res.json(symbols);
});

/* Create a new symbol on the map */
router.post("/symbols", (req, res) => {
  const { id, type, label, longitude, latitude, direction, created_at } = req.body;
  if (!id || !type || typeof longitude !== "number" || typeof latitude !== "number") {
    res.status(400).json({ error: "Missing required fields: id, type, longitude, latitude" });
    return;
  }
  insertSymbol({ id, type, label: label ?? "", longitude, latitude, direction: direction ?? null, created_at: created_at ?? new Date().toISOString() });
  res.json({ success: true });
});

/* Update only the position of an existing symbol */
router.patch("/symbols/:id/position", (req, res) => {
  const { longitude, latitude } = req.body;
  if (typeof longitude !== "number" || typeof latitude !== "number") {
    res.status(400).json({ error: "Missing required fields: longitude, latitude" });
    return;
  }
  updateSymbolPosition(req.params.id, longitude, latitude);
  res.json({ success: true });
});

/* Update the direction angle of an existing symbol */
router.patch("/symbols/:id/direction", (req, res) => {
  const { direction } = req.body;
  if (direction !== null && typeof direction !== "number") {
    res.status(400).json({ error: "direction must be a number or null" });
    return;
  }
  updateSymbolDirection(req.params.id, direction ?? null);
  res.json({ success: true });
});

/* Delete a symbol by id */
router.delete("/symbols/:id", (req, res) => {
  deleteSymbol(req.params.id);
  res.json({ success: true });
});

export default router;
