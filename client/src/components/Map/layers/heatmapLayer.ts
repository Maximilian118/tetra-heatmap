import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import type { Reading } from "../../../utils/api";
import { normalizeRssi } from "../../../utils/rssi";
import type { LayerBuildParams } from "./types";

/* Smooth heatmap coloured by average RSSI value (not density).
   MEAN aggregation gives the weighted average RSSI at each pixel.
   colorDomain [0.3, 1.0] ensures all readings render at full opacity —
   colour alone conveys signal quality, no alpha fading for weak signals. */
export const buildHeatmapLayer = (params: LayerBuildParams) => {
  const { validReadings, layerSettings, activeColorRange } = params;

  return new HeatmapLayer<Reading>({
    id: "rssi-heatmap",
    data: validReadings,
    getPosition: (d) => [d.longitude, d.latitude],
    getWeight: (d) => normalizeRssi(d.rssi!),
    aggregation: "MEAN",
    colorDomain: [0.3, 1.0],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    colorRange: activeColorRange as any,
    radiusPixels: layerSettings.radiusPixels,
    intensity: 1,
    opacity: layerSettings.opacity,
    debounceTimeout: 500,
  });
};
