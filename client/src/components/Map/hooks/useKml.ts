import { useState, useEffect, useMemo, useCallback, useDeferredValue } from "react";
import { fetchKmlSectorRssi, saveKmlSectorRssi, type Reading, type KmlSectorRssi } from "../../../utils/api";
import { applyManualRssi, buildKmlResult, compareSectorNames, getDefaultKmlLayerStyles, repositionLabels, separateOverlappingLabels, type KmlData, type KmlLayerStyle, type KmlPoint } from "../../../utils/kml";
import type { LayerType } from "../Sidebar/MapPresets/MapPresets";

interface UseKmlParams {
  validReadings: Reading[];
  layerType: LayerType;
  scope: number;
  labelOffset: number;
  activeRssiToColor: (rssi: number) => [number, number, number, number];
  setKmlTooltip: (t: null) => void;
}

/* Manages KML overlay data, folder visibility/styles, and RSSI polygon colouring */
export const useKml = (params: UseKmlParams) => {
  const { validReadings, layerType, scope, labelOffset, activeRssiToColor, setKmlTooltip } = params;

  const [kmlData, setKmlData] = useState<KmlData | null>(null);
  const [kmlLayerStyles, setKmlLayerStyles] = useState<Record<string, KmlLayerStyle>>({});
  const [scopeAdjusting, setScopeAdjusting] = useState(false);
  const [activeKmlId, setActiveKmlId] = useState<string | null>(null);
  const [manualRssi, setManualRssi] = useState<KmlSectorRssi>({});

  /* Clear KML overlay and reset associated state */
  const clearKml = useCallback(() => {
    setKmlData(null);
    setActiveKmlId(null);
    setKmlLayerStyles({});
    setManualRssi({});
  }, []);

  /* Load the manually entered sector values whenever the selected KML file changes.
     The cancelled guard stops a slow response landing on a file the user has since left. */
  useEffect(() => {
    if (!activeKmlId) {
      setManualRssi({});
      return;
    }

    let cancelled = false;
    fetchKmlSectorRssi(activeKmlId)
      .then((values) => { if (!cancelled) setManualRssi(values); })
      .catch((err) => console.error("[kml] Failed to fetch manual sector RSSI:", err));

    return () => { cancelled = true; };
  }, [activeKmlId]);

  /* Apply manual sector values locally, then persist them against the active KML file.
     Files loaded through the legacy file dialog have no id, so those edits stay in-session. */
  const saveManualRssi = useCallback(async (values: KmlSectorRssi) => {
    setManualRssi(values);
    if (!activeKmlId) return;
    try {
      await saveKmlSectorRssi(activeKmlId, values);
    } catch (err) {
      console.error("[kml] Failed to save manual sector RSSI:", err);
    }
  }, [activeKmlId]);

  /* Deferred values — React prioritises slider input over geo-computation */
  const deferredScope = useDeferredValue(scope);
  const deferredLabelOffset = useDeferredValue(labelOffset);

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

  /* Reposition point labels to sit at a consistent offset from the track.
     Same-folder lines are preferred (for labels like S1/S2 in a Lines folder);
     falls back to nearest sector polygon boundary for orphan points (turn numbers). */
  const adjustedPointPositions = useMemo(() => {
    const posMap = new Map<KmlPoint, [number, number]>();
    if (!kmlData) return posMap;

    for (const folder of visiblePointFolders) {
      const sourceFolder = kmlData.folders.find((f) => f.name === folder.name);
      const sameFolderLines = sourceFolder?.lines ?? [];
      const adjusted = repositionLabels(folder.points, sameFolderLines, visiblePolygons, deferredLabelOffset);
      folder.points.forEach((p, i) => posMap.set(p, adjusted[i]));
    }

    /* Push overlapping labels apart so nearby labels don't collide */
    separateOverlappingLabels(posMap, 30);

    return posMap;
  }, [kmlData, visiblePointFolders, visiblePolygons, deferredLabelOffset]);

  /* Build coloured GeoJSON and scope-filtered readings in a single optimised pass */
  const kmlResult = useMemo(() => {
    if (layerType !== "kml" || visiblePolygons.length === 0) return null;
    return buildKmlResult(visiblePolygons, validReadings, deferredScope, activeRssiToColor, scopeAdjusting);
  }, [visiblePolygons, validReadings, layerType, deferredScope, scopeAdjusting, activeRssiToColor]);

  /* Overlay the manual values on the measured result — a cheap per-polygon pass that
     avoids re-running the spatial aggregation every time a value is edited */
  const kmlGeoJson = useMemo(
    () => applyManualRssi(kmlResult?.geoJson ?? null, manualRssi, activeRssiToColor),
    [kmlResult, manualRssi, activeRssiToColor]
  );

  const kmlScopeReadings = kmlResult?.scopeReadings ?? [];

  /* Measured value and reading count per sector, taken before any manual override,
     so the manual RSSI form can show what the live data actually says */
  const kmlSectorStats = useMemo(() => {
    if (!kmlResult) return [];
    return kmlResult.geoJson.features
      .map((f) => ({
        name: f.properties.name,
        measuredRssi: f.properties.medianRssi,
        count: f.properties.count,
      }))
      .sort((a, b) => compareSectorNames(a.name, b.name));
  }, [kmlResult]);

  /* Clear KML tooltip when switching away from KML layer */
  useEffect(() => {
    if (layerType !== "kml") setKmlTooltip(null);
  }, [layerType, setKmlTooltip]);

  return {
    kmlData,
    setKmlData,
    kmlLayerStyles,
    setKmlLayerStyles,
    scopeAdjusting,
    setScopeAdjusting,
    kmlGeoJson,
    kmlScopeReadings,
    visibleLineFolders,
    visiblePointFolders,
    adjustedPointPositions,
    activeKmlId,
    setActiveKmlId,
    clearKml,
    manualRssi,
    saveManualRssi,
    kmlSectorStats,
  };
};
