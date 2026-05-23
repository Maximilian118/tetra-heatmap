import { useState, useEffect, useCallback, useRef, type MutableRefObject } from "react";
import {
  fetchNotes,
  createNote,
  updateNoteColor as apiUpdateNoteColor,
  updateNoteTitle as apiUpdateNoteTitle,
  updateNoteText as apiUpdateNoteText,
  updateNotePolygon as apiUpdateNotePolygon,
  deleteNote as apiDeleteNote,
  type MapNote,
} from "../../../utils/api";

/* Available area marker colours — pick the first one not already used by an existing polygon note */
const AREA_COLORS = ["#f87171", "#fb923c", "#facc15", "#4ade80", "#589cdc", "#a78bfa"];

interface UseNotesParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deckRef: MutableRefObject<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  liveViewState: any;
}

/* Manages user-created notes and their polygon areas on the map */
export const useNotes = (params: UseNotesParams) => {
  const { deckRef, liveViewState } = params;

  const [notes, setNotes] = useState<MapNote[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [draggingVertexNoteId, setDraggingVertexNoteId] = useState<string | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const polygonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Load notes from the server on mount */
  const loadNotes = useCallback(async () => {
    try {
      setNotes(await fetchNotes());
    } catch (err) {
      console.error("[notes] Failed to fetch notes:", err);
    }
  }, []);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  /* Derive the next note number from the current count */
  const nextTitle = useCallback(() => `Note ${notes.length + 1}`, [notes.length]);

  /* Create a text-only note (no polygon) */
  const handleAddNote = useCallback(async () => {
    const note: MapNote = {
      id: crypto.randomUUID(),
      title: nextTitle(),
      text: "",
      color: "#589cdc",
      polygon: null,
      created_at: new Date().toISOString(),
    };
    try {
      await createNote(note);
      setNotes((prev) => [note, ...prev]);
      setEditingNoteId(note.id);
    } catch (err) {
      console.error("[notes] Failed to create note:", err);
    }
  }, [nextTitle]);

  /* Delete a note and remove it from state */
  const handleDeleteNote = useCallback(async (id: string) => {
    try {
      await apiDeleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      setEditingNoteId((prev) => prev === id ? null : prev);
    } catch (err) {
      console.error("[notes] Failed to delete note:", err);
    }
  }, []);

  /* Update note title locally and persist to server (debounced) */
  const handleTitleChange = useCallback((id: string, title: string) => {
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, title } : n));
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => {
      apiUpdateNoteTitle(id, title).catch(
        (err) => console.error("[notes] Failed to update note title:", err)
      );
    }, 300);
  }, []);

  /* Update note text locally and persist to server (debounced) */
  const handleTextChange = useCallback((id: string, text: string) => {
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, text } : n));
    if (textTimer.current) clearTimeout(textTimer.current);
    textTimer.current = setTimeout(() => {
      apiUpdateNoteText(id, text).catch(
        (err) => console.error("[notes] Failed to update note text:", err)
      );
    }, 300);
  }, []);

  /* Update polygon vertices and persist to server (debounced) */
  const handlePolygonUpdate = useCallback((id: string, polygon: [number, number][]) => {
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, polygon } : n));
    if (polygonTimer.current) clearTimeout(polygonTimer.current);
    polygonTimer.current = setTimeout(() => {
      apiUpdateNotePolygon(id, polygon).catch(
        (err) => console.error("[notes] Failed to update note polygon:", err)
      );
    }, 300);
  }, []);

  /* Unproject a drop event's pixel position to [lng, lat] via DeckGL viewport */
  const unprojectDrop = useCallback((e: React.DragEvent): { longitude: number; latitude: number; zoom: number } | null => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deck = (deckRef.current as any)?.deck;
    if (!deck) return null;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const vp = deck.getViewports()[0];
    if (!vp) return null;
    const [longitude, latitude] = vp.unproject([e.clientX - rect.left, e.clientY - rect.top]);
    return { longitude, latitude, zoom: liveViewState?.zoom ?? 12 };
  }, [deckRef, liveViewState]);

  /* Build a default rectangular polygon centred on a point, scaled to zoom */
  const buildDefaultPolygon = (longitude: number, latitude: number, zoom: number): [number, number][] => {
    const offset = 0.005 / Math.pow(2, Math.max(0, zoom - 10));
    return [
      [longitude - offset, latitude - offset],
      [longitude + offset, latitude - offset],
      [longitude + offset, latitude + offset],
      [longitude - offset, latitude + offset],
    ];
  };

  /* Pick the first area colour not already used by a note with a polygon */
  const pickUnusedColor = useCallback((): string => {
    const usedColors = new Set(notes.filter((n) => n.polygon).map((n) => n.color));
    return AREA_COLORS.find((c) => !usedColors.has(c)) ?? AREA_COLORS[0];
  }, [notes]);

  /* Handle dropping a colour palette marker (new note) or an existing note onto the map */
  const handleMapDrop = useCallback(async (e: React.DragEvent) => {
    const noteColor = e.dataTransfer.getData("noteColor");
    const noteDragId = e.dataTransfer.getData("noteDragId");

    if (!noteColor && !noteDragId) return;
    e.preventDefault();

    const pos = unprojectDrop(e);
    if (!pos) return;
    const polygon = buildDefaultPolygon(pos.longitude, pos.latitude, pos.zoom);

    if (noteDragId) {
      /* Assign a polygon and unused colour to an existing text-only note */
      const color = pickUnusedColor();
      setNotes((prev) => prev.map((n) => n.id === noteDragId ? { ...n, polygon, color } : n));
      setEditingNoteId(noteDragId);
      try {
        await Promise.all([
          apiUpdateNotePolygon(noteDragId, polygon),
          apiUpdateNoteColor(noteDragId, color),
        ]);
      } catch (err) {
        console.error("[notes] Failed to assign area to note:", err);
      }
    } else {
      /* Create a brand-new note from the colour palette */
      const note: MapNote = {
        id: crypto.randomUUID(),
        title: nextTitle(),
        text: "",
        color: noteColor,
        polygon,
        created_at: new Date().toISOString(),
      };
      try {
        await createNote(note);
        setNotes((prev) => [note, ...prev]);
        setEditingNoteId(note.id);
      } catch (err) {
        console.error("[notes] Failed to create note:", err);
      }
    }
  }, [unprojectDrop, pickUnusedColor, nextTitle]);

  /* Allow the map area to accept note area drops (palette or existing note) */
  const handleMapDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("notecolor") || e.dataTransfer.types.includes("notedragid")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  return {
    notes,
    setNotes,
    editingNoteId,
    setEditingNoteId,
    draggingVertexNoteId,
    setDraggingVertexNoteId,
    loadNotes,
    handleAddNote,
    handleDeleteNote,
    handleTitleChange,
    handleTextChange,
    handlePolygonUpdate,
    handleMapDrop,
    handleMapDragOver,
  };
};
