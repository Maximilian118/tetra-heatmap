import { useRef } from "react";
import { Save, FolderOpen, Radio, MapPin } from "lucide-react";
import type { Reading } from "../../../../utils/api";
import { formatReadingSummary } from "../../../../utils/format";
import SideBarButton from "../SideBarButton/SideBarButton";
import "./DataControls.scss";

interface DataControlsProps {
  readings: Reading[];
  isFileMode: boolean;
  onSave: () => void;
  onLoad: (file: File) => void;
  onResumeLive: () => void;
  onOpenSymbols: () => void;
  clockOffsetMs: number;
  serverTzOffsetHours: number;
}

/* Save/Load buttons for exporting and importing heatmap datasets */
const DataControls = ({ readings, isFileMode, onSave, onLoad, onResumeLive, onOpenSymbols, clockOffsetMs, serverTzOffsetHours }: DataControlsProps) => {
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
        <SideBarButton icon={Radio} label="Resume Live" onClick={onResumeLive} variant="accent" />
      ) : (
        <SideBarButton icon={Save} label="Save Data" onClick={onSave} disabled={readings.length === 0} />
      )}

      <SideBarButton icon={FolderOpen} label="Load Data" onClick={handleLoadClick} />
      <SideBarButton icon={MapPin} label="Symbols" onClick={onOpenSymbols} />

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
