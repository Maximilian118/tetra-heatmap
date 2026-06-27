import { useState, useEffect, useMemo, useRef } from "react";
import type { Reading } from "../../../utils/api";
import { fetchColourSpectrum, saveColourSpectrum } from "../../../utils/api";
import { RSSI_COLOR_RANGE, rssiToColor, buildPaths, buildColorRangeFromSpectrum, buildRssiToColorFromSpectrum, DEFAULT_CUSTOM_SPECTRUM, normalizeSpectrum, type CustomSpectrum } from "../../../utils/rssi";
import type { LayerType } from "../Sidebar/MapPresets/MapPresets";
import { DEFAULT_LAYER_SETTINGS, type LayerSettings } from "../Sidebar/Customise/Customise";

/* Manages layer type, display settings, custom colour spectrum, and derived colour state.
   mapStyle is managed externally since it's shared with file save/load logic. */
export const useLayerConfig = (validReadings: Reading[]) => {
  const [layerType, setLayerType] = useState<LayerType>("heatmap");
  const [layerSettings, setLayerSettings] = useState<LayerSettings>(DEFAULT_LAYER_SETTINGS);
  const [colourTabTrigger, setColourTabTrigger] = useState(0);
  const [customSpectrum, setCustomSpectrum] = useState<CustomSpectrum>(() => {
    const saved = localStorage.getItem("customSpectrum");
    if (saved) { try { return normalizeSpectrum(JSON.parse(saved)); } catch { /* ignore */ } }
    return DEFAULT_CUSTOM_SPECTRUM;
  });

  /* Track whether we're still hydrating from the server to avoid writing back on mount */
  const serverHydrating = useRef(true);

  /* Hydrate custom spectrum from server (overrides localStorage if server has data) */
  useEffect(() => {
    fetchColourSpectrum()
      .then((server) => { if (server) setCustomSpectrum(normalizeSpectrum(server)); })
      .catch((err) => console.error("[spectrum] Failed to fetch from server:", err))
      .finally(() => { serverHydrating.current = false; });
  }, []);

  /* Persist custom colour spectrum to localStorage and write-through to server */
  useEffect(() => {
    localStorage.setItem("customSpectrum", JSON.stringify(customSpectrum));
    if (serverHydrating.current) return;
    saveColourSpectrum(customSpectrum).catch((err) =>
      console.error("[spectrum] Failed to save to server:", err),
    );
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

  return {
    layerType,
    setLayerType,
    layerSettings,
    setLayerSettings,
    colourTabTrigger,
    setColourTabTrigger,
    customSpectrum,
    setCustomSpectrum,
    activeColorRange,
    activeRssiToColor,
    radioPaths,
  };
};
