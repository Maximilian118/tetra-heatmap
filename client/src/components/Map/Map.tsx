import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import DeckGL from "@deck.gl/react";
import { Map as MapGL } from "react-map-gl/mapbox";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { ScatterplotLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import "mapbox-gl/dist/mapbox-gl.css";
import { fetchReadings, resetCache, type Reading } from "../../utils/api";
import { readingsBounds } from "../../utils/geojson";
import { normalizeRssi, RSSI_COLOR_RANGE } from "../../utils/rssi";
import Tooltip, { type TooltipInfo } from "./Tooltip/Tooltip";
import Sidebar from "./Sidebar/Sidebar";
import RssiLegend from "./RssiLegend/RssiLegend";
import "./Map.scss";

/* How often to poll for new readings (ms) */
const POLL_INTERVAL_MS = 30_000;

/* Reads the MapBox token from Vite env */
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;

/* How long to wait after the last interaction before saving view state (ms) */
const VIEW_SAVE_DELAY_MS = 500;

/* localStorage key for persisted map viewport */
const VIEW_STATE_KEY = "mapViewState";

/* Viewport shape used by deck.gl / react-map-gl */
interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  bearing: number;
  pitch: number;
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
  return { longitude, latitude, zoom, bearing: 0, pitch: 0 };
};

/* Try to restore a previously saved view state from localStorage */
const loadSavedViewState = (): ViewState | null => {
  try {
    const raw = localStorage.getItem(VIEW_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.longitude === "number" &&
      typeof parsed.latitude === "number" &&
      typeof parsed.zoom === "number"
    ) {
      return {
        longitude: parsed.longitude,
        latitude: parsed.latitude,
        zoom: parsed.zoom,
        bearing: parsed.bearing ?? 0,
        pitch: parsed.pitch ?? 0,
      };
    }
  } catch { /* corrupt data — ignore */ }
  return null;
};

/* Full-viewport MapBox map with deck.gl RSSI heatmap + hover tooltips */
const Map = () => {
  const [initialView, setInitialView] = useState<ViewState | null>(() => loadSavedViewState());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [lastReset, setLastReset] = useState<string | null>(() => localStorage.getItem("lastCacheReset"));
  const [mapStyle, setMapStyle] = useState("mapbox://styles/mapbox/navigation-preview-night-v4");
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);

  /* Log deck.gl rendering errors (layer failures, shader errors, etc.) */
  const handleDeckError = useCallback((error: Error, layer?: unknown) => {
    console.error("[deck.gl] error:", error.message, layer);
  }, []);

  /* Debounce-save the current viewport to localStorage so it persists across refreshes */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleViewStateChange = useCallback(({ viewState }: any) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      localStorage.setItem(VIEW_STATE_KEY, JSON.stringify({
        longitude: viewState.longitude,
        latitude: viewState.latitude,
        zoom: viewState.zoom,
        bearing: viewState.bearing,
        pitch: viewState.pitch,
      }));
    }, VIEW_SAVE_DELAY_MS);
  }, []);

  /* Log MapBox errors (tile load failures, style errors, WebGL issues) */
  const handleMapError = useCallback((e: { error?: { message?: string } }) => {
    console.error("[mapbox] error:", e.error?.message ?? e);
  }, []);

  /* Fetch readings from the API. On first successful load, derive the
     initial viewport from the data bounding box so the map opens already
     centred on the readings — no fly animation needed. */
  const loadReadings = useCallback(async () => {
    try {
      const data = await fetchReadings();
      setReadings(data);

      /* Set initial viewport from data bounds (first load only) */
      setInitialView((prev) => {
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

  /* Filter out readings without a valid RSSI — they can't be visualised */
  const validReadings = useMemo(
    () => readings.filter((r) => r.rssi !== null),
    [readings]
  );

  /* Build deck.gl layers — heatmap for visualisation, scatterplot for hover picking */
  const layers = useMemo(() => [
    /* Smooth heatmap coloured by average RSSI value (not density).
       MEAN aggregation gives the weighted average RSSI at each pixel.
       colorDomain [0.01, 1.0] ensures all readings render at full opacity —
       colour alone conveys signal quality, no alpha fading for weak signals. */
    new HeatmapLayer<Reading>({
      id: "rssi-heatmap",
      data: validReadings,
      getPosition: (d) => [d.longitude, d.latitude],
      getWeight: (d) => normalizeRssi(d.rssi!),
      aggregation: "MEAN",
      colorDomain: [0.3, 1.0],
      colorRange: RSSI_COLOR_RANGE,
      radiusPixels: 20,
      intensity: 1,
      opacity: 0.8,
      debounceTimeout: 500,
    }),

    /* Invisible pickable dots for hover tooltips */
    new ScatterplotLayer<Reading>({
      id: "rssi-tooltip-targets",
      data: validReadings,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: 8,
      radiusMinPixels: 8,
      getFillColor: [0, 0, 0, 0],
      pickable: true,
      onHover: (info: PickingInfo<Reading>) => {
        if (info.object) {
          setTooltip({
            x: info.x,
            y: info.y,
            ssi: info.object.ssi,
            rssi: info.object.rssi!,
            timestamp: info.object.timestamp,
          });
        } else {
          setTooltip(null);
        }
      },
    }),
  ], [validReadings]);

  /* Wipe the local cache, reset the view flag, and show a brief confirmation */
  const handleReset = async () => {
    setResetting(true);
    try {
      const { syncFrom } = await resetCache();
      setReadings([]);
      localStorage.setItem("lastCacheReset", syncFrom);
      setLastReset(syncFrom);
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
  if (!initialView) {
    return <div className="map-container" />;
  }

  return (
    <div className="map-container">
      <Sidebar
        resetting={resetting}
        resetMessage={resetMessage}
        lastReset={lastReset}
        mapStyle={mapStyle}
        onStyleChange={setMapStyle}
        onReset={handleReset}
      />

      <div className="map-area">
        {/* DeckGL as root — owns canvas + interactions.
            MapGL is a child that renders tiles and follows DeckGL's viewport. */}
        <DeckGL
          initialViewState={initialView}
          controller
          layers={layers}
          onViewStateChange={handleViewStateChange}
          onError={handleDeckError}
        >
          <MapGL
            mapboxAccessToken={MAPBOX_TOKEN}
            mapStyle={mapStyle}
            onError={handleMapError}
          />
        </DeckGL>

        <Tooltip tooltip={tooltip} />
        <RssiLegend />
      </div>
    </div>
  );
};

export default Map;
