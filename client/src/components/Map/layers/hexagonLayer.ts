import { HexagonLayer } from "@deck.gl/aggregation-layers";
import type { Reading } from "../../../utils/api";
import { normalizeRssi, rssiElevationWeight } from "../../../utils/rssi";
import type { LayerBuildParams } from "./types";

/* 3D hexagonal bins — both colour and height encode average RSSI per hex */
export const buildHexagonLayer = (params: LayerBuildParams) => {
  const { validReadings, layerSettings, activeColorRange } = params;

  return new HexagonLayer<Reading>({
    id: "rssi-hexagon",
    data: validReadings,
    gpuAggregation: false,
    getPosition: (d) => [d.longitude, d.latitude],
    getColorWeight: (d) => normalizeRssi(d.rssi!),
    colorAggregation: "MEAN",
    colorDomain: [0.1, 1.0],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    colorRange: activeColorRange as any,
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
  });
};
