import { useRef, useState } from "react";
import { generateUUID } from "../../../../utils/uuid";
import { Trash2, Plus, RotateCcw } from "lucide-react";
import type { CustomSpectrum, ColourStop } from "../../../../utils/rssi";
import { DEFAULT_CUSTOM_SPECTRUM, effectiveMinDbm, formatStopRange } from "../../../../utils/rssi";
import SideBarButton from "../SideBarButton/SideBarButton";
import "./ColourSpectrum.scss";

interface ColourSpectrumProps {
  spectrum: CustomSpectrum;
  onSpectrumChange: (spectrum: CustomSpectrum) => void;
}

/* Convert an RGB tuple to a hex colour string for <input type="color"> */
const rgbToHex = ([r, g, b]: [number, number, number]): string =>
  `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;

/* Parse a hex colour string back to an RGB tuple */
const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/* Sidebar tab for editing the custom RSSI colour spectrum.
   Boundaries are always contiguous — dragging a handle adjusts
   both adjacent bands so there are never gaps or overlaps. */
const ColourSpectrum = ({ spectrum, onSpectrumChange }: ColourSpectrumProps) => {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  /* Sorted stops ascending by minDbm (null = unbounded lowest sorts first) */
  const sortedStops = [...spectrum.stops].sort((a, b) => {
    const aMin = a.minDbm ?? -Infinity;
    const bMin = b.minDbm ?? -Infinity;
    return aMin - bMin;
  });
  const globalMax = sortedStops.length > 0 ? sortedStops[sortedStops.length - 1].maxDbm : -20;

  /* Total flex weight — unbounded stops use effective width for proportional sizing */
  const totalFlex = sortedStops.reduce((sum, s) => sum + (s.maxDbm - effectiveMinDbm(s, sortedStops)), 0) || 1;

  /* Map a pointer X position to a dBm value using the flex coordinate system.
     Walks through segments to find which band the pointer falls in and
     interpolates within that band for precise handle placement. */
  const pointerToDbm = (clientX: number): number => {
    if (!barRef.current || sortedStops.length === 0) return globalMax;
    const rect = barRef.current.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const targetFlex = pct * totalFlex;

    /* Walk through segments to find the correct dBm position */
    let cumFlex = 0;
    for (const stop of sortedStops) {
      const effMin = effectiveMinDbm(stop, sortedStops);
      const span = stop.maxDbm - effMin;
      if (cumFlex + span >= targetFlex) {
        const within = targetFlex - cumFlex;
        return Math.round(effMin + within);
      }
      cumFlex += span;
    }
    return globalMax;
  };

  /* Start dragging a boundary handle between band[idx] and band[idx+1] */
  const handlePointerDown = (e: React.PointerEvent, idx: number) => {
    if (!spectrum.enabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragIdx(idx);
  };

  /* Update the boundary position while dragging */
  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragIdx === null) return;
    let dbm = pointerToDbm(e.clientX);

    /* Clamp: minimum 1 dBm per band on each side of the handle.
       For the unbounded (null) first band, use effective min as lower clamp. */
    const effMin = effectiveMinDbm(sortedStops[dragIdx], sortedStops);
    const minBound = effMin + 1;
    const maxBound = sortedStops[dragIdx + 1].maxDbm - 1;
    dbm = Math.max(minBound, Math.min(maxBound, dbm));

    /* Adjust the two adjacent bands to share the boundary.
       The unbounded first band keeps minDbm as null. */
    const newStops = sortedStops.map((s, i) => {
      if (i === dragIdx) return { ...s, maxDbm: dbm };
      if (i === dragIdx + 1) return { ...s, minDbm: dbm + 1 };
      return s;
    });

    onSpectrumChange({ ...spectrum, stops: newStops });
  };

  /* Finish dragging */
  const handlePointerUp = () => setDragIdx(null);

  /* Update a single stop by id (colour or label) */
  const updateStop = (id: string, patch: Partial<ColourStop>) => {
    onSpectrumChange({
      ...spectrum,
      stops: spectrum.stops.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });
  };

  /* Remove a stop and extend the adjacent band to fill the gap.
     If the removed stop was unbounded (first), the new first stop inherits null minDbm. */
  const removeStop = (id: string) => {
    const sorted = [...spectrum.stops].sort((a, b) => {
      const aMin = a.minDbm ?? -Infinity;
      const bMin = b.minDbm ?? -Infinity;
      return aMin - bMin;
    });
    const idx = sorted.findIndex((s) => s.id === id);
    if (idx === -1 || sorted.length <= 1) return;

    const removed = sorted[idx];
    const newStops = sorted.filter((s) => s.id !== id);

    /* Extend the neighbour below, or make the new first stop unbounded */
    if (idx > 0) {
      newStops[idx - 1] = { ...newStops[idx - 1], maxDbm: removed.maxDbm };
    } else {
      newStops[0] = { ...newStops[0], minDbm: null };
    }

    onSpectrumChange({ ...spectrum, stops: newStops });
  };

  /* Split the widest band in half to add a new colour.
     Unbounded (null) stops use their effective width for comparison. */
  const addStop = () => {
    const sorted = [...spectrum.stops].sort((a, b) => {
      const aMin = a.minDbm ?? -Infinity;
      const bMin = b.minDbm ?? -Infinity;
      return aMin - bMin;
    });
    let widestIdx = 0;
    let widestSpan = 0;
    sorted.forEach((s, i) => {
      const span = s.maxDbm - effectiveMinDbm(s, sorted);
      if (span > widestSpan) { widestSpan = span; widestIdx = i; }
    });

    if (widestSpan < 2) return;

    const target = sorted[widestIdx];
    const effMin = effectiveMinDbm(target, sorted);
    const mid = Math.floor((effMin + target.maxDbm) / 2);

    /* The original stop keeps its minDbm (including null) and gets a new maxDbm.
       The new stop above it always has a concrete minDbm. */
    const newStops = sorted.map((s, i) =>
      i === widestIdx ? { ...s, maxDbm: mid } : s,
    );

    newStops.splice(widestIdx + 1, 0, {
      id: generateUUID(),
      minDbm: mid + 1,
      maxDbm: target.maxDbm,
      color: [128, 128, 128],
      label: "New range",
    });

    onSpectrumChange({ ...spectrum, stops: newStops });
  };

  /* Reset stops to the default Riedel palette */
  const resetToDefault = () => {
    onSpectrumChange({
      ...spectrum,
      stops: DEFAULT_CUSTOM_SPECTRUM.stops.map((s) => ({
        ...s,
        id: generateUUID(),
      })),
    });
  };

  return (
    <div className="colour-spectrum">
      <span className="colour-spectrum__label">Colours</span>

      {/* Toggle to enable/disable the custom spectrum */}
      <label className="colour-spectrum__toggle">
        <span className="colour-spectrum__toggle-text">Use custom spectrum</span>
        <input
          type="checkbox"
          checked={spectrum.enabled}
          onChange={(e) => onSpectrumChange({ ...spectrum, enabled: e.target.checked })}
        />
      </label>

      {/* Editor — greyed when disabled */}
      <div className={`colour-spectrum__editor ${!spectrum.enabled ? "colour-spectrum__editor--disabled" : ""}`}>

        {/* Visual spectrum bar with draggable boundary handles */}
        <div className="colour-spectrum__bar-wrap">
          <div className="colour-spectrum__bar" ref={barRef}>
            {sortedStops.map((stop) => (
              <div
                key={stop.id}
                className="colour-spectrum__segment"
                style={{
                  flex: stop.maxDbm - effectiveMinDbm(stop, sortedStops),
                  backgroundColor: rgbToHex(stop.color),
                }}
              />
            ))}
          </div>

          {/* Handles overlaid at each boundary between adjacent bands */}
          {sortedStops.slice(0, -1).map((stop, i) => {
            /* Cumulative flex up to and including this segment — matches flex layout */
            const cumFlex = sortedStops.slice(0, i + 1).reduce((s, st) => s + (st.maxDbm - effectiveMinDbm(st, sortedStops)), 0);
            const pct = (cumFlex / totalFlex) * 100;
            return (
              <div
                key={`h-${i}`}
                className={`colour-spectrum__handle ${dragIdx === i ? "colour-spectrum__handle--active" : ""}`}
                style={{ left: `${pct}%` }}
                onPointerDown={(e) => handlePointerDown(e, i)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                {/* Tooltip showing boundary dBm while dragging */}
                {dragIdx === i && (
                  <span className="colour-spectrum__handle-tip">
                    {stop.maxDbm}
                  </span>
                )}
              </div>
            );
          })}

          {/* Min / max labels under the bar */}
          <div className="colour-spectrum__bar-labels">
            <span>{sortedStops[0]?.minDbm === null ? `≤ ${sortedStops[0].maxDbm}` : sortedStops[0]?.minDbm} dBm</span>
            <span>{globalMax} dBm</span>
          </div>
        </div>

        {/* Band list — colour picker, label, read-only range, delete */}
        <div className="colour-spectrum__list">
          {[...sortedStops].reverse().map((stop) => (
            <div key={stop.id} className="colour-spectrum__row">
              <label className="colour-spectrum__swatch-label">
                <span
                  className="colour-spectrum__swatch"
                  style={{ backgroundColor: rgbToHex(stop.color) }}
                />
                <input
                  type="color"
                  className="colour-spectrum__color-input"
                  value={rgbToHex(stop.color)}
                  onChange={(e) => updateStop(stop.id, { color: hexToRgb(e.target.value) })}
                  disabled={!spectrum.enabled}
                />
              </label>

              <div className="colour-spectrum__info">
                <input
                  type="text"
                  className="colour-spectrum__name"
                  value={stop.label}
                  onChange={(e) => updateStop(stop.id, { label: e.target.value })}
                  disabled={!spectrum.enabled}
                />
                <span className="colour-spectrum__range-text">
                  {formatStopRange(stop)}
                </span>
              </div>

              {spectrum.stops.length > 1 && (
                <button
                  className="colour-spectrum__delete"
                  onClick={() => removeStop(stop.id)}
                  disabled={!spectrum.enabled}
                  title="Remove range"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="colour-spectrum__actions">
          <SideBarButton icon={Plus} label="Add Range" onClick={addStop} disabled={!spectrum.enabled} />
          <SideBarButton icon={RotateCcw} label="Reset to Default" onClick={resetToDefault} disabled={!spectrum.enabled} />
        </div>
      </div>
    </div>
  );
};

export default ColourSpectrum;
