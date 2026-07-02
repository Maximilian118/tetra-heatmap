import { IconLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import type { MapSymbol } from "../../../utils/api";
import { ICON_MAPPING } from "../../../utils/symbols";
import { updateSymbolPosition } from "../../../utils/api";
import type { LayerBuildParams } from "./types";

/* Zoom level at which symbolSize maps 1:1 to screen pixels.
   At other zooms, symbols scale with the map like geographic features. */
const SYMBOL_REF_ZOOM = 14;

/* Divisor to convert pixel size at the reference zoom into common-space units.
   DeckGL common units: 1 unit = 1 pixel at zoom 0, scaled by 2^zoom on the GPU. */
const REF_DIVISOR = Math.pow(2, SYMBOL_REF_ZOOM);

/* User-placed map symbols — rendered on top of everything else.
   Two layers: backgrounds (rotates for directional) and foregrounds (always upright).
   sizeUnits:'common' lets the GPU handle zoom scaling — perfectly smooth with no lag. */
export const buildSymbolLayers = (params: LayerBuildParams) => {
  const {
    bearing, symbols, bgAtlasUrl, fgAtlasUrl, selectedSymbolId, symbolSize,
    draggingSymbolId, symbolsLocked, setSelectedSymbolId, setDraggingSymbolId, setSymbols,
  } = params;

  /* Symbol backgrounds — rotates for directional repeaters (wedge points in direction) */
  const bgLayer = new IconLayer<MapSymbol>({
    id: "symbol-bg",
    data: symbols,
    getPosition: (d) => [d.longitude, d.latitude],
    iconAtlas: bgAtlasUrl,
    iconMapping: ICON_MAPPING,
    getIcon: (d) => d.backup ? `${d.type}-backup` : d.type,
    getAngle: (d) => d.type === "repeater-directional" ? -(d.direction ?? 0) + bearing : 0,
    sizeUnits: "common",
    getSize: (d) => (d.id === selectedSymbolId ? symbolSize + 16 : symbolSize) / REF_DIVISOR,
    getColor: (d): [number, number, number, number] => d.inactive ? [255, 255, 255, 60] : [255, 255, 255, 255],
    sizeMinPixels: 8,
    sizeMaxPixels: 512,
    pickable: true,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: { depthTest: false } as any,
    transitions: { getSize: { duration: 80 } },
    updateTriggers: {
      getAngle: [symbols, bearing],
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
      if (symbolsLocked) return;
      if (info.object) {
        setDraggingSymbolId(info.object.id);
      }
    },
    onDrag: (info: PickingInfo<MapSymbol>) => {
      if (symbolsLocked) return;
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
      if (symbolsLocked) return;
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
    sizeUnits: "common",
    getSize: (d) => (d.id === selectedSymbolId ? symbolSize + 16 : symbolSize) / REF_DIVISOR,
    getColor: (d): [number, number, number, number] => d.inactive ? [255, 255, 255, 160] : [255, 255, 255, 255],
    sizeMinPixels: 8,
    sizeMaxPixels: 512,
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
