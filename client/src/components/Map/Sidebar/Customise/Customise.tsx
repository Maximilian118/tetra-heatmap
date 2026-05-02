import type { LayerType } from "../MapPresets/MapPresets";
import "./Customise.scss";

/* Per-layer styling parameters exposed as sidebar controls */
export interface LayerSettings {
  opacity: number;
  radiusPixels: number;
  hexRadius: number;
  coverage: number;
  elevationScale: number;
  lineWidth: number;
}

export const DEFAULT_LAYER_SETTINGS: LayerSettings = {
  opacity: 0.8,
  radiusPixels: 20,
  hexRadius: 8,
  coverage: 0.85,
  elevationScale: 1,
  lineWidth: 10,
};

/* Slider configuration for each adjustable parameter */
interface SliderConfig {
  key: keyof LayerSettings;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

/* Format a number as a percentage string */
const pct = (v: number) => `${Math.round(v * 100)}%`;

/* Format a number with one decimal place */
const dec1 = (v: number) => v.toFixed(1);

/* Format a number as a plain integer */
const int = (v: number) => String(Math.round(v));

/* Sliders shown for every layer type */
const SHARED_SLIDERS: SliderConfig[] = [
  { key: "opacity", label: "Opacity", min: 0, max: 1, step: 0.05, format: pct },
];

/* Sliders specific to the heatmap layer */
const HEATMAP_SLIDERS: SliderConfig[] = [
  { key: "radiusPixels", label: "Radius", min: 5, max: 100, step: 1, format: int },
];

/* Sliders specific to the hexagon layer */
const HEXAGON_SLIDERS: SliderConfig[] = [
  { key: "hexRadius", label: "Hex Radius", min: 1, max: 50, step: 1, format: int },
  { key: "coverage", label: "Coverage", min: 0.1, max: 1, step: 0.05, format: pct },
  { key: "elevationScale", label: "Elevation", min: 0.1, max: 10, step: 0.1, format: dec1 },
];

/* Sliders specific to the path layer */
const PATH_SLIDERS: SliderConfig[] = [
  { key: "lineWidth", label: "Path Width", min: 1, max: 20, step: 1, format: int },
];

/* Map layer type to its specific sliders */
const LAYER_SLIDERS: Record<LayerType, SliderConfig[]> = {
  heatmap: HEATMAP_SLIDERS,
  hexagon: HEXAGON_SLIDERS,
  path: PATH_SLIDERS,
};

interface CustomiseProps {
  layerType: LayerType;
  settings: LayerSettings;
  onSettingsChange: (settings: LayerSettings) => void;
}

/* Sidebar section with adjustable styling sliders that swap based on active layer type */
const Customise = ({ layerType, settings, onSettingsChange }: CustomiseProps) => {
  /* Build a change handler that updates a single setting key */
  const handleChange = (key: keyof LayerSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onSettingsChange({ ...settings, [key]: parseFloat(e.target.value) });
  };

  /* Combine shared sliders with the layer-specific ones */
  const sliders = [...SHARED_SLIDERS, ...LAYER_SLIDERS[layerType]];

  return (
    <div className="customise">
      <span className="customise__label">Customise</span>

      {sliders.map((s) => (
        <div key={s.key} className="customise__slider-group">
          <div className="customise__slider-header">
            <span className="customise__slider-name">{s.label}</span>
            <span className="customise__slider-value">{s.format(settings[s.key])}</span>
          </div>
          <input
            type="range"
            className="customise__slider"
            min={s.min}
            max={s.max}
            step={s.step}
            value={settings[s.key]}
            onChange={handleChange(s.key)}
          />
        </div>
      ))}
    </div>
  );
};

export default Customise;
