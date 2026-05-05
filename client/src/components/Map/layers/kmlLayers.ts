import { ScatterplotLayer, PathLayer, GeoJsonLayer, TextLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import type { Reading } from "../../../utils/api";
import type { KmlGeoJsonProperties, KmlLine, KmlPoint } from "../../../utils/kml";
import type { LayerBuildParams } from "./types";

/* KML layers: RSSI-coloured polygons, overlay lines, text labels, scope dots */
export const buildKmlLayers = (params: LayerBuildParams) => {
  const {
    kmlGeoJson, kmlData, kmlLayerStyles, kmlScopeReadings, scopeAdjusting,
    visibleLineFolders, visiblePointFolders, layerSettings, activeRssiToColor,
    setKmlTooltip, setTooltip,
  } = params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layers: any[] = [];

  /* RSSI-coloured sector polygons — border color/width from polygon folder style */
  if (kmlGeoJson) {
    const polyFolder = kmlData?.folders.find(
      (f) => f.polygons.length > 0 && kmlLayerStyles[f.name]?.visible
    );
    const polyStyle = polyFolder ? kmlLayerStyles[polyFolder.name] : undefined;
    const borderColor: [number, number, number, number] = polyStyle
      ? [...polyStyle.color, 255]
      : [80, 80, 80, 255];
    const borderWidth = polyStyle?.width ?? 1;

    layers.push(
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
      })
    );
  }

  /* Overlay lines — one PathLayer per visible folder with linestrings */
  for (const folder of visibleLineFolders) {
    const style = kmlLayerStyles[folder.name];
    layers.push(
      new PathLayer<KmlLine>({
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
      })
    );
  }

  /* Text labels — one TextLayer per visible folder with points */
  for (const folder of visiblePointFolders) {
    const style = kmlLayerStyles[folder.name];
    layers.push(
      new TextLayer<KmlPoint>({
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
      })
    );
  }

  /* RSSI-coloured dots visible only while the scope slider is being adjusted */
  if (scopeAdjusting) {
    layers.push(
      new ScatterplotLayer<Reading>({
        id: "kml-scope-dots",
        data: kmlScopeReadings,
        getPosition: (d) => [d.longitude, d.latitude],
        getRadius: 4,
        radiusMinPixels: 2,
        radiusMaxPixels: 8,
        getFillColor: (d) => activeRssiToColor(d.rssi!),
        opacity: 0.35,
      })
    );
  }

  return layers;
};
