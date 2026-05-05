import { PathLayer } from "@deck.gl/layers";
import type { RadioPath } from "../../../utils/rssi";
import type { LayerBuildParams } from "./types";

/* Per-radio movement trails coloured by RSSI at each vertex */
export const buildPathLayers = (params: LayerBuildParams) => {
  const { radioPaths, layerSettings } = params;

  return new PathLayer<RadioPath>({
    id: "rssi-lines",
    data: radioPaths,
    getPath: (d) => d.path,
    getColor: (d) => d.colors,
    getWidth: layerSettings.lineWidth,
    widthMinPixels: 1,
    jointRounded: true,
    capRounded: true,
    opacity: layerSettings.opacity,
  });
};
