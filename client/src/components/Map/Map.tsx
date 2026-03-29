import { useState, useEffect, useRef, useCallback } from "react";
import ReactMapGL, {
  Source,
  Layer,
  type ViewStateChangeEvent,
  type MapRef,
} from "react-map-gl/mapbox";
import type { HeatmapLayerSpecification } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { fetchReadings, resetCache, type Reading } from "../../utils/api";
import { readingsToGeoJSON, readingsBounds } from "../../utils/geojson";
import "./Map.scss";

/* Default viewport centred on Melbourne Albert Park (before data loads) */
const INITIAL_VIEW = {
  longitude: 144.968,
  latitude: -37.8497,
  zoom: 14,
};

/* How often to poll for new readings (ms) */
const POLL_INTERVAL_MS = 30_000;

/* Reads the MapBox token from Vite env */
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

/* Heatmap style — blends nearby readings into a smooth density cloud.
   Weight is driven by RSSI: stronger signals (-20 dBm) contribute more
   intensity than weak ones (-100 dBm). Colour ramp runs from red (sparse /
   weak edges) through yellow to green (dense / strong center). */
const rssiHeatmapLayer: HeatmapLayerSpecification = {
  id: "rssi-heatmap",
  type: "heatmap",
  source: "rssi-data",
  paint: {
    /* Map RSSI values to a 0-1 weight (stronger signal = higher weight) */
    "heatmap-weight": [
      "interpolate", ["linear"], ["get", "rssi"],
      -100, 0,
      -20, 1,
    ],
    /* Global intensity multiplier — slight boost at higher zoom for detail */
    "heatmap-intensity": [
      "interpolate", ["linear"], ["zoom"],
      0, 1,
      16, 1.5,
    ],
    /* Density → colour ramp: green center (strong), red edges (weak) */
    "heatmap-color": [
      "interpolate", ["linear"], ["heatmap-density"],
      0.0, "rgba(0, 0, 0, 0)",
      0.2, "#dc143c",
      0.4, "#ff4500",
      0.6, "#ffa500",
      0.8, "#7cfc00",
      1.0, "#228b22",
    ],
    /* Blur radius in pixels — zoom-dependent for smooth blending */
    "heatmap-radius": [
      "interpolate", ["linear"], ["zoom"],
      0, 8,
      16, 30,
    ],
    "heatmap-opacity": 0.8,
  },
};

/* Full-viewport MapBox map with RSSI heatmap layer */
const Map = () => {
  const mapRef = useRef<MapRef>(null);
  const [viewState, setViewState] = useState(INITIAL_VIEW);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const hasFitted = useRef(false);
  const mapLoaded = useRef(false);
  const readingsRef = useRef<Reading[]>([]);

  /* Fly the map to the bounding box of all readings (called once per page load).
     Because map init and data fetch race each other, this is attempted from both
     the onLoad callback and from loadReadings — whichever fires last wins. */
  const fitToData = useCallback((data: Reading[]) => {
    if (hasFitted.current || data.length === 0 || !mapLoaded.current || !mapRef.current) return;
    const bounds = readingsBounds(data);
    if (bounds) {
      mapRef.current.fitBounds(bounds, { padding: 60, maxZoom: 16 });
      hasFitted.current = true;
    }
  }, []);

  /* Called when the MapBox map has fully initialised */
  const handleLoad = useCallback(() => {
    mapLoaded.current = true;
    fitToData(readingsRef.current);
  }, [fitToData]);

  /* Fetch readings from the API and attempt auto-center */
  const loadReadings = useCallback(async () => {
    try {
      const data = await fetchReadings();
      setReadings(data);
      readingsRef.current = data;
      fitToData(data);
    } catch (err) {
      console.error("[map] Failed to fetch readings:", err);
    }
  }, [fitToData]);

  /* Poll the API on mount and at a regular interval */
  useEffect(() => {
    loadReadings();
    const id = setInterval(loadReadings, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loadReadings]);

  /* Convert readings to GeoJSON for the heatmap layer */
  const geojson = readingsToGeoJSON(readings);

  /* Sync viewport state on user interaction */
  const handleMove = (evt: ViewStateChangeEvent) => {
    setViewState(evt.viewState);
  };

  /* Wipe the local cache, reset the view flag, and show a brief confirmation */
  const handleReset = async () => {
    setResetting(true);
    try {
      const { syncFrom } = await resetCache();
      setReadings([]);
      readingsRef.current = [];
      hasFitted.current = false;
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
        ref={mapRef}
        {...viewState}
        onMove={handleMove}
        onLoad={handleLoad}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        style={{ width: "100%", height: "100%" }}
      >
        {/* RSSI heatmap — blended density cloud coloured by signal strength */}
        <Source id="rssi-data" type="geojson" data={geojson}>
          <Layer {...rssiHeatmapLayer} />
        </Source>
      </ReactMapGL>

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

      {/* RSSI colour legend */}
      <div className="rssi-legend">
        <span className="rssi-legend__label">-100 dBm</span>
        <div className="rssi-legend__bar" />
        <span className="rssi-legend__label">-20 dBm</span>
      </div>
    </div>
  );
};

export default Map;
