import { useState, useEffect, useRef } from "react";
import { Users } from "lucide-react";
import "./SsiFilter.scss";

interface SsiFilterProps {
  onToggleRegister: () => void;
  selectedSsis: Set<number>;
  dataAgeMinutes: number | null;
  onDataAgeChange: (minutes: number | null) => void;
  retentionDays: number;
}

/* Build the filter summary text based on the current SSI selection */
const formatFilterSummary = (selected: Set<number>): string => {
  if (selected.size === 0) return "All readings";
  if (selected.size === 1) {
    const ssi = selected.values().next().value;
    return `Readings from ISSI ${ssi}`;
  }
  return `Readings from ${selected.size} ISSI's`;
};

/* Number of discrete positions on the slider (0 = All, 1–1000 = log scale) */
const SLIDER_MAX = 1000;

/* Convert a slider position (0–1000) to a duration in minutes using a log scale.
   Position 0 returns null (all readings). Positions 1–1000 map from the full
   retention window down to 1 minute on an exponential curve. */
const sliderToMinutes = (position: number, retentionMinutes: number): number | null => {
  if (position === 0) return null;
  const safeRetention = Math.max(retentionMinutes, 2);
  const minutes = safeRetention ** (1 - (position - 1) / (SLIDER_MAX - 1));
  return Math.max(1, Math.round(minutes));
};

/* Inverse of sliderToMinutes — converts a duration back to a slider position
   so the range input stays controlled. */
const minutesToSlider = (minutes: number | null, retentionMinutes: number): number => {
  if (minutes === null) return 0;
  const safeRetention = Math.max(retentionMinutes, 2);
  const position = 1 + (SLIDER_MAX - 1) * (1 - Math.log(minutes) / Math.log(safeRetention));
  return Math.round(Math.min(SLIDER_MAX, Math.max(0, position)));
};

/* Format a duration in minutes as a human-readable age label */
const formatAge = (minutes: number | null): string => {
  if (minutes === null) return "All";
  if (minutes >= 2880) return `${Math.round(minutes / 1440)} days`;
  if (minutes >= 1440) {
    const hours = Math.round((minutes - 1440) / 60);
    return hours > 0 ? `1 day ${hours} hr` : "1 day";
  }
  if (minutes >= 120) return `${Math.round(minutes / 60)} hours`;
  if (minutes >= 60) {
    const mins = Math.round(minutes - 60);
    return mins > 0 ? `1 hour ${mins} min` : "1 hour";
  }
  return `${Math.round(minutes)} min`;
};

/* How long to wait after the last slider movement before updating the map (ms) */
const DEBOUNCE_MS = 200;

/* Sidebar section for opening the SSI Register overlay and filtering by data age */
const SsiFilter = ({ onToggleRegister, selectedSsis, dataAgeMinutes, onDataAgeChange, retentionDays }: SsiFilterProps) => {
  const retentionMinutes = retentionDays * 1440;
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Local slider position — updates instantly for smooth dragging */
  const [localPosition, setLocalPosition] = useState(() =>
    minutesToSlider(dataAgeMinutes, retentionMinutes)
  );

  /* Sync local position when the parent resets the value (e.g. file load) */
  useEffect(() => {
    setLocalPosition(minutesToSlider(dataAgeMinutes, retentionMinutes));
  }, [dataAgeMinutes, retentionMinutes]);

  /* Update local state immediately, debounce the expensive parent callback */
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const position = parseInt(e.target.value, 10);
    setLocalPosition(position);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      onDataAgeChange(sliderToMinutes(position, retentionMinutes));
    }, DEBOUNCE_MS);
  };

  /* Derive the label from local position so it updates instantly */
  const localMinutes = sliderToMinutes(localPosition, retentionMinutes);

  return (
    <div className="ssi-filter">
      <span className="ssi-filter__label">Filter</span>
      <span className="ssi-filter__count">{formatFilterSummary(selectedSsis)}</span>
      <button className="ssi-filter__btn" onClick={onToggleRegister}>
        <Users size={14} />
        SSI Register
      </button>

      {/* Data age slider — logarithmic scale from all readings down to 1 minute */}
      <div className="ssi-filter__age">
        <div className="ssi-filter__age-header">
          <span className="ssi-filter__age-name">Data Age</span>
          <span className="ssi-filter__age-value">{formatAge(localMinutes)}</span>
        </div>
        <input
          type="range"
          className="ssi-filter__age-slider"
          min={0}
          max={SLIDER_MAX}
          step={1}
          value={localPosition}
          onChange={handleSliderChange}
        />
      </div>
    </div>
  );
};

export default SsiFilter;
