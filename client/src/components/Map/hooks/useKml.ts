import { useState, useEffect, useMemo, useDeferredValue } from "react";
import type { Reading } from "../../../utils/api";
import { buildKmlResult, getDefaultKmlLayerStyles, type KmlData, type KmlLayerStyle } from "../../../utils/kml";
import type { LayerType } from "../Sidebar/MapPresets/MapPresets";

interface UseKmlParams {
  validReadings: Reading[];
  layerType: LayerType;
  scope: number;
  activeRssiToColor: (rssi: number) => [number, number, number, number];
  setKmlTooltip: (t: null) => void;
}

/* Manages KML overlay data, folder visibility/styles, and RSSI polygon colouring */
export const useKml = (params: UseKmlParams) => {
  const { validReadings, layerType, scope, activeRssiToColor, setKmlTooltip } = params;

  const [kmlData, setKmlData] = useState<KmlData | null>(null);
  const [kmlLayerStyles, setKmlLayerStyles] = useState<Record<string, KmlLayerStyle>>({});
  const [scopeAdjusting, setScopeAdjusting] = useState(false);

  /* Deferred scope — React prioritises slider input over the geo-computation */
  const deferredScope = useDeferredValue(scope);

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
  const kmlScopeReadings = kmlResult?.scopeReadings ?? [];

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
  };
};
