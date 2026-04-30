import { useRef } from "react";
import { Save, FolderOpen, Radio } from "lucide-react";
import type { Reading } from "../../../../utils/api";
import { formatReadingSummary } from "../../../../utils/format";
import "./DataControls.scss";

interface DataControlsProps {
  readings: Reading[];
  isFileMode: boolean;
  onSave: () => void;
  onLoad: (file: File) => void;
  onResumeLive: () => void;
  clockOffsetMs: number;
  serverTzOffsetHours: number;
}

/* Save/Load buttons for exporting and importing heatmap datasets */
const DataControls = ({ readings, isFileMode, onSave, onLoad, onResumeLive, clockOffsetMs, serverTzOffsetHours }: DataControlsProps) => {
  const fileInput = useRef<HTMLInputElement>(null);

  /* Open the native file picker when Load Data is clicked */
  const handleLoadClick = () => fileInput.current?.click();

  /* Forward the selected file to the parent and reset the input */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onLoad(file);
    e.target.value = "";
  };

  return (
    <div className="data-controls">
      <span className="data-controls__label">Data</span>
      <span className="data-controls__count">
        {isFileMode
          ? `Viewing saved file — ${readings.length.toLocaleString()} readings`
          : formatReadingSummary(readings, clockOffsetMs, serverTzOffsetHours)}
      </span>

      {/* Save Data in live mode, Resume Live in file mode — same slot */}
      {isFileMode ? (
        <button className="data-controls__btn data-controls__btn--live" onClick={onResumeLive}>
          <Radio size={14} />
          Resume Live
        </button>
      ) : (
        <button className="data-controls__btn" onClick={onSave} disabled={readings.length === 0}>
          <Save size={14} />
          Save Data
        </button>
      )}

      <button className="data-controls__btn" onClick={handleLoadClick}>
        <FolderOpen size={14} />
        Load Data
      </button>

      {/* Hidden file input for the load dialog */}
      <input
        ref={fileInput}
        type="file"
        accept=".json,.thm"
        className="data-controls__file-input"
        onChange={handleFileChange}
      />
    </div>
  );
};

export default DataControls;
