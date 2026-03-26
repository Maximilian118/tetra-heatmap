import { useState } from "react";
import ReactMapGL, { type ViewStateChangeEvent } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { resetCache } from "../../utils/api";
import "./Map.scss";

/* Default viewport centred on Melbourne Albert Park */
const INITIAL_VIEW = {
  longitude: 144.968,
  latitude: -37.8497,
  zoom: 14,
};

/* Reads the MapBox token from Vite env */
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

/* Full-viewport MapBox map ready to receive heatmap layers */
const Map = () => {
  const [viewState, setViewState] = useState(INITIAL_VIEW);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  /* Sync viewport state on user interaction */
  const handleMove = (evt: ViewStateChangeEvent) => {
    setViewState(evt.viewState);
  };

  /* Wipe the local cache and show a brief confirmation */
  const handleReset = async () => {
    setResetting(true);
    try {
      const { syncFrom } = await resetCache();
      setResetMessage(`Cache cleared — syncing from ${new Date(syncFrom).toLocaleTimeString()}`);
      setTimeout(() => setResetMessage(null), 3000);
    } catch {
      setResetMessage("Reset failed — check server connection");
      setTimeout(() => setResetMessage(null), 3000);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="map-container">
      <ReactMapGL
        {...viewState}
        onMove={handleMove}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        style={{ width: "100%", height: "100%" }}
      />

      {/* Overlay controls */}
      <div className="map-controls">
        <button
          className="reset-btn"
          onClick={handleReset}
          disabled={resetting}
        >
          {resetting ? "Resetting..." : "Reset Cache"}
        </button>
        {resetMessage && <span className="reset-message">{resetMessage}</span>}
      </div>
    </div>
  );
};

export default Map;
