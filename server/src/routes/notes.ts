import { Router } from "express";
import {
  getAllNotes,
  insertNote,
  updateNoteColor,
  updateNoteTitle,
  updateNoteText,
  updateNotePolygon,
  deleteNote,
} from "../db/local.js";

const router = Router();

/* Return all user-created notes */
router.get("/notes", (_req, res) => {
  const notes = getAllNotes();
  res.json(notes);
});

/* Create a new note (optionally with a polygon area) */
router.post("/notes", (req, res) => {
  const { id, title, text, color, polygon, created_at } = req.body;
  if (!id || !color) {
    res.status(400).json({ error: "Missing required fields: id, color" });
    return;
  }
  insertNote({
    id,
    title: title ?? "",
    text: text ?? "",
    color,
    polygon: polygon ?? null,
    created_at: created_at ?? new Date().toISOString(),
  });
  res.json({ success: true });
});

/* Update only the color of an existing note */
router.patch("/notes/:id/color", (req, res) => {
  const { color } = req.body;
  if (typeof color !== "string") {
    res.status(400).json({ error: "color must be a string" });
    return;
  }
  updateNoteColor(req.params.id, color);
  res.json({ success: true });
});

/* Update only the title of an existing note */
router.patch("/notes/:id/title", (req, res) => {
  const { title } = req.body;
  if (typeof title !== "string") {
    res.status(400).json({ error: "title must be a string" });
    return;
  }
  updateNoteTitle(req.params.id, title);
  res.json({ success: true });
});

/* Update only the text content of an existing note */
router.patch("/notes/:id/text", (req, res) => {
  const { text } = req.body;
  if (typeof text !== "string") {
    res.status(400).json({ error: "text must be a string" });
    return;
  }
  updateNoteText(req.params.id, text);
  res.json({ success: true });
});

/* Update the polygon vertices of an existing note */
router.patch("/notes/:id/polygon", (req, res) => {
  const { polygon } = req.body;
  if (polygon !== null && typeof polygon !== "string") {
    res.status(400).json({ error: "polygon must be a JSON string or null" });
    return;
  }
  updateNotePolygon(req.params.id, polygon ?? null);
  res.json({ success: true });
});

/* Delete a note by id */
router.delete("/notes/:id", (req, res) => {
  deleteNote(req.params.id);
  res.json({ success: true });
});

export default router;
