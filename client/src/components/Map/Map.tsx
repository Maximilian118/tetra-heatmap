import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import DeckGL from "@deck.gl/react";
import { Map as MapGL } from "react-map-gl/mapbox";
import { HeatmapLayer, HexagonLayer } from "@deck.gl/aggregation-layers";
import { ScatterplotLayer, LineLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import "mapbox-gl/dist/mapbox-gl.css";
import { fetchReadings, resetCache, fetchSettings, fetchSubscribers, geocodeCoordinates, type Reading, type Subscriber } from "../../utils/api";
import { saveDataset, loadDataset, deriveSubscribersFromReadings, type SavedViewState } from "../../utils/dataset";
import { readingsBounds } from "../../utils/geojson";
import { normalizeRssi, rssiElevationWeight, rssiToColor, RSSI_COLOR_RANGE, buildLineSegments } from "../../utils/rssi";
import type { LayerType } from "./Sidebar/MapPresets/MapPresets";
import { DEFAULT_LAYER_SETTINGS, type LayerSettings } from "./Sidebar/Customise/Customise";
import Tooltip, { type TooltipInfo } from "./Tooltip/Tooltip";
import Sidebar from "./Sidebar/Sidebar";
import RssiLegend from "./RssiLegend/RssiLegend";
import SsiRegister from "./SsiRegister/SsiRegister";
import MapboxSetup from "./MapboxSetup/MapboxSetup";
import "./Map.scss";

/* How often to poll for new readings (ms) */
const POLL_INTERVAL_MS = 30_000;

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

/* Fallback viewport when there are no readings and no saved view in localStorage */
const DEFAULT_VIEW: ViewState = {
  longitude: 0,
  latitude: 30,
  zoom: 2,
  bearing: 0,
  pitch: 0,
};

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
  const savingRef = useRef(false);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [lastReset, setLastReset] = useState<string | null>(() => localStorage.getItem("lastCacheReset"));
  const [mapStyle, setMapStyle] = useState("mapbox://styles/mapbox/navigation-guidance-night-v4");
  const [layerType, setLayerType] = useState<LayerType>("heatmap");
  const [layerSettings, setLayerSettings] = useState<LayerSettings>(DEFAULT_LAYER_SETTINGS);
  const [fileReadings, setFileReadings] = useState<Reading[] | null>(null);
  const [fileSubscribers, setFileSubscribers] = useState<Subscriber[] | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [dbConnected, setDbConnected] = useState(false);
  const [selectedSsis, setSelectedSsis] = useState<Set<number>>(new Set());
  const [dataAgeMinutes, setDataAgeMinutes] = useState<number | null>(null);
  const [retentionDays, setRetentionDays] = useState(5);

  /* Use file data when loaded, otherwise fall back to live server data */
  const displayedReadings = fileReadings ?? readings;

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

  /* Fetch the Mapbox token and DB connection status from server settings on mount */
  useEffect(() => {
    fetchSettings()
      .then((s) => {
        setMapboxToken(s.mapboxToken || "");
        setDbConnected(s.dbHost.trim() !== "" && s.dbUser.trim() !== "");
        if (s.retentionDays > 0) setRetentionDays(s.retentionDays);
      })
      .catch((err) => console.error("[map] Failed to fetch settings:", err));
  }, []);

  /* Filter readings by data age — cutoff is relative to newest reading (file mode) or now (live) */
  const ageFilteredReadings = useMemo(() => {
    if (dataAgeMinutes === null) return displayedReadings;
    const cutoffMs = dataAgeMinutes * 60_000;
    let refTime: number;
    if (fileReadings !== null && displayedReadings.length > 0) {
      refTime = -Infinity;
      for (const r of displayedReadings) {
        const t = new Date(r.timestamp).getTime();
        if (t > refTime) refTime = t;
      }
    } else {
      refTime = Date.now();
    }
    const threshold = refTime - cutoffMs;
    return displayedReadings.filter((r) => new Date(r.timestamp).getTime() >= threshold);
  }, [displayedReadings, dataAgeMinutes, fileReadings]);

  /* When ISSIs are selected in the SSI Register, only show their readings */
  const filteredReadings = useMemo(
    () => selectedSsis.size > 0
      ? ageFilteredReadings.filter((r) => selectedSsis.has(r.ssi))
      : ageFilteredReadings,
    [ageFilteredReadings, selectedSsis]
  );

  /* Filter out readings without a valid RSSI — they can't be visualised */
  const validReadings = useMemo(
    () => filteredReadings.filter((r) => r.rssi !== null),
    [filteredReadings]
  );

  /* Pre-compute line segments when in line mode (memoised to avoid re-grouping on every render) */
  const lineSegments = useMemo(
    () => (layerType === "line" ? buildLineSegments(validReadings) : []),
    [validReadings, layerType]
  );

  /* Build deck.gl layers — the visualisation layer changes based on layerType,
     while the invisible scatterplot for hover tooltips is always present. */
  const layers = useMemo(() => {
    /* Choose the primary visualisation layer based on the active layer type */
    const vizLayer =
      layerType === "hexagon"
        ? /* 3D hexagonal bins — both colour and height encode average RSSI per hex */
          new HexagonLayer<Reading>({
            id: "rssi-hexagon",
            data: validReadings,
            getPosition: (d) => [d.longitude, d.latitude],
            getColorWeight: (d) => normalizeRssi(d.rssi!),
            colorAggregation: "MEAN",
            colorDomain: [0.1, 1.0],
            colorRange: RSSI_COLOR_RANGE,
            getElevationWeight: (d) => rssiElevationWeight(d.rssi!),
            elevationAggregation: "MEAN",
            elevationDomain: [0, 1],
            elevationRange: [2, 80],
            elevationScale: layerSettings.elevationScale,
            upperPercentile: 100,
            radius: layerSettings.hexRadius,
            extruded: true,
            coverage: layerSettings.coverage,
            opacity: layerSettings.opacity,
            material: {
              ambient: 0.64,
              diffuse: 0.6,
              shininess: 32,
              specularColor: [51, 51, 51],
            },
          })
        : layerType === "line"
          ? /* Per-radio movement trails coloured by RSSI at each segment endpoint */
            new LineLayer({
              id: "rssi-lines",
              data: lineSegments,
              getSourcePosition: (d) => d.sourcePosition,
              getTargetPosition: (d) => d.targetPosition,
              getColor: (d) => rssiToColor(d.rssi),
              getWidth: layerSettings.lineWidth,
              widthMinPixels: 1,
              opacity: layerSettings.opacity,
            })
          : /* Smooth heatmap coloured by average RSSI value (not density).
               MEAN aggregation gives the weighted average RSSI at each pixel.
               colorDomain [0.3, 1.0] ensures all readings render at full opacity —
               colour alone conveys signal quality, no alpha fading for weak signals. */
            new HeatmapLayer<Reading>({
              id: "rssi-heatmap",
              data: validReadings,
              getPosition: (d) => [d.longitude, d.latitude],
              getWeight: (d) => normalizeRssi(d.rssi!),
              aggregation: "MEAN",
              colorDomain: [0.3, 1.0],
              colorRange: RSSI_COLOR_RANGE,
              radiusPixels: layerSettings.radiusPixels,
              intensity: 1,
              opacity: layerSettings.opacity,
              debounceTimeout: 500,
            });

    return [
      vizLayer,

      /* Invisible pickable dots for hover tooltips — active on all layer types */
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
    ];
  }, [validReadings, layerType, lineSegments, layerSettings]);

  /* Download the currently displayed readings as a JSON file via the browser save dialog */
  const handleSaveData = useCallback(async () => {
    /* Prevent concurrent saves from rapid clicks */
    if (savingRef.current) return;
    savingRef.current = true;

    try {
      const savedView = loadSavedViewState() as SavedViewState | undefined;

      /* Snapshot the current SSI Register: use file subscribers if loaded, otherwise fetch live */
      let subscribers: Subscriber[] | undefined;
      try {
        subscribers = fileSubscribers ?? await fetchSubscribers();
      } catch (err) {
        console.error("[map] Failed to fetch subscribers for save:", err);
      }

      await saveDataset(displayedReadings, savedView ?? undefined, mapStyle, subscribers);
    } finally {
      savingRef.current = false;
    }
  }, [displayedReadings, mapStyle, fileSubscribers]);

  /* Load readings from a user-selected JSON file and switch to file mode */
  const handleLoadData = useCallback(async (file: File) => {
    try {
      const { readings: data, viewState, mapStyle: style, subscribers } = await loadDataset(file);
      setDataAgeMinutes(null);
      setFileReadings(data);

      /* Use saved subscribers if present, otherwise derive from readings and geocode */
      if (subscribers?.length) {
        setFileSubscribers(subscribers);
      } else {
        const { subscribers: derived, toGeocode } = deriveSubscribersFromReadings(data);
        setFileSubscribers(derived);

        /* Geocode last reading locations in the background */
        if (toGeocode.length > 0) {
          geocodeCoordinates(toGeocode.map(({ latitude, longitude }) => ({ latitude, longitude })))
            .then((locations) => {
              setFileSubscribers((prev) => {
                if (!prev) return prev;
                const updated = [...prev];
                toGeocode.forEach(({ index }, i) => {
                  if (locations[i]) updated[index] = { ...updated[index], last_location: locations[i] };
                });
                return updated;
              });
            })
            .catch(() => { /* geocoding unavailable — locations stay empty */ });
        }
      }

      /* Restore saved view state from file, or fall back to data bounds */
      if (viewState) {
        setInitialView(viewState);
      } else {
        const bounds = readingsBounds(data);
        if (bounds) setInitialView(viewStateFromBounds(bounds));
      }

      /* Restore saved map style if present */
      if (style) setMapStyle(style);
    } catch (err) {
      console.error("[map] Failed to load dataset:", err);
    }
  }, []);

  /* Switch back to live server data by clearing the file overlay */
  const handleResumeLive = useCallback(() => {
    setFileReadings(null);
    setFileSubscribers(null);
  }, []);

  /* Toggle the SSI Register overlay open/closed */
  const handleToggleRegister = useCallback(() => {
    setRegisterOpen((prev) => !prev);
  }, []);

  /* Toggle a single SSI in the selection set */
  const handleToggleSsi = useCallback((ssi: number) => {
    setSelectedSsis((prev) => {
      const next = new Set(prev);
      if (next.has(ssi)) next.delete(ssi);
      else next.add(ssi);
      return next;
    });
  }, []);

  /* Clear all SSI selections — show all readings again */
  const handleResetSsiFilter = useCallback(() => {
    setSelectedSsis(new Set());
  }, []);

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

  /* Still loading settings from server */
  if (mapboxToken === null) {
    return <div className="map-container" />;
  }

  /* No Mapbox token configured — show first-time setup screen */
  if (!mapboxToken) {
    return <MapboxSetup />;
  }

  /* Resolve the viewport: saved view > data bounds > world overview fallback */
  const resolvedView = initialView ?? DEFAULT_VIEW;

  return (
    <div className="map-container">
      <Sidebar
        resetting={resetting}
        resetMessage={resetMessage}
        lastReset={lastReset}
        mapStyle={mapStyle}
        layerType={layerType}
        layerSettings={layerSettings}
        readings={displayedReadings}
        isFileMode={fileReadings !== null}
        onStyleChange={setMapStyle}
        onLayerTypeChange={setLayerType}
        onSettingsChange={setLayerSettings}
        onSaveData={handleSaveData}
        onLoadData={handleLoadData}
        onResumeLive={handleResumeLive}
        onReset={handleReset}
        onToggleRegister={handleToggleRegister}
        selectedSsis={selectedSsis}
        dataAgeMinutes={dataAgeMinutes}
        onDataAgeChange={setDataAgeMinutes}
        retentionDays={retentionDays}
      />

      <div className="map-area">
        {/* DeckGL as root — owns canvas + interactions.
            MapGL is a child that renders tiles and follows DeckGL's viewport. */}
        <DeckGL
          initialViewState={resolvedView}
          controller
          layers={layers}
          onViewStateChange={handleViewStateChange}
          onError={handleDeckError}
        >
          <MapGL
            mapboxAccessToken={mapboxToken}
            mapStyle={mapStyle}
            onError={handleMapError}
          />
        </DeckGL>

        <Tooltip tooltip={tooltip} />
        <RssiLegend />

        {/* SSI Register overlay — rendered on top of the map without unmounting it */}
        {registerOpen && (
          <SsiRegister
            onClose={() => setRegisterOpen(false)}
            dbConnected={dbConnected}
            selectedSsis={selectedSsis}
            onToggleSsi={handleToggleSsi}
            onResetFilter={handleResetSsiFilter}
            fileSubscribers={fileSubscribers}
            isFileMode={fileReadings !== null}
          />
        )}
      </div>
    </div>
  );
};

export default Map;
