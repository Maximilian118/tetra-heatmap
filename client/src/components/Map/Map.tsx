import { useState, useEffect, useCallback, useMemo, useRef, useDeferredValue } from "react";
import DeckGL from "@deck.gl/react";
import { Map as MapGL } from "react-map-gl/mapbox";
import { HeatmapLayer, HexagonLayer } from "@deck.gl/aggregation-layers";
import { ScatterplotLayer, PathLayer, IconLayer, GeoJsonLayer, TextLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import "mapbox-gl/dist/mapbox-gl.css";
import { fetchReadings, resetCache, fetchSettings, fetchSubscribers, geocodeCoordinates, fetchSymbols, createSymbol, updateSymbolPosition, updateSymbolDirection, updateSymbolSize as apiUpdateSymbolSize, deleteSymbol as apiDeleteSymbol, type Reading, type Subscriber, type MapSymbol } from "../../utils/api";
import { saveDataset, loadDataset, deriveSubscribersFromReadings, type SavedViewState } from "../../utils/dataset";
import { readingsBounds } from "../../utils/geojson";
import { normalizeRssi, rssiElevationWeight, RSSI_COLOR_RANGE, rssiToColor, buildPaths, buildColorRangeFromSpectrum, buildRssiToColorFromSpectrum, DEFAULT_CUSTOM_SPECTRUM, type RadioPath, type CustomSpectrum } from "../../utils/rssi";
import { buildKmlResult, getDefaultKmlLayerStyles, type KmlData, type KmlGeoJsonProperties, type KmlLayerStyle, type KmlLine, type KmlPoint } from "../../utils/kml";
import { buildBgAtlas, buildFgAtlas, ICON_MAPPING } from "../../utils/symbols";
import type { LayerType } from "./Sidebar/MapPresets/MapPresets";
import { DEFAULT_LAYER_SETTINGS, type LayerSettings } from "./Sidebar/Customise/Customise";
import Tooltip, { type TooltipInfo } from "./Tooltip/Tooltip";
import KmlTooltip, { type KmlTooltipInfo } from "./Tooltip/KmlTooltip";
import Sidebar from "./Sidebar/Sidebar";
import LogserverStats from "./LogserverStats/LogserverStats";
import RssiLegend from "./RssiLegend/RssiLegend";
import NorthArrow from "./NorthArrow/NorthArrow";
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
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [serverTzOffsetHours, setServerTzOffsetHours] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [lastReset, setLastReset] = useState<string | null>(() => localStorage.getItem("lastCacheReset"));
  const [mapStyle, setMapStyle] = useState("mapbox://styles/mapbox/navigation-guidance-night-v4");
  const [layerType, setLayerType] = useState<LayerType>("heatmap");
  const [layerSettings, setLayerSettings] = useState<LayerSettings>(DEFAULT_LAYER_SETTINGS);
  const [customSpectrum, setCustomSpectrum] = useState<CustomSpectrum>(() => {
    const saved = localStorage.getItem("customSpectrum");
    if (saved) { try { return JSON.parse(saved); } catch { /* ignore */ } }
    return DEFAULT_CUSTOM_SPECTRUM;
  });
  const [kmlData, setKmlData] = useState<KmlData | null>(null);
  const [kmlLayerStyles, setKmlLayerStyles] = useState<Record<string, KmlLayerStyle>>({});
  const [scopeAdjusting, setScopeAdjusting] = useState(false);
  const [fileReadings, setFileReadings] = useState<Reading[] | null>(null);
  const [fileSubscribers, setFileSubscribers] = useState<Subscriber[] | null>(null);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [kmlTooltip, setKmlTooltip] = useState<KmlTooltipInfo | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [dbConnected, setDbConnected] = useState(false);
  const [liveSubscribers, setLiveSubscribers] = useState<Subscriber[]>([]);
  const [selectedSsis, setSelectedSsis] = useState<Set<number>>(new Set());
  const [dataAgeMinutes, setDataAgeMinutes] = useState<number | null>(null);
  const [retentionDays, setRetentionDays] = useState(5);
  const [maxAccuracy, setMaxAccuracy] = useState(2);
  const [showStats, setShowStats] = useState(false);
  const [symbols, setSymbols] = useState<MapSymbol[]>([]);
  const [symbolSize, setSymbolSize] = useState(48);
  const [selectedSymbolId, setSelectedSymbolId] = useState<string | null>(null);
  const [draggingSymbolId, setDraggingSymbolId] = useState<string | null>(null);
  const [bearing, setBearing] = useState(0);
  const [colourTabTrigger, setColourTabTrigger] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deckRef = useRef<any>(null);
  const bgAtlasUrl = useMemo(() => buildBgAtlas().toDataURL(), []);
  const fgAtlasUrl = useMemo(() => buildFgAtlas().toDataURL(), []);

  /* Use file data when loaded, otherwise fall back to live server data */
  const displayedReadings = fileReadings ?? readings;

  /* Log deck.gl rendering errors (layer failures, shader errors, etc.) */
  const handleDeckError = useCallback((error: Error, layer?: unknown) => {
    console.error("[deck.gl] error:", error.message, layer);
  }, []);

  /* Debounce-save the current viewport to localStorage so it persists across refreshes */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleViewStateChange = useCallback(({ viewState }: any) => {
    setBearing(viewState.bearing ?? 0);
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

  /* Fetch readings and subscribers from the API. On first successful load,
     derive the initial viewport from the data bounding box so the map opens
     already centred on the readings — no fly animation needed. */
  const loadReadings = useCallback(async () => {
    try {
      const { readings: data, clockOffsetMs: offset, serverTzOffsetHours: tzOffset } = await fetchReadings();
      setReadings(data);
      setClockOffsetMs(offset);
      setServerTzOffsetHours(tzOffset);

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

    /* Refresh subscriber descriptions for tooltip lookups */
    try {
      setLiveSubscribers(await fetchSubscribers());
    } catch { /* subscriber fetch is non-critical */ }
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
        if (s.symbolSize > 0) setSymbolSize(s.symbolSize);
      })
      .catch((err) => console.error("[map] Failed to fetch settings:", err));
  }, []);

  /* Load placed symbols from the server on mount */
  const loadSymbols = useCallback(async () => {
    try {
      setSymbols(await fetchSymbols());
    } catch (err) {
      console.error("[map] Failed to fetch symbols:", err);
    }
  }, []);

  useEffect(() => { loadSymbols(); }, [loadSymbols]);

  /* Build an SSI → description lookup from whichever subscriber source is active */
  const ssiDescriptionMap = useMemo(() => {
    const subs = fileSubscribers ?? liveSubscribers;
    const lookup = new globalThis.Map<number, string>();
    for (const s of subs) {
      if (s.description) lookup.set(s.ssi, s.description);
    }
    return lookup;
  }, [fileSubscribers, liveSubscribers]);

  /* Filter readings by data age — adjusted for MySQL clock offset (disabled in file mode) */
  const ageFilteredReadings = useMemo(() => {
    if (dataAgeMinutes === null) return displayedReadings;
    const cutoffMs = dataAgeMinutes * 60_000;
    const threshold = (Date.now() - clockOffsetMs) - cutoffMs;
    return displayedReadings.filter((r) => new Date(r.timestamp).getTime() >= threshold);
  }, [displayedReadings, dataAgeMinutes, clockOffsetMs]);

  /* When ISSIs are selected in the SSI Register, only show their readings */
  const filteredReadings = useMemo(
    () => selectedSsis.size > 0
      ? ageFilteredReadings.filter((r) => selectedSsis.has(r.ssi))
      : ageFilteredReadings,
    [ageFilteredReadings, selectedSsis]
  );

  /* Filter by GPS accuracy — only show readings within the selected accuracy threshold */
  const accuracyFilteredReadings = useMemo(
    () => filteredReadings.filter((r) =>
      r.position_error !== null && r.position_error <= maxAccuracy
    ),
    [filteredReadings, maxAccuracy]
  );

  /* Filter out readings without a valid RSSI — they can't be visualised */
  const validReadings = useMemo(
    () => accuracyFilteredReadings.filter((r) => r.rssi !== null),
    [accuracyFilteredReadings]
  );

  /* Persist custom colour spectrum to localStorage */
  useEffect(() => {
    localStorage.setItem("customSpectrum", JSON.stringify(customSpectrum));
  }, [customSpectrum]);

  /* Derive active colour range and colour function from the custom spectrum */
  const { activeColorRange, activeRssiToColor } = useMemo(() => {
    if (!customSpectrum.enabled) {
      return { activeColorRange: RSSI_COLOR_RANGE, activeRssiToColor: rssiToColor };
    }
    return {
      activeColorRange: buildColorRangeFromSpectrum(customSpectrum.stops),
      activeRssiToColor: buildRssiToColorFromSpectrum(customSpectrum.stops),
    };
  }, [customSpectrum]);

  /* Pre-compute paths when in line mode (memoised to avoid re-grouping on every render) */
  const radioPaths = useMemo(
    () => (layerType === "path" ? buildPaths(validReadings, activeRssiToColor) : []),
    [validReadings, layerType, activeRssiToColor]
  );

  /* Deferred scope — React prioritises slider input over the geo-computation */
  const deferredScope = useDeferredValue(layerSettings.scope);

  /* Initialise default layer styles whenever a new KML is loaded */
  useEffect(() => {
    if (kmlData) setKmlLayerStyles(getDefaultKmlLayerStyles(kmlData.folders));
  }, [kmlData]);

  /* Collect visible polygons across all folders for RSSI computation */
  const visiblePolygons = useMemo(() => {
    if (!kmlData) return [];
    return kmlData.folders
      .filter((f) => kmlLayerStyles[f.name]?.visible && f.polygons.length > 0)
      .flatMap((f) => f.polygons);
  }, [kmlData, kmlLayerStyles]);

  /* Collect visible line folders for PathLayer rendering */
  const visibleLineFolders = useMemo(() => {
    if (!kmlData) return [];
    return kmlData.folders.filter(
      (f) => kmlLayerStyles[f.name]?.visible && f.lines.length > 0
    );
  }, [kmlData, kmlLayerStyles]);

  /* Collect visible point folders for TextLayer rendering */
  const visiblePointFolders = useMemo(() => {
    if (!kmlData) return [];
    return kmlData.folders.filter(
      (f) => kmlLayerStyles[f.name]?.visible && f.points.length > 0
    );
  }, [kmlData, kmlLayerStyles]);

  /* Build coloured GeoJSON and scope-filtered readings in a single optimised pass */
  const kmlResult = useMemo(() => {
    if (layerType !== "kml" || visiblePolygons.length === 0) return null;
    return buildKmlResult(visiblePolygons, validReadings, deferredScope, activeRssiToColor, scopeAdjusting);
  }, [visiblePolygons, validReadings, layerType, deferredScope, scopeAdjusting, activeRssiToColor]);

  const kmlGeoJson = kmlResult?.geoJson ?? null;

  /* Clear KML tooltip when switching away from KML layer */
  useEffect(() => {
    if (layerType !== "kml") setKmlTooltip(null);
  }, [layerType]);
  const kmlScopeReadings = kmlResult?.scopeReadings ?? [];

  /* Build deck.gl layers — the visualisation layer changes based on layerType,
     while the invisible scatterplot for hover tooltips is always present. */
  const layers = useMemo(() => {
    /* Choose the primary visualisation layer(s) based on the active layer type */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vizLayers: any[] =
      layerType === "kml"
        ? /* KML layers: RSSI-coloured polygons, overlay lines, text labels, scope dots */
          [
            /* RSSI-coloured sector polygons — border color/width from polygon folder style */
            ...(kmlGeoJson
              ? (() => {
                  const polyFolder = kmlData?.folders.find(
                    (f) => f.polygons.length > 0 && kmlLayerStyles[f.name]?.visible
                  );
                  const polyStyle = polyFolder ? kmlLayerStyles[polyFolder.name] : undefined;
                  const borderColor: [number, number, number, number] = polyStyle
                    ? [...polyStyle.color, 255]
                    : [80, 80, 80, 255];
                  const borderWidth = polyStyle?.width ?? 1;

                  return [
                    new GeoJsonLayer({
                      id: "kml-rssi-sectors",
                      data: kmlGeoJson,
                      stroked: true,
                      filled: true,
                      pickable: true,
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      getFillColor: (f: any) => f.properties.color,
                      getLineColor: borderColor,
                      getLineWidth: borderWidth,
                      lineWidthMinPixels: borderWidth,
                      opacity: layerSettings.opacity,
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      onHover: (info: PickingInfo<any>) => {
                        if (info.object) {
                          const props = info.object.properties as KmlGeoJsonProperties;
                          setKmlTooltip({
                            x: info.x,
                            y: info.y,
                            name: props.name,
                            meanRssi: props.meanRssi,
                            minRssi: props.minRssi,
                            maxRssi: props.maxRssi,
                            count: props.count,
                          });
                          setTooltip(null);
                        } else {
                          setKmlTooltip(null);
                        }
                      },
                      updateTriggers: {
                        getFillColor: [kmlGeoJson],
                        getLineColor: [borderColor],
                        getLineWidth: [borderWidth],
                      },
                    }),
                  ];
                })()
              : []),

            /* Overlay lines — one PathLayer per visible folder with linestrings */
            ...visibleLineFolders.map((folder) => {
              const style = kmlLayerStyles[folder.name];
              return new PathLayer<KmlLine>({
                id: `kml-lines-${folder.name}`,
                data: folder.lines,
                getPath: (d) => d.coordinates,
                getColor: [...style.color, 255],
                getWidth: style.width,
                widthMinPixels: 1,
                jointRounded: true,
                capRounded: true,
                opacity: layerSettings.opacity,
                updateTriggers: {
                  getColor: [style.color],
                  getWidth: [style.width],
                },
              });
            }),

            /* Text labels — one TextLayer per visible folder with points */
            ...visiblePointFolders.map((folder) => {
              const style = kmlLayerStyles[folder.name];
              return new TextLayer<KmlPoint>({
                id: `kml-labels-${folder.name}`,
                data: folder.points,
                getPosition: (d) => d.coordinates,
                getText: (d) => d.name,
                getSize: 14,
                sizeMinPixels: 10,
                sizeMaxPixels: 20,
                getColor: [...style.color, 255],
                outlineWidth: 2,
                outlineColor: [0, 0, 0, 200],
                fontFamily: "Inter, system-ui, sans-serif",
                fontWeight: 700,
                getTextAnchor: "middle",
                getAlignmentBaseline: "center",
                billboard: true,
                opacity: layerSettings.opacity,
                updateTriggers: {
                  getColor: [style.color],
                },
              });
            }),

            /* RSSI-coloured dots visible only while the scope slider is being adjusted */
            ...(scopeAdjusting
              ? [
                  new ScatterplotLayer<Reading>({
                    id: "kml-scope-dots",
                    data: kmlScopeReadings,
                    getPosition: (d) => [d.longitude, d.latitude],
                    getRadius: 4,
                    radiusMinPixels: 2,
                    radiusMaxPixels: 8,
                    getFillColor: (d) => activeRssiToColor(d.rssi!),
                    opacity: 0.35,
                  }),
                ]
              : []),
          ]
        : layerType === "hexagon"
          ? /* 3D hexagonal bins — both colour and height encode average RSSI per hex */
            [new HexagonLayer<Reading>({
              id: "rssi-hexagon",
              data: validReadings,
              gpuAggregation: false,
              getPosition: (d) => [d.longitude, d.latitude],
              getColorWeight: (d) => normalizeRssi(d.rssi!),
              colorAggregation: "MEAN",
              colorDomain: [0.1, 1.0],
              colorRange: activeColorRange,
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
            })]
          : layerType === "path"
            ? /* Per-radio movement trails coloured by RSSI at each vertex */
              [new PathLayer<RadioPath>({
                id: "rssi-lines",
                data: radioPaths,
                getPath: (d) => d.path,
                getColor: (d) => d.colors,
                getWidth: layerSettings.lineWidth,
                widthMinPixels: 1,
                jointRounded: true,
                capRounded: true,
                opacity: layerSettings.opacity,
              })]
            : /* Smooth heatmap coloured by average RSSI value (not density).
                 MEAN aggregation gives the weighted average RSSI at each pixel.
                 colorDomain [0.3, 1.0] ensures all readings render at full opacity —
                 colour alone conveys signal quality, no alpha fading for weak signals. */
              [new HeatmapLayer<Reading>({
                id: "rssi-heatmap",
                data: validReadings,
                getPosition: (d) => [d.longitude, d.latitude],
                getWeight: (d) => normalizeRssi(d.rssi!),
                aggregation: "MEAN",
                colorDomain: [0.3, 1.0],
                colorRange: activeColorRange,
                radiusPixels: layerSettings.radiusPixels,
                intensity: 1,
                opacity: layerSettings.opacity,
                debounceTimeout: 500,
              })];

    return [
      ...vizLayers,

      /* Invisible pickable dots for hover tooltips — disabled on KML layer
         where the GeoJsonLayer handles its own hover detection */
      new ScatterplotLayer<Reading>({
        id: "rssi-tooltip-targets",
        data: validReadings,
        getPosition: (d) => [d.longitude, d.latitude],
        getRadius: 8,
        radiusMinPixels: 8,
        getFillColor: [0, 0, 0, 0],
        pickable: layerType !== "kml",
        onHover: (info: PickingInfo<Reading>) => {
          if (info.object) {
            setTooltip({
              x: info.x,
              y: info.y,
              ssi: info.object.ssi,
              rssi: info.object.rssi!,
              timestamp: info.object.timestamp,
              positionError: info.object.position_error,
              description: ssiDescriptionMap.get(info.object.ssi) ?? "",
            });
          } else {
            setTooltip(null);
          }
        },
      }),

      /* User-placed map symbols — rendered on top of everything else */
      /* Highlight ring around the selected symbol */
      new ScatterplotLayer<MapSymbol>({
        id: "symbol-highlight",
        data: symbols.filter((s) => s.id === selectedSymbolId),
        getPosition: (d) => [d.longitude, d.latitude],
        getRadius: 20,
        radiusMinPixels: 20,
        radiusMaxPixels: 30,
        getFillColor: [0, 0, 0, 0],
        getLineColor: [88, 156, 220, 200],
        getLineWidth: 3,
        stroked: true,
        lineWidthMinPixels: 2,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parameters: { depthTest: false } as any,
      }),

      /* Symbol backgrounds — rotates for directional repeaters (wedge points in direction) */
      new IconLayer<MapSymbol>({
        id: "symbol-bg",
        data: symbols,
        getPosition: (d) => [d.longitude, d.latitude],
        iconAtlas: bgAtlasUrl,
        iconMapping: ICON_MAPPING,
        getIcon: (d) => d.type,
        getAngle: (d) => d.type === "repeater-directional" ? -(d.direction ?? 0) : 0,
        getSize: (d) => d.id === selectedSymbolId ? symbolSize + 16 : symbolSize,
        sizeMinPixels: 20,
        sizeMaxPixels: 120,
        pickable: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parameters: { depthTest: false } as any,
        updateTriggers: {
          getSize: [selectedSymbolId, symbolSize],
        },
        onClick: (info: PickingInfo<MapSymbol>) => {
          if (info.object) {
            setSelectedSymbolId((prev) => prev === info.object!.id ? null : info.object!.id);
          }
        },
        onDragStart: (info: PickingInfo<MapSymbol>) => {
          if (info.object) {
            setDraggingSymbolId(info.object.id);
          }
        },
        onDrag: (info: PickingInfo<MapSymbol>) => {
          if (draggingSymbolId && info.coordinate) {
            setSymbols((prev) =>
              prev.map((s) =>
                s.id === draggingSymbolId
                  ? { ...s, longitude: info.coordinate![0], latitude: info.coordinate![1] }
                  : s
              )
            );
          }
        },
        onDragEnd: (info: PickingInfo<MapSymbol>) => {
          if (draggingSymbolId && info.coordinate) {
            updateSymbolPosition(draggingSymbolId, info.coordinate[0], info.coordinate[1]).catch(
              (err) => console.error("[map] Failed to update symbol position:", err)
            );
            setDraggingSymbolId(null);
          }
        },
      }),

      /* Symbol icons — always upright, never rotates regardless of direction */
      new IconLayer<MapSymbol>({
        id: "symbol-fg",
        data: symbols,
        getPosition: (d) => [d.longitude, d.latitude],
        iconAtlas: fgAtlasUrl,
        iconMapping: ICON_MAPPING,
        getIcon: (d) => d.type,
        getSize: (d) => d.id === selectedSymbolId ? symbolSize + 16 : symbolSize,
        sizeMinPixels: 20,
        sizeMaxPixels: 120,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parameters: { depthTest: false } as any,
        updateTriggers: {
          getSize: [selectedSymbolId, symbolSize],
        },
      }),
    ];
  }, [validReadings, layerType, radioPaths, layerSettings, ssiDescriptionMap, symbols, bgAtlasUrl, fgAtlasUrl, draggingSymbolId, selectedSymbolId, symbolSize, kmlGeoJson, kmlScopeReadings, scopeAdjusting, kmlLayerStyles, visibleLineFolders, visiblePointFolders, activeColorRange, activeRssiToColor]);

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

      await saveDataset(displayedReadings, savedView ?? undefined, mapStyle, subscribers, symbols, symbolSize);
    } finally {
      savingRef.current = false;
    }
  }, [displayedReadings, mapStyle, fileSubscribers, symbols, symbolSize]);

  /* Load readings from a user-selected JSON file and switch to file mode */
  const handleLoadData = useCallback(async (file: File) => {
    try {
      const { readings: data, viewState, mapStyle: style, subscribers, symbols: fileSyms, symbolSize: fileSymSize } = await loadDataset(file);

      /* Restore symbols and symbol size from the file if present */
      if (fileSyms?.length) setSymbols(fileSyms);
      if (fileSymSize) setSymbolSize(fileSymSize);
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
    loadSymbols();
  }, [loadSymbols]);

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

  /* Delete a symbol and refresh the list */
  const handleDeleteSymbol = useCallback(async (id: string) => {
    try {
      await apiDeleteSymbol(id);
      setSymbols((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error("[map] Failed to delete symbol:", err);
    }
  }, []);

  /* Fly the map to a specific coordinate, preserving current bearing and pitch */
  const handleFlyTo = useCallback((longitude: number, latitude: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vp = (deckRef.current as any)?.deck?.viewManager?.getViewports()?.[0];
    setInitialView({
      longitude,
      latitude,
      zoom: vp?.zoom ?? 16,
      bearing: vp?.bearing ?? 0,
      pitch: vp?.pitch ?? 0,
    });
  }, []);

  /* Snap the map bearing back to 0° (facing north) */
  const handleResetNorth = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vp = (deckRef.current as any)?.deck?.viewManager?.getViewports()?.[0];
    setInitialView({
      longitude: vp?.longitude ?? 0,
      latitude: vp?.latitude ?? 30,
      zoom: vp?.zoom ?? 2,
      bearing: 0,
      pitch: vp?.pitch ?? 0,
    });
  }, []);

  /* Update the direction angle of a directional repeater symbol.
     Local state updates immediately for responsive UI; API persist is debounced. */
  const directionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDirectionChange = useCallback((id: string, direction: number) => {
    setSymbols((prev) => prev.map((s) => s.id === id ? { ...s, direction } : s));
    if (directionTimer.current) clearTimeout(directionTimer.current);
    directionTimer.current = setTimeout(() => {
      updateSymbolDirection(id, direction).catch(
        (err) => console.error("[map] Failed to update symbol direction:", err)
      );
    }, 300);
  }, []);

  /* Handle dropping a symbol from the sidebar palette onto the map */
  const handleMapDrop = useCallback(async (e: React.DragEvent) => {
    const symbolType = e.dataTransfer.getData("symbolType");
    if (!symbolType) return;

    e.preventDefault();

    /* Convert drop pixel coordinates to lng/lat via DeckGL viewport */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deck = (deckRef.current as any)?.deck;
    if (!deck) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const viewport = deck.getViewports()[0];
    if (!viewport) return;

    const [longitude, latitude] = viewport.unproject([x, y]);

    const symbol: MapSymbol = {
      id: crypto.randomUUID(),
      type: symbolType,
      label: "",
      longitude,
      latitude,
      direction: null,
      created_at: new Date().toISOString(),
    };

    try {
      await createSymbol(symbol);
      setSymbols((prev) => [symbol, ...prev]);
    } catch (err) {
      console.error("[map] Failed to create symbol:", err);
    }
  }, []);

  /* Allow the map area to accept drops (browsers lowercase dataTransfer type keys) */
  const handleMapDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("symboltype")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

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
        kmlLoaded={kmlData !== null}
        kmlFolders={kmlData?.folders ?? []}
        kmlLayerStyles={kmlLayerStyles}
        onKmlLayerStyleChange={(name, style) => setKmlLayerStyles((prev) => ({ ...prev, [name]: style }))}
        onStyleChange={setMapStyle}
        onLayerTypeChange={setLayerType}
        onSettingsChange={setLayerSettings}
        onKmlLoad={setKmlData}
        onScopeAdjusting={setScopeAdjusting}
        onSaveData={handleSaveData}
        onLoadData={handleLoadData}
        onResumeLive={handleResumeLive}
        onReset={handleReset}
        onToggleRegister={handleToggleRegister}
        selectedSsis={selectedSsis}
        dataAgeMinutes={dataAgeMinutes}
        onDataAgeChange={setDataAgeMinutes}
        retentionDays={retentionDays}
        maxAccuracy={maxAccuracy}
        onAccuracyChange={setMaxAccuracy}
        clockOffsetMs={clockOffsetMs}
        serverTzOffsetHours={serverTzOffsetHours}
        onShowStats={() => setShowStats(true)}
        symbols={symbols}
        symbolSize={symbolSize}
        onSymbolSizeChange={(size: number) => { setSymbolSize(size); apiUpdateSymbolSize(size).catch((err) => console.error("[map] Failed to save symbol size:", err)); }}
        selectedSymbolId={selectedSymbolId}
        onSelectSymbol={setSelectedSymbolId}
        onDeleteSymbol={handleDeleteSymbol}
        onFlyTo={handleFlyTo}
        onDirectionChange={handleDirectionChange}
        customSpectrum={customSpectrum}
        onSpectrumChange={setCustomSpectrum}
        colourTabTrigger={colourTabTrigger}
      />

      <div className="map-area" onDragOver={handleMapDragOver} onDrop={handleMapDrop}>
        {/* DeckGL as root — owns canvas + interactions.
            MapGL is a child that renders tiles and follows DeckGL's viewport. */}
        <DeckGL
          ref={deckRef}
          initialViewState={resolvedView}
          controller={{ dragPan: !draggingSymbolId }}
          layers={layers}
          onViewStateChange={handleViewStateChange}
          onError={handleDeckError}
          onClick={(info) => { if (!info.object) setSelectedSymbolId(null); }}
        >
          <MapGL
            mapboxAccessToken={mapboxToken}
            mapStyle={mapStyle}
            onError={handleMapError}
          />
        </DeckGL>

        <Tooltip tooltip={tooltip} clockOffsetMs={clockOffsetMs} serverTzOffsetHours={serverTzOffsetHours} />
        <KmlTooltip tooltip={kmlTooltip} />
        <RssiLegend customSpectrum={customSpectrum} readings={validReadings} onClick={() => setColourTabTrigger((n) => n + 1)} />
        <NorthArrow bearing={bearing} onResetNorth={handleResetNorth} />

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
            clockOffsetMs={clockOffsetMs}
            serverTzOffsetHours={serverTzOffsetHours}
          />
        )}

        {/* Logserver stats overlay */}
        {showStats && (
          <LogserverStats onClose={() => setShowStats(false)} />
        )}
      </div>
    </div>
  );
};

export default Map;
