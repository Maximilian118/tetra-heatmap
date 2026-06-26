import type { MapNote } from "../../../utils/api";
import "./ReportNotes.scss";

interface ReportNotesProps {
  notes: MapNote[];
}

/* Notes legend panel for the PDF report.
   Shows each note's color indicator, title, and description text.
   Rendered at the bottom-right of the map, height-matched to the left-side legends. */
const ReportNotes = ({ notes }: ReportNotesProps) => {
  if (notes.length === 0) return null;

  return (
    <div className="report-notes">
      <div className="report-notes__heading">Notes</div>

      {/* Scrollable list of note entries — overflow is clipped by parent height constraint */}
      <div className="report-notes__list">
        {notes.map((note) => (
          <div key={note.id} className="report-notes__entry">
            {/* Color swatch — visible only for notes with a zone polygon */}
            <span
              className="report-notes__color"
              style={{
                backgroundColor: note.polygon ? note.color : "transparent",
                borderColor: note.polygon ? "rgba(0, 0, 0, 0.2)" : "transparent",
              }}
            />
            <div className="report-notes__content">
              <div className="report-notes__title">{note.title}</div>
              {note.text && <div className="report-notes__text">{note.text}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ReportNotes;
