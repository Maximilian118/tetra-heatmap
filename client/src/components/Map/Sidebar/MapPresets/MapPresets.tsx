import { useRef } from "react";
import { Flame, Hexagon, Activity, FileText, type LucideIcon } from "lucide-react";
import { parseKml, type KmlData } from "../../../../utils/kml";
import "./MapPresets.scss";

/* The four available deck.gl visualisation modes */
export type LayerType = "heatmap" | "hexagon" | "path" | "kml";

/* Button definitions for the layer toggle grid */
const LAYER_OPTIONS: { type: LayerType; label: string; icon: LucideIcon }[] = [
  { type: "heatmap", label: "Heat", icon: Flame },
  { type: "hexagon", label: "Hex", icon: Hexagon },
  { type: "path", label: "Path", icon: Activity },
  { type: "kml", label: "KML", icon: FileText },
];

/* All available MapBox GL style presets */
const MAP_STYLES = [
  { label: "Dark", url: "mapbox://styles/mapbox/dark-v11" },
  { label: "Light", url: "mapbox://styles/mapbox/light-v11" },
  { label: "Standard", url: "mapbox://styles/mapbox/standard" },
  { label: "Standard Satellite", url: "mapbox://styles/mapbox/standard-satellite" },
  { label: "Streets", url: "mapbox://styles/mapbox/streets-v12" },
  { label: "Outdoors", url: "mapbox://styles/mapbox/outdoors-v12" },
  { label: "Satellite", url: "mapbox://styles/mapbox/satellite-v9" },
  { label: "Satellite Streets", url: "mapbox://styles/mapbox/satellite-streets-v12" },
  { label: "Navigation Day", url: "mapbox://styles/mapbox/navigation-day-v1" },
  { label: "Navigation Night", url: "mapbox://styles/mapbox/navigation-night-v1" },
  { label: "Nav Preview Day", url: "mapbox://styles/mapbox/navigation-preview-day-v4" },
  { label: "Nav Preview Night", url: "mapbox://styles/mapbox/navigation-preview-night-v4" },
  { label: "Nav Guidance Day", url: "mapbox://styles/mapbox/navigation-guidance-day-v4" },
  { label: "Nav Guidance Night", url: "mapbox://styles/mapbox/navigation-guidance-night-v4" },
];

interface MapPresetsProps {
  mapStyle: string;
  layerType: LayerType;
  kmlLoaded: boolean;
  onStyleChange: (style: string) => void;
  onLayerTypeChange: (type: LayerType) => void;
  onKmlLoad: (data: KmlData) => void;
}

/* Map style dropdown and layer type toggle for the sidebar */
const MapPresets = ({ mapStyle, layerType, kmlLoaded, onStyleChange, onLayerTypeChange, onKmlLoad }: MapPresetsProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Handle KML file selection from the native file picker */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const kmlData = parseKml(text, file.name);

      if (kmlData.polygons.length > 0) {
        onKmlLoad(kmlData);
        onLayerTypeChange("kml");
      }
    };
    reader.readAsText(file);

    /* Reset the input so the same file can be re-selected */
    e.target.value = "";
  };

  /* Handle layer button click — KML opens file picker, others switch directly */
  const handleLayerClick = (type: LayerType) => {
    if (type === "kml") {
      fileInputRef.current?.click();
    } else {
      onLayerTypeChange(type);
    }
  };

  return (
    <div className="map-presets">
      <label className="map-presets__label" htmlFor="map-style-select">
        Map Style
      </label>
      <select
        id="map-style-select"
        className="map-presets__select"
        value={mapStyle}
        onChange={(e) => onStyleChange(e.target.value)}
      >
        {MAP_STYLES.map((s) => (
          <option key={s.url} value={s.url}>
            {s.label}
          </option>
        ))}
      </select>

      {/* Layer type toggle — 2x2 grid of buttons */}
      <div className="map-presets__layers">
        {LAYER_OPTIONS.map((opt) => (
          <button
            key={opt.type}
            className={`map-presets__layer-btn ${
              opt.type === "kml"
                ? layerType === "kml" && kmlLoaded
                  ? "map-presets__layer-btn--active"
                  : ""
                : layerType === opt.type
                  ? "map-presets__layer-btn--active"
                  : ""
            }`}
            onClick={() => handleLayerClick(opt.type)}
          >
            <opt.icon size={14} />
            {opt.label}
          </button>
        ))}
      </div>

      {/* Hidden file input for KML selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".kml"
        className="map-presets__file-input"
        onChange={handleFileChange}
      />
    </div>
  );
};

export default MapPresets;
