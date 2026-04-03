import { useState, useRef, useCallback } from "react";
import Confirm from "./Confirm/Confirm";
import MapPresets from "./MapPresets/MapPresets";
import type { LayerType } from "./MapPresets/MapPresets";
import DataControls from "./DataControls/DataControls";
import Customise from "./Customise/Customise";
import type { LayerSettings } from "./Customise/Customise";
import DatabaseSettings from "./DatabaseSettings/DatabaseSettings";
import type { DatabaseSettingsHandle } from "./DatabaseSettings/DatabaseSettings";
import "./Sidebar.scss";

/* Format an ISO timestamp into a user-friendly locale string */
const formatResetDate = (iso: string): string =>
  new Date(iso).toLocaleString();

type SidebarTab = "map" | "database";

interface SidebarProps {
  resetting: boolean;
  resetMessage: string | null;
  lastReset: string | null;
  mapStyle: string;
  layerType: LayerType;
  layerSettings: LayerSettings;
  readingCount: number;
  isFileMode: boolean;
  onStyleChange: (style: string) => void;
  onLayerTypeChange: (type: LayerType) => void;
  onSettingsChange: (settings: LayerSettings) => void;
  onSaveData: () => void;
  onLoadData: (file: File) => void;
  onResumeLive: () => void;
  onReset: () => void;
}

/* Left sidebar panel with Map and Database tabs */
const Sidebar = ({ resetting, resetMessage, lastReset, mapStyle, layerType, layerSettings, readingCount, isFileMode, onStyleChange, onLayerTypeChange, onSettingsChange, onSaveData, onLoadData, onResumeLive, onReset }: SidebarProps) => {
  const [activeTab, setActiveTab] = useState<SidebarTab>("map");
  const [confirming, setConfirming] = useState(false);
  const [dbSaving, setDbSaving] = useState(false);
  const [dbStatusMessage, setDbStatusMessage] = useState<string | null>(null);
  const dbRef = useRef<DatabaseSettingsHandle>(null);

  /* Execute the reset and dismiss the confirmation overlay */
  const handleConfirm = () => {
    setConfirming(false);
    onReset();
  };

  /* Receive saving/status updates from the DatabaseSettings component */
  const handleDbStateChange = useCallback(
    (state: { saving: boolean; statusMessage: string | null }) => {
      setDbSaving(state.saving);
      setDbStatusMessage(state.statusMessage);
    },
    []
  );

  return (
    <aside className="sidebar">
      <h1 className="sidebar__title">Tetra Heatmap</h1>

      {/* Tab bar — Map on left, Settings on right */}
      <div className="sidebar__tabs">
        <button
          className={`sidebar__tab ${activeTab === "map" ? "sidebar__tab--active" : ""}`}
          onClick={() => setActiveTab("map")}
        >
          Map
        </button>
        <button
          className={`sidebar__tab ${activeTab === "database" ? "sidebar__tab--active" : ""}`}
          onClick={() => setActiveTab("database")}
        >
          Settings
        </button>
      </div>

      <div className="sidebar__content">
        {activeTab === "map" ? (
          <>
            <MapPresets
              mapStyle={mapStyle}
              layerType={layerType}
              onStyleChange={onStyleChange}
              onLayerTypeChange={onLayerTypeChange}
            />
            <DataControls
              readingCount={readingCount}
              isFileMode={isFileMode}
              onSave={onSaveData}
              onLoad={onLoadData}
              onResumeLive={onResumeLive}
            />
            <Customise
              layerType={layerType}
              settings={layerSettings}
              onSettingsChange={onSettingsChange}
            />
          </>
        ) : (
          <DatabaseSettings ref={dbRef} onStateChange={handleDbStateChange} />
        )}
      </div>

      {/* Footer — Map tab shows Reset Cache, Settings tab shows Apply */}
      {activeTab === "map" ? (
        <div className="sidebar__footer">
          <span className="sidebar__hint">Hold Shift + drag to rotate and tilt the map</span>
          {resetMessage && <span className="sidebar__message">{resetMessage}</span>}
          <button
            className="sidebar__reset-btn"
            onClick={() => setConfirming(true)}
            disabled={resetting}
          >
            {resetting ? "Resetting..." : "Reset Cache"}
          </button>
        </div>
      ) : (
        <div className="sidebar__footer">
          {dbStatusMessage && <span className="sidebar__message">{dbStatusMessage}</span>}
          <button
            className="sidebar__apply-btn"
            onClick={() => dbRef.current?.apply()}
            disabled={dbSaving}
          >
            {dbSaving ? "Applying..." : "Apply"}
          </button>
        </div>
      )}

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
