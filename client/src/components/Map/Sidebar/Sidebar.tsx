import { useState } from "react";
import Confirm from "./Confirm/Confirm";
import MapPresets from "./MapPresets/MapPresets";
import DataControls from "./DataControls/DataControls";
import "./Sidebar.scss";

/* Format an ISO timestamp into a user-friendly locale string */
const formatResetDate = (iso: string): string =>
  new Date(iso).toLocaleString();

interface SidebarProps {
  resetting: boolean;
  resetMessage: string | null;
  lastReset: string | null;
  mapStyle: string;
  readingCount: number;
  isFileMode: boolean;
  onStyleChange: (style: string) => void;
  onSaveData: () => void;
  onLoadData: (file: File) => void;
  onResumeLive: () => void;
  onReset: () => void;
}

/* Left sidebar panel for map controls and future features */
const Sidebar = ({ resetting, resetMessage, lastReset, mapStyle, readingCount, isFileMode, onStyleChange, onSaveData, onLoadData, onResumeLive, onReset }: SidebarProps) => {
  const [confirming, setConfirming] = useState(false);

  /* Execute the reset and dismiss the confirmation overlay */
  const handleConfirm = () => {
    setConfirming(false);
    onReset();
  };

  return (
    <aside className="sidebar">
      <h1 className="sidebar__title">Tetra Heatmap</h1>

      <div className="sidebar__content">
        <MapPresets mapStyle={mapStyle} onStyleChange={onStyleChange} />
        <DataControls
          readingCount={readingCount}
          isFileMode={isFileMode}
          onSave={onSaveData}
          onLoad={onLoadData}
          onResumeLive={onResumeLive}
        />
      </div>

      <div className="sidebar__footer">
        {resetMessage && <span className="sidebar__message">{resetMessage}</span>}
        <button
          className="sidebar__reset-btn"
          onClick={() => setConfirming(true)}
          disabled={resetting}
        >
          {resetting ? "Resetting..." : "Reset Cache"}
        </button>
      </div>

      {confirming && (
        <Confirm
          title="Reset Cached Data"
          message="This will clear all cached readings. New data will only be collected from this point onwards."
          detail={`Last reset: ${lastReset ? formatResetDate(lastReset) : "Never"}`}
          confirmLabel="Reset Cache"
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </aside>
  );
};

export default Sidebar;
