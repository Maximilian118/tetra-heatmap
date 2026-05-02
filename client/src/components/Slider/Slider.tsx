import { useMemo } from "react";
import "./Slider.scss";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step: number;
  label?: string;
  displayValue?: string;
  stops?: number;
  disabled?: boolean;
  compact?: boolean;
  onChange: (value: number) => void;
  trackBackground?: string;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
}

/* Build inline background-image for discrete stop dots on the track */
const buildStopsDots = (stops: number): string => {
  const dot = "radial-gradient(circle, rgba(161,161,161,0.35) 2px, transparent 2px)";
  const layers: string[] = [];

  for (let i = 0; i < stops; i++) {
    const pct = stops === 1 ? "50%" : `${(i / (stops - 1)) * 100}%`;
    layers.push(`${dot} ${pct} center / 4px 4px no-repeat`);
  }

  layers.push("#323232");
  return layers.join(", ");
};

/* Reusable slider with consistent styling across the sidebar */
const Slider = ({ value, min, max, step, label, displayValue, stops, disabled, compact, trackBackground, onChange, onPointerDown, onPointerUp }: SliderProps) => {
  /* Memoise the track background so it's only recomputed when dependencies change */
  const trackStyle = useMemo(
    () => {
      if (stops) return { background: buildStopsDots(stops) };
      if (trackBackground) return { background: trackBackground };
      return undefined;
    },
    [stops, trackBackground]
  );

  const showHeader = !compact && (label || displayValue);

  const inputClassName = `slider__input${compact ? " slider__input--compact" : ""}`;

  const containerClassName = [
    "slider",
    compact && "slider--compact",
    disabled && "slider--disabled",
  ].filter(Boolean).join(" ");

  return (
    <div className={containerClassName}>
      {showHeader && (
        <div className="slider__header">
          {label && <span className="slider__label">{label}</span>}
          {displayValue && <span className="slider__value">{displayValue}</span>}
        </div>
      )}

      <input
        type="range"
        className={inputClassName}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={trackStyle}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />

      {compact && displayValue && (
        <span className="slider__compact-value">{displayValue}</span>
      )}
    </div>
  );
};

export default Slider;
