import "./MapPresets.scss";

/* The three available deck.gl visualisation modes */
export type LayerType = "heatmap" | "hexagon" | "line";

/* Button definitions for the layer toggle row */
const LAYER_OPTIONS: { type: LayerType; label: string }[] = [
  { type: "heatmap", label: "Heat" },
  { type: "hexagon", label: "Hex" },
  { type: "line", label: "Line" },
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
  onStyleChange: (style: string) => void;
  onLayerTypeChange: (type: LayerType) => void;
}

/* Map style dropdown and layer type toggle for the sidebar */
const MapPresets = ({ mapStyle, layerType, onStyleChange, onLayerTypeChange }: MapPresetsProps) => (
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

    {/* Layer type toggle — three equal-width connected buttons */}
    <div className="map-presets__layers">
      {LAYER_OPTIONS.map((opt) => (
        <button
          key={opt.type}
          className={`map-presets__layer-btn ${layerType === opt.type ? "map-presets__layer-btn--active" : ""}`}
          onClick={() => onLayerTypeChange(opt.type)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

export default MapPresets;
