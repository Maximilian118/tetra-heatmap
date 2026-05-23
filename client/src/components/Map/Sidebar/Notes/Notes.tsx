import { Trash2, Plus } from "lucide-react";
import type { MapNote } from "../../../../utils/api";
import "./Notes.scss";

/* Predefined area marker colours for the drag palette */
const NOTE_COLORS = [
  { color: "#f87171", label: "Red" },
  { color: "#fb923c", label: "Orange" },
  { color: "#facc15", label: "Yellow" },
  { color: "#4ade80", label: "Green" },
  { color: "#589cdc", label: "Blue" },
  { color: "#a78bfa", label: "Purple" },
];

interface NotesProps {
  notes: MapNote[];
  editingNoteId: string | null;
  onSetEditingNoteId: (id: string | null) => void;
  onTitleChange: (id: string, title: string) => void;
  onTextChange: (id: string, text: string) => void;
  onDelete: (id: string) => void;
  onFlyTo: (longitude: number, latitude: number) => void;
  onAddNote: () => void;
}

/* Format an ISO timestamp into a readable locale string */
const formatDate = (iso: string): string =>
  new Date(iso).toLocaleString();

/* Calculate the centroid of a polygon for fly-to navigation */
const polygonCentroid = (polygon: [number, number][]): [number, number] => {
  let lng = 0;
  let lat = 0;
  for (const [lo, la] of polygon) {
    lng += lo;
    lat += la;
  }
  return [lng / polygon.length, lat / polygon.length];
};

/* Set the note colour in dataTransfer and create a coloured circle drag image */
const handleDragStart = (e: React.DragEvent, color: string) => {
  e.dataTransfer.setData("noteColor", color);
  e.dataTransfer.effectAllowed = "copy";

  /* Render a coloured circle as the drag image */
  const dragCanvas = document.createElement("canvas");
  dragCanvas.width = 36;
  dragCanvas.height = 36;
  dragCanvas.style.position = "fixed";
  dragCanvas.style.left = "-9999px";
  dragCanvas.style.top = "-9999px";
  document.body.appendChild(dragCanvas);
  const ctx = dragCanvas.getContext("2d")!;
  ctx.beginPath();
  ctx.arc(18, 18, 14, 0, Math.PI * 2);
  ctx.fillStyle = color + "40";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = color;
  ctx.stroke();
  e.dataTransfer.setDragImage(dragCanvas, 18, 18);

  requestAnimationFrame(() => document.body.removeChild(dragCanvas));
};

/* Sidebar tab showing draggable area palette and list of notes */
const Notes = ({ notes, editingNoteId, onSetEditingNoteId, onTitleChange, onTextChange, onDelete, onFlyTo, onAddNote }: NotesProps) => {
  /* Handle clicking a note row — select it for editing and fly to its area */
  const handleRowClick = (note: MapNote) => {
    onSetEditingNoteId(note.id === editingNoteId ? null : note.id);
    if (note.polygon && note.polygon.length > 0) {
      const [lng, lat] = polygonCentroid(note.polygon);
      onFlyTo(lng, lat);
    }
  };

  return (
    <div className="notes">
      {/* Draggable area marker palette */}
      <span className="notes__label">Drag to Place Area</span>
      <div className="notes__palette">
        {NOTE_COLORS.map((def) => (
          <div
            key={def.color}
            className="notes__card"
            draggable
            onDragStart={(e) => handleDragStart(e, def.color)}
            title={`Drag to place a ${def.label.toLowerCase()} area`}
          >
            <div
              className="notes__marker-preview"
              style={{
                borderColor: def.color,
                backgroundColor: def.color + "25",
              }}
            />
            <span className="notes__card-label">{def.label}</span>
          </div>
        ))}
      </div>

      {/* Add text-only note button */}
      <button className="notes__add-btn" onClick={onAddNote}>
        <Plus size={14} />
        Add Note
      </button>

      {/* Notes list header */}
      <span className="notes__label">
        Notes ({notes.length})
      </span>

      {notes.length === 0 ? (
        <span className="notes__empty">No notes yet</span>
      ) : (
        <div className="notes__list">
          {notes.map((note) => (
            <div
              key={note.id}
              className={`notes__item ${note.id === editingNoteId ? "notes__item--selected" : ""}`}
              draggable={!note.polygon}
              onDragStart={(e) => {
                if (note.polygon) return;
                e.dataTransfer.setData("noteDragId", note.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
            >
              {/* Header row with title, optional colour indicator, and delete */}
              <div className="notes__item-header" onClick={() => handleRowClick(note)}>
                <div className="notes__item-info">
                  <input
                    className="notes__title-input"
                    value={note.title}
                    onChange={(e) => onTitleChange(note.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Untitled note"
                  />
                  <span className="notes__item-date">{formatDate(note.created_at)}</span>
                </div>
                <div className="notes__item-actions">
                  {/* Coloured circle — links note to its map area, click to fly there */}
                  {note.polygon && note.polygon.length > 0 && (
                    <div
                      className="notes__marker"
                      style={{
                        borderColor: note.color,
                        backgroundColor: note.color + "25",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const [lng, lat] = polygonCentroid(note.polygon!);
                        onFlyTo(lng, lat);
                      }}
                      title="Fly to area"
                    />
                  )}
                  <button
                    className="notes__delete-btn"
                    onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
                    title="Delete note"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Inline text editor — auto-grows to fit content */}
              <textarea
                ref={(el) => {
                  if (el) {
                    el.style.height = "auto";
                    el.style.height = el.scrollHeight + "px";
                  }
                }}
                className="notes__textarea"
                value={note.text}
                onChange={(e) => {
                  onTextChange(note.id, e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = e.target.scrollHeight + "px";
                }}
                placeholder="Write a note..."
                rows={1}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Notes;
