import type { LayerBuildParams } from "./types";
import { buildHeatmapLayer } from "./heatmapLayer";
import { buildHexagonLayer } from "./hexagonLayer";
import { buildPathLayers } from "./pathLayer";
import { buildKmlLayers } from "./kmlLayers";
import { buildTooltipLayer } from "./tooltipLayer";
import { buildSymbolLayers } from "./symbolLayers";

/* Assemble the complete deck.gl layer stack based on the active layer type.
   Each sub-builder is a pure function receiving only the data it needs. */
export const buildLayers = (params: LayerBuildParams) => {
  const { layerType } = params;

  /* Choose the primary visualisation layer(s) based on the active layer type */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let vizLayers: any[];

  switch (layerType) {
    case "kml":
      vizLayers = buildKmlLayers(params);
      break;
    case "hexagon":
      vizLayers = [buildHexagonLayer(params)];
      break;
    case "path":
      vizLayers = [buildPathLayers(params)];
      break;
    default:
      vizLayers = [buildHeatmapLayer(params)];
      break;
  }

  return [
    ...vizLayers,
    buildTooltipLayer(params),
    ...buildSymbolLayers(params),
  ];
};
