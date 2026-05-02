import { useState, useEffect, useRef } from "react";
import { Users } from "lucide-react";
import { formatAccuracy } from "../../../../utils/format";
import Slider from "../../../Slider/Slider";
import SideBarButton from "../SideBarButton/SideBarButton";
import "./SsiFilter.scss";

interface SsiFilterProps {
  onToggleRegister: () => void;
  selectedSsis: Set<number>;
  isFileMode: boolean;
  dataAgeMinutes: number | null;
  onDataAgeChange: (minutes: number | null) => void;
  retentionDays: number;
  maxAccuracy: number;
  onAccuracyChange: (metres: number) => void;
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

/* Discrete accuracy stops — slider position maps to metres */
const ACCURACY_STOPS = [2, 20, 200, 2000] as const;

/* How long to wait after the last slider movement before updating the map (ms) */
const DEBOUNCE_MS = 200;

/* Sidebar section for opening the SSI Register overlay and filtering by data age and accuracy */
const SsiFilter = ({ onToggleRegister, selectedSsis, isFileMode, dataAgeMinutes, onDataAgeChange, retentionDays, maxAccuracy, onAccuracyChange }: SsiFilterProps) => {
  const retentionMinutes = retentionDays * 1440;
  const ageDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accuracyDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Local slider positions — update instantly for smooth dragging */
  const [localPosition, setLocalPosition] = useState(() =>
    minutesToSlider(dataAgeMinutes, retentionMinutes)
  );
  const [localAccuracy, setLocalAccuracy] = useState(() =>
    Math.max(0, ACCURACY_STOPS.indexOf(maxAccuracy as typeof ACCURACY_STOPS[number]))
  );

  /* Sync local positions when the parent resets values (e.g. file load) */
  useEffect(() => {
    setLocalPosition(minutesToSlider(dataAgeMinutes, retentionMinutes));
  }, [dataAgeMinutes, retentionMinutes]);

  useEffect(() => {
    setLocalAccuracy(Math.max(0, ACCURACY_STOPS.indexOf(maxAccuracy as typeof ACCURACY_STOPS[number])));
  }, [maxAccuracy]);

  /* Update local state immediately, debounce the expensive parent callback */
  const handleAgeChange = (position: number) => {
    setLocalPosition(position);
    if (ageDebounce.current) clearTimeout(ageDebounce.current);
    ageDebounce.current = setTimeout(() => {
      onDataAgeChange(sliderToMinutes(position, retentionMinutes));
    }, DEBOUNCE_MS);
  };

  const handleAccuracyChange = (position: number) => {
    setLocalAccuracy(position);
    if (accuracyDebounce.current) clearTimeout(accuracyDebounce.current);
    accuracyDebounce.current = setTimeout(() => {
      onAccuracyChange(ACCURACY_STOPS[position]);
    }, DEBOUNCE_MS);
  };

  /* Derive labels from local positions so they update instantly */
  const localMinutes = sliderToMinutes(localPosition, retentionMinutes);

  return (
    <div className="ssi-filter">
      <span className="ssi-filter__label">Filter</span>
      <span className="ssi-filter__count">{formatFilterSummary(selectedSsis)}</span>
      <SideBarButton icon={Users} label="SSI Register" onClick={onToggleRegister} />

      {/* Data age slider — logarithmic scale from all readings down to 1 minute */}
      <Slider
        label="Data Age"
        displayValue={isFileMode ? "N/A" : formatAge(localMinutes)}
        min={0}
        max={SLIDER_MAX}
        step={1}
        value={localPosition}
        onChange={handleAgeChange}
        disabled={isFileMode}
      />

      {/* GPS accuracy slider — 4 discrete stops controlling which readings are displayed */}
      <Slider
        label="GPS Accuracy"
        displayValue={formatAccuracy(ACCURACY_STOPS[localAccuracy])}
        min={0}
        max={ACCURACY_STOPS.length - 1}
        step={1}
        value={localAccuracy}
        onChange={handleAccuracyChange}
        stops={ACCURACY_STOPS.length}
      />
    </div>
  );
};

export default SsiFilter;
