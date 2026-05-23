import { PolygonLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import type { MapNote } from "../../../utils/api";
import type { LayerBuildParams } from "./types";

/* Parse a hex colour string (#rrggbb) into an RGBA tuple */
const hexToRgba = (hex: string, alpha: number): [number, number, number, number] => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b, alpha];
};

/* Vertex handle data for the ScatterplotLayer */
interface VertexHandle {
  noteId: string;
  vertexIndex: number;
  position: [number, number];
  color: string;
}

/* Build deck.gl layers for note polygon areas and vertex editing handles */
export const buildNoteLayers = (params: LayerBuildParams) => {
  const { notes, editingNoteId, onNotePolygonUpdate, setDraggingVertexNoteId, setNoteTooltip } = params;

  /* Filter to notes that have polygon areas */
  const notesWithPolygon = notes.filter((n) => n.polygon && n.polygon.length >= 3);

  /* Semi-transparent filled polygons with coloured outlines */
  const areaLayer = new PolygonLayer<MapNote>({
    id: "note-areas",
    data: notesWithPolygon,
    getPolygon: (d) => d.polygon!,
    getFillColor: (d) => hexToRgba(d.color, 50),
    getLineColor: (d) => hexToRgba(d.color, 200),
    getLineWidth: 2,
    lineWidthMinPixels: 2,
    stroked: true,
    filled: true,
    pickable: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: { depthTest: false } as any,
    onHover: (info: PickingInfo<MapNote>) => {
      if (info.object) {
        setNoteTooltip({
          x: info.x,
          y: info.y,
          title: info.object.title,
          text: info.object.text,
        });
      } else {
        setNoteTooltip(null);
      }
    },
    updateTriggers: {
      getFillColor: [notes],
      getLineColor: [notes],
      getPolygon: [notes],
    },
  });

  /* Build vertex handles for the currently selected note */
  const vertexData: VertexHandle[] = [];
  if (editingNoteId) {
    const note = notesWithPolygon.find((n) => n.id === editingNoteId);
    if (note?.polygon) {
      note.polygon.forEach((pos, idx) => {
        vertexData.push({
          noteId: note.id,
          vertexIndex: idx,
          position: pos,
          color: note.color,
        });
      });
    }
  }

  /* Draggable vertex handles for reshaping polygons */
  const vertexLayer = new ScatterplotLayer<VertexHandle>({
    id: "note-vertices",
    data: vertexData,
    getPosition: (d) => d.position,
    getFillColor: (d) => hexToRgba(d.color, 220),
    getLineColor: [255, 255, 255, 200],
    getRadius: 5,
    radiusMinPixels: 5,
    radiusMaxPixels: 8,
    stroked: true,
    lineWidthMinPixels: 1,
    pickable: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: { depthTest: false } as any,
    onDragStart: (info: PickingInfo<VertexHandle>) => {
      if (info.object) {
        setDraggingVertexNoteId(info.object.noteId);
      }
    },
    onDrag: (info: PickingInfo<VertexHandle>) => {
      if (!info.object || !info.coordinate) return;
      const { noteId, vertexIndex } = info.object;
      const note = notes.find((n) => n.id === noteId);
      if (!note?.polygon) return;

      /* Update the vertex position in the polygon */
      const updated = note.polygon.map((v, i) =>
        i === vertexIndex ? [info.coordinate![0], info.coordinate![1]] as [number, number] : v
      );
      onNotePolygonUpdate(noteId, updated);
    },
    onDragEnd: () => {
      setDraggingVertexNoteId(null);
    },
    updateTriggers: {
      getPosition: [notes, editingNoteId],
      getFillColor: [notes, editingNoteId],
    },
  });

  return [areaLayer, vertexLayer];
};
