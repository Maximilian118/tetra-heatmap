import { ScatterplotLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import type { Reading } from "../../../utils/api";
import type { LayerBuildParams } from "./types";

/* Invisible pickable dots for hover tooltips — disabled on KML layer
   where the GeoJsonLayer handles its own hover detection */
export const buildTooltipLayer = (params: LayerBuildParams) => {
  const { validReadings, layerType, ssiDescriptionMap, setTooltip } = params;

  return new ScatterplotLayer<Reading>({
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
  });
};
