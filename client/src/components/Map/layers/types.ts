import type { Dispatch, SetStateAction } from "react";
import type { Reading, MapSymbol, MapNote } from "../../../utils/api";
import type { RadioPath } from "../../../utils/rssi";
import type { KmlData, KmlLayerStyle, KmlLine, KmlPoint } from "../../../utils/kml";
import type { LayerType } from "../Sidebar/MapPresets/MapPresets";
import type { LayerSettings } from "../Sidebar/Customise/Customise";
import type { TooltipInfo } from "../Tooltip/Tooltip";
import type { KmlTooltipInfo } from "../Tooltip/KmlTooltip";

/* KML folder shape needed by layer builders */
export interface KmlFolder {
  name: string;
  lines: KmlLine[];
  points: KmlPoint[];
}

/* State shape for a hovered note area */
export interface NoteTooltipInfo {
  x: number;
  y: number;
  title: string;
  text: string;
}

/* All inputs the layer builders need to construct deck.gl layers */
export interface LayerBuildParams {
  layerType: LayerType;
  validReadings: Reading[];
  radioPaths: RadioPath[];
  layerSettings: LayerSettings;
  activeColorRange: number[][];
  activeRssiToColor: (rssi: number) => [number, number, number, number];
  ssiDescriptionMap: Map<number, string>;
  /* KML */
  kmlGeoJson: GeoJSON.FeatureCollection | null;
  kmlScopeReadings: Reading[];
  scopeAdjusting: boolean;
  kmlData: KmlData | null;
  kmlLayerStyles: Record<string, KmlLayerStyle>;
  visibleLineFolders: KmlFolder[];
  visiblePointFolders: KmlFolder[];
  adjustedPointPositions: Map<object, [number, number]>;
  /* Symbols */
  bearing: number;
  symbols: MapSymbol[];
  bgAtlasUrl: string;
  fgAtlasUrl: string;
  selectedSymbolId: string | null;
  symbolSize: number;
  draggingSymbolId: string | null;
  /* Notes */
  notes: MapNote[];
  editingNoteId: string | null;
  onNotePolygonUpdate: (id: string, polygon: [number, number][]) => void;
  setDraggingVertexNoteId: (id: string | null) => void;
  setNoteTooltip: (t: NoteTooltipInfo | null) => void;
  /* Callbacks */
  setTooltip: (t: TooltipInfo | null) => void;
  setKmlTooltip: (t: KmlTooltipInfo | null) => void;
  setSelectedSymbolId: Dispatch<SetStateAction<string | null>>;
  setDraggingSymbolId: (id: string | null) => void;
  setSymbols: Dispatch<SetStateAction<MapSymbol[]>>;
}
