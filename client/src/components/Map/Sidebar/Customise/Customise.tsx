import type { LayerType } from "../MapPresets/MapPresets";
import Slider from "../../../Slider/Slider";
import "./Customise.scss";

/* Per-layer styling parameters exposed as sidebar controls */
export interface LayerSettings {
  opacity: number;
  radiusPixels: number;
  hexRadius: number;
  coverage: number;
  elevationScale: number;
  lineWidth: number;
  kmlLineWidth: number;
  kmlLineShade: number;
  scope: number;
}

export const DEFAULT_LAYER_SETTINGS: LayerSettings = {
  opacity: 0.8,
  radiusPixels: 20,
  hexRadius: 8,
  coverage: 0.85,
  elevationScale: 1,
  lineWidth: 10,
  kmlLineWidth: 1,
  kmlLineShade: 80,
  scope: 5,
};

/* Slider configuration for each adjustable parameter */
interface SliderConfig {
  key: keyof LayerSettings;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  trackBackground?: string;
}

/* Format a number as a percentage string */
const pct = (v: number) => `${Math.round(v * 100)}%`;

/* Format a number with one decimal place */
const dec1 = (v: number) => v.toFixed(1);

/* Format a number as a plain integer */
const int = (v: number) => String(Math.round(v));

/* Format a number as metres */
const meters = (v: number) => `${Math.round(v)}m`;

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

/* Sliders specific to the KML layer */
const KML_SLIDERS: SliderConfig[] = [
  { key: "scope", label: "Scope", min: 5, max: 500, step: 5, format: meters },
  { key: "kmlLineWidth", label: "Line Width", min: 1, max: 10, step: 0.5, format: dec1 },
  { key: "kmlLineShade", label: "Line Shade", min: 0, max: 255, step: 1, format: int, trackBackground: "linear-gradient(to right, #000000, #ffffff)" },
];

/* Map layer type to its specific sliders */
const LAYER_SLIDERS: Record<LayerType, SliderConfig[]> = {
  heatmap: HEATMAP_SLIDERS,
  hexagon: HEXAGON_SLIDERS,
  path: PATH_SLIDERS,
  kml: KML_SLIDERS,
};

interface CustomiseProps {
  layerType: LayerType;
  settings: LayerSettings;
  onSettingsChange: (settings: LayerSettings) => void;
  onScopeAdjusting?: (adjusting: boolean) => void;
}

/* Sidebar section with adjustable styling sliders that swap based on active layer type */
const Customise = ({ layerType, settings, onSettingsChange, onScopeAdjusting }: CustomiseProps) => {
  /* Combine shared sliders with the layer-specific ones */
  const sliders = [...SHARED_SLIDERS, ...LAYER_SLIDERS[layerType]];

  return (
    <div className="customise">
      <span className="customise__label">Customise</span>

      {sliders.map((s) => (
        <Slider
          key={s.key}
          label={s.label}
          displayValue={s.format(settings[s.key])}
          min={s.min}
          max={s.max}
          step={s.step}
          value={settings[s.key]}
          trackBackground={s.trackBackground}
          onChange={(v) => onSettingsChange({ ...settings, [s.key]: v })}
          onPointerDown={s.key === "scope" ? () => onScopeAdjusting?.(true) : undefined}
          onPointerUp={s.key === "scope" ? () => onScopeAdjusting?.(false) : undefined}
        />
      ))}
    </div>
  );
};

export default Customise;
