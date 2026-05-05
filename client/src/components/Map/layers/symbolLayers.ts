import { IconLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import type { MapSymbol } from "../../../utils/api";
import { ICON_MAPPING } from "../../../utils/symbols";
import { updateSymbolPosition } from "../../../utils/api";
import type { LayerBuildParams } from "./types";

/* User-placed map symbols — rendered on top of everything else.
   Two layers: backgrounds (rotates for directional) and foregrounds (always upright). */
export const buildSymbolLayers = (params: LayerBuildParams) => {
  const {
    symbols, bgAtlasUrl, fgAtlasUrl, selectedSymbolId, symbolSize,
    draggingSymbolId, setSelectedSymbolId, setDraggingSymbolId, setSymbols,
  } = params;

  /* Symbol backgrounds — rotates for directional repeaters (wedge points in direction) */
  const bgLayer = new IconLayer<MapSymbol>({
    id: "symbol-bg",
    data: symbols,
    getPosition: (d) => [d.longitude, d.latitude],
    iconAtlas: bgAtlasUrl,
    iconMapping: ICON_MAPPING,
    getIcon: (d) => d.backup ? `${d.type}-backup` : d.type,
    getAngle: (d) => d.type === "repeater-directional" ? -(d.direction ?? 0) : 0,
    getSize: (d) => d.id === selectedSymbolId ? symbolSize + 16 : symbolSize,
    getColor: (d): [number, number, number, number] => d.inactive ? [255, 255, 255, 60] : [255, 255, 255, 255],
    sizeMinPixels: 20,
    sizeMaxPixels: 120,
    pickable: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: { depthTest: false } as any,
    transitions: { getSize: { duration: 80 } },
    updateTriggers: {
      getIcon: [symbols],
      getColor: [symbols],
      getSize: [selectedSymbolId, symbolSize],
    },
    onClick: (info: PickingInfo<MapSymbol>) => {
      if (info.object) {
        setSelectedSymbolId((prev) => prev === info.object!.id ? null : info.object!.id);
      }
    },
    onDragStart: (info: PickingInfo<MapSymbol>) => {
      if (info.object) {
        setDraggingSymbolId(info.object.id);
      }
    },
    onDrag: (info: PickingInfo<MapSymbol>) => {
      if (draggingSymbolId && info.coordinate) {
        setSymbols((prev) =>
          prev.map((s) =>
            s.id === draggingSymbolId
              ? { ...s, longitude: info.coordinate![0], latitude: info.coordinate![1] }
              : s
          )
        );
      }
    },
    onDragEnd: (info: PickingInfo<MapSymbol>) => {
      if (draggingSymbolId && info.coordinate) {
        updateSymbolPosition(draggingSymbolId, info.coordinate[0], info.coordinate[1]).catch(
          (err) => console.error("[map] Failed to update symbol position:", err)
        );
        setDraggingSymbolId(null);
      }
    },
  });

  /* Symbol icons — always upright, never rotates regardless of direction */
  const fgLayer = new IconLayer<MapSymbol>({
    id: "symbol-fg",
    data: symbols,
    getPosition: (d) => [d.longitude, d.latitude],
    iconAtlas: fgAtlasUrl,
    iconMapping: ICON_MAPPING,
    getIcon: (d) => d.backup ? `${d.type}-backup` : d.type,
    getSize: (d) => d.id === selectedSymbolId ? symbolSize + 16 : symbolSize,
    getColor: (d): [number, number, number, number] => d.inactive ? [255, 255, 255, 160] : [255, 255, 255, 255],
    sizeMinPixels: 20,
    sizeMaxPixels: 120,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: { depthTest: false } as any,
    transitions: { getSize: { duration: 80 } },
    updateTriggers: {
      getIcon: [symbols],
      getColor: [symbols],
      getSize: [selectedSymbolId, symbolSize],
    },
  });

  return [bgLayer, fgLayer];
};
