import { useState, useEffect, useCallback } from "react";
import ReactMapGL, {
  Source,
  Layer,
  type ViewStateChangeEvent,
} from "react-map-gl/mapbox";
import type { HeatmapLayerSpecification } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { fetchReadings, resetCache, type Reading } from "../../utils/api";
import { readingsToGeoJSON, readingsBounds } from "../../utils/geojson";
import "./Map.scss";

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

/* Viewport shape used by react-map-gl */
interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
}

/* Compute a viewport that encompasses a bounding box [west, south, east, north] */
const viewStateFromBounds = (bounds: [number, number, number, number]): ViewState => {
  const [west, south, east, north] = bounds;
  const longitude = (west + east) / 2;
  const latitude = (south + north) / 2;
  const lonSpan = east - west;
  const latSpan = north - south;
  const span = Math.max(lonSpan, latSpan, 0.001);
  const zoom = Math.min(Math.log2(360 / span) - 1, 16);
  return { longitude, latitude, zoom };
};

/* Full-viewport MapBox map with RSSI heatmap layer */
const Map = () => {
  const [viewState, setViewState] = useState<ViewState | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  /* Fetch readings from the API. On first successful load, derive the
     initial viewport from the data bounding box so the map opens already
     centred on the readings — no fly animation needed. */
  const loadReadings = useCallback(async () => {
    try {
      const data = await fetchReadings();
      setReadings(data);

      /* Set initial viewport from data bounds (first load only) */
      setViewState((prev) => {
        if (prev) return prev;
        const bounds = readingsBounds(data);
        if (!bounds) return prev;
        return viewStateFromBounds(bounds);
      });
    } catch (err) {
      console.error("[map] Failed to fetch readings:", err);
    }
  }, []);

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
      setResetMessage(`Cache cleared — syncing from ${new Date(syncFrom).toLocaleTimeString()}`);
      setTimeout(() => setResetMessage(null), 3000);
    } catch {
      setResetMessage("Reset failed — check server connection");
      setTimeout(() => setResetMessage(null), 3000);
    } finally {
      setResetting(false);
    }
  };

  /* Don't render the map until we know where the data is */
  if (!viewState) {
    return <div className="map-container" />;
  }

  return (
    <div className="map-container">
      <ReactMapGL
        {...viewState}
        onMove={handleMove}
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
