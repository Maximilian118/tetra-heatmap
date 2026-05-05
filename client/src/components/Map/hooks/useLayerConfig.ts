import { useState, useEffect, useMemo } from "react";
import type { Reading } from "../../../utils/api";
import { RSSI_COLOR_RANGE, rssiToColor, buildPaths, buildColorRangeFromSpectrum, buildRssiToColorFromSpectrum, DEFAULT_CUSTOM_SPECTRUM, type CustomSpectrum } from "../../../utils/rssi";
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
    if (saved) { try { return JSON.parse(saved); } catch { /* ignore */ } }
    return DEFAULT_CUSTOM_SPECTRUM;
  });

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
