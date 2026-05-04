import { useState, useRef, useCallback, useEffect } from "react";
import { Menu, X, Map, Settings, RotateCcw, Check, FileText } from "lucide-react";
import type { Reading, MapSymbol } from "../../../utils/api";
import type { KmlData, KmlFolder, KmlLayerStyle } from "../../../utils/kml";
import type { CustomSpectrum } from "../../../utils/rssi";
import Confirm from "../Confirm/Confirm";
import KmlLayers from "./KmlLayers/KmlLayers";
import MapPresets from "./MapPresets/MapPresets";
import type { LayerType } from "./MapPresets/MapPresets";
import DataControls from "./DataControls/DataControls";
import SsiFilter from "./SsiFilter/SsiFilter";
import Customise from "./Customise/Customise";
import type { LayerSettings } from "./Customise/Customise";
import DatabaseSettings from "./DatabaseSettings/DatabaseSettings";
import type { DatabaseSettingsHandle } from "./DatabaseSettings/DatabaseSettings";
import Symbols from "./Symbols/Symbols";
import ColourSpectrum from "./ColourSpectrum/ColourSpectrum";
import SideBarButton from "./SideBarButton/SideBarButton";
import "./Sidebar.scss";

/* Breakpoint at which the sidebar collapses into a mobile overlay */
const MOBILE_BREAKPOINT = 768;

/* Format an ISO timestamp into a user-friendly locale string */
const formatResetDate = (iso: string): string =>
  new Date(iso).toLocaleString();

type SidebarTab = "map" | "database" | "symbols" | "colour";

interface SidebarProps {
  resetting: boolean;
  resetMessage: string | null;
  lastReset: string | null;
  mapStyle: string;
  layerType: LayerType;
  layerSettings: LayerSettings;
  readings: Reading[];
  isFileMode: boolean;
  kmlLoaded: boolean;
  kmlFolders: KmlFolder[];
  kmlLayerStyles: Record<string, KmlLayerStyle>;
  onKmlLayerStyleChange: (folderName: string, style: KmlLayerStyle) => void;
  onStyleChange: (style: string) => void;
  onLayerTypeChange: (type: LayerType) => void;
  onSettingsChange: (settings: LayerSettings) => void;
  onKmlLoad: (data: KmlData) => void;
  onScopeAdjusting: (adjusting: boolean) => void;
  onSaveData: () => void;
  onLoadData: (file: File) => void;
  onResumeLive: () => void;
  onReset: () => void;
  onToggleRegister: () => void;
  selectedSsis: Set<number>;
  dataAgeMinutes: number | null;
  onDataAgeChange: (minutes: number | null) => void;
  retentionDays: number;
  maxAccuracy: number;
  onAccuracyChange: (metres: number) => void;
  clockOffsetMs: number;
  serverTzOffsetHours: number;
  onShowStats: () => void;
  symbols: MapSymbol[];
  symbolSize: number;
  onSymbolSizeChange: (size: number) => void;
  selectedSymbolId: string | null;
  onSelectSymbol: (id: string | null) => void;
  onDeleteSymbol: (id: string) => void;
  onFlyTo: (longitude: number, latitude: number) => void;
  onDirectionChange: (id: string, direction: number) => void;
  customSpectrum: CustomSpectrum;
  onSpectrumChange: (spectrum: CustomSpectrum) => void;
  colourTabTrigger: number;
}

/* Left sidebar panel with Map and Database tabs */
const Sidebar = ({ resetting, resetMessage, lastReset, mapStyle, layerType, layerSettings, readings, isFileMode, kmlLoaded, kmlFolders, kmlLayerStyles, onKmlLayerStyleChange, onStyleChange, onLayerTypeChange, onSettingsChange, onKmlLoad, onScopeAdjusting, onSaveData, onLoadData, onResumeLive, onReset, onToggleRegister, selectedSsis, dataAgeMinutes, onDataAgeChange, retentionDays, maxAccuracy, onAccuracyChange, clockOffsetMs, serverTzOffsetHours, onShowStats, symbols, symbolSize, onSymbolSizeChange, selectedSymbolId, onSelectSymbol, onDeleteSymbol, onFlyTo, onDirectionChange, customSpectrum, onSpectrumChange, colourTabTrigger }: SidebarProps) => {
  const [activeTab, setActiveTab] = useState<SidebarTab>("map");
  const [confirming, setConfirming] = useState(false);
  const [dbSaving, setDbSaving] = useState(false);
  const [dbStatusMessage, setDbStatusMessage] = useState<string | null>(null);
  const dbRef = useRef<DatabaseSettingsHandle>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= MOBILE_BREAKPOINT);

  /* Track viewport width to toggle mobile mode */
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /* Switch to colour tab when the RSSI legend is clicked */
  useEffect(() => {
    if (colourTabTrigger > 0) {
      setActiveTab("colour");
      if (isMobile) setMobileOpen(true);
    }
  }, [colourTabTrigger, isMobile]);

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
    <>
    {/* Hamburger toggle — visible only on mobile when sidebar is closed */}
    {isMobile && !mobileOpen && (
      <button className="sidebar-toggle" onClick={() => setMobileOpen(true)} aria-label="Open menu">
        <Menu size={20} />
      </button>
    )}

    {/* Backdrop — tapping outside the sidebar closes it on mobile */}
    {isMobile && mobileOpen && (
      <div className="sidebar-backdrop" onClick={() => setMobileOpen(false)} />
    )}

    <aside className={`sidebar ${isMobile ? (mobileOpen ? "sidebar--open" : "sidebar--closed") : ""}`}>
      <h1 className="sidebar__title">Tetra Heatmap</h1>

      {/* Tab bar — Map on left, Settings on right */}
      <div className="sidebar__tabs">
        <button
          className={`sidebar__tab ${activeTab === "map" ? "sidebar__tab--active" : ""}`}
          onClick={() => setActiveTab("map")}
        >
          <Map size={14} />
          Map
        </button>
        <button
          className={`sidebar__tab ${activeTab === "database" ? "sidebar__tab--active" : ""}`}
          onClick={() => setActiveTab("database")}
        >
          <Settings size={14} />
          Settings
        </button>
      </div>

      <div className="sidebar__content">
        {activeTab === "map" ? (
          <>
            <MapPresets
              mapStyle={mapStyle}
              layerType={layerType}
              kmlLoaded={kmlLoaded}
              onStyleChange={onStyleChange}
              onLayerTypeChange={onLayerTypeChange}
              onKmlLoad={onKmlLoad}
            />
            <DataControls
              readings={readings}
              isFileMode={isFileMode}
              onSave={onSaveData}
              onLoad={onLoadData}
              onResumeLive={onResumeLive}
              onOpenSymbols={() => setActiveTab("symbols")}
              clockOffsetMs={clockOffsetMs}
              serverTzOffsetHours={serverTzOffsetHours}
            />
            <SsiFilter
              onToggleRegister={onToggleRegister}
              selectedSsis={selectedSsis}
              isFileMode={isFileMode}
              dataAgeMinutes={dataAgeMinutes}
              onDataAgeChange={onDataAgeChange}
              retentionDays={retentionDays}
              maxAccuracy={maxAccuracy}
              onAccuracyChange={onAccuracyChange}
            />
            <Customise
              layerType={layerType}
              settings={layerSettings}
              onSettingsChange={onSettingsChange}
              onScopeAdjusting={onScopeAdjusting}
              onOpenColour={() => setActiveTab("colour")}
            />
            {layerType === "kml" && kmlFolders.length > 0 && (
              <KmlLayers
                folders={kmlFolders}
                styles={kmlLayerStyles}
                onStyleChange={onKmlLayerStyleChange}
              />
            )}
          </>
        ) : activeTab === "symbols" ? (
          <Symbols
            symbols={symbols}
            symbolSize={symbolSize}
            onSymbolSizeChange={onSymbolSizeChange}
            selectedSymbolId={selectedSymbolId}
            onSelectSymbol={onSelectSymbol}
            onDelete={onDeleteSymbol}
            onFlyTo={onFlyTo}
            onDirectionChange={onDirectionChange}
          />
        ) : activeTab === "colour" ? (
          <ColourSpectrum
            spectrum={customSpectrum}
            onSpectrumChange={onSpectrumChange}
          />
        ) : (
          <DatabaseSettings ref={dbRef} onStateChange={handleDbStateChange} onShowStats={onShowStats} />
        )}
      </div>

      {/* Footer — Map tab shows Reset Cache, Symbols tab shows Close, Settings tab shows Apply */}
      {activeTab === "map" ? (
        <div className="sidebar__footer">
          <span className="sidebar__hint">Hold Shift + drag to rotate and tilt the map</span>
          {resetMessage && <span className="sidebar__message">{resetMessage}</span>}
          <SideBarButton
            icon={FileText}
            label="Generate Report"
            onClick={() => {}}
          />
        </div>
      ) : activeTab === "symbols" || activeTab === "colour" ? (
        <div className="sidebar__footer">
          <SideBarButton icon={X} label="Close" onClick={() => setActiveTab("map")} />
        </div>
      ) : (
        <div className="sidebar__footer">
          {dbStatusMessage && <span className="sidebar__message">{dbStatusMessage}</span>}
          <SideBarButton
            icon={RotateCcw}
            label={resetting ? "Resetting..." : "Reset Cache"}
            onClick={() => setConfirming(true)}
            disabled={resetting}
          />
          <SideBarButton
            icon={Check}
            label={dbSaving ? "Applying..." : "Apply"}
            onClick={() => dbRef.current?.apply()}
            disabled={dbSaving}
            variant="accent"
          />
        </div>
      )}

      {confirming && (
        <Confirm
          title="Reset Cached Data"
          message="This will clear all cached readings. New data will only be collected from this point onwards."
          detail={`Last reset: ${lastReset ? formatResetDate(lastReset) : "Never"}`}
          confirmLabel="Reset Cache"
          confirmIcon={RotateCcw}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}

      {/* Close button — visible only on mobile when sidebar is open */}
      {isMobile && mobileOpen && (
        <button className="sidebar__close" onClick={() => setMobileOpen(false)} aria-label="Close menu">
          <X size={18} />
        </button>
      )}
    </aside>
    </>
  );
};

export default Sidebar;
