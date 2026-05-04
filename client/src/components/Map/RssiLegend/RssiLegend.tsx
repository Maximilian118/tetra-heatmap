import { useState, useMemo, type MouseEvent } from "react";
import { RSSI_MIN, RSSI_MAX, rssiQualityLabel, type CustomSpectrum } from "../../../utils/rssi";
import type { Reading } from "../../../utils/api";
import "./RssiLegend.scss";

interface RssiLegendProps {
  customSpectrum?: CustomSpectrum;
  readings?: Reading[];
  onClick?: () => void;
}

/* Colour gradient legend showing the RSSI dBm range.
   When a custom spectrum is active, hovering a colour block shows
   the range name, dBm bounds, and how many readings fall within it. */
const RssiLegend = ({ customSpectrum, readings = [], onClick }: RssiLegendProps) => {
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);
  const [hoverDefault, setHoverDefault] = useState<{ offsetX: number; dBm: number } | null>(null);
  const useCustom = customSpectrum?.enabled && customSpectrum.stops.length > 0;

  /* Sort custom stops by minDbm ascending for display */
  const sortedStops = useMemo(() => {
    if (!useCustom) return [];
    return [...customSpectrum!.stops].sort((a, b) => a.minDbm - b.minDbm);
  }, [useCustom, customSpectrum]);

  /* Total flex weight for proportional segment widths */
  const totalFlex = useMemo(() => {
    if (!useCustom || sortedStops.length === 0) return 1;
    return sortedStops.reduce((sum, s) => sum + (s.maxDbm - s.minDbm), 0);
  }, [useCustom, sortedStops]);

  /* Count readings per custom stop */
  const countsById = useMemo(() => {
    if (!useCustom) return new Map<string, number>();
    const counts = new Map<string, number>();
    for (const stop of sortedStops) counts.set(stop.id, 0);

    for (const r of readings) {
      if (r.rssi === null) continue;
      for (const stop of sortedStops) {
        if (r.rssi >= stop.minDbm && r.rssi <= stop.maxDbm) {
          counts.set(stop.id, (counts.get(stop.id) ?? 0) + 1);
          break;
        }
      }
    }
    return counts;
  }, [useCustom, sortedStops, readings]);

  /* Count readings per default quality band */
  const defaultBandAtDbm = useMemo(() => {
    if (useCustom) return null;
    return (dBm: number) => {
      const label = rssiQualityLabel(dBm);
      let count = 0;
      for (const r of readings) {
        if (r.rssi !== null && rssiQualityLabel(r.rssi) === label) count++;
      }
      return { label, count };
    };
  }, [useCustom, readings]);

  /* Interpolate dBm from cursor position along the default gradient bar */
  const handleDefaultMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const bar = e.currentTarget;
    const offsetX = Math.max(0, Math.min(e.nativeEvent.offsetX, bar.offsetWidth));
    const dBm = Math.round(RSSI_MIN + (offsetX / bar.offsetWidth) * (RSSI_MAX - RSSI_MIN));
    setHoverDefault({ offsetX, dBm });
  };

  /* The hovered custom stop (for the tooltip) */
  const hoveredStop = useCustom ? sortedStops.find((s) => s.id === hoveredStopId) : null;

  /* Custom spectrum: render discrete colour blocks with rich tooltip */
  if (useCustom) {
    const minLabel = sortedStops[0].minDbm;
    const maxLabel = sortedStops[sortedStops.length - 1].maxDbm;

    return (
      <div className="rssi-legend" onClick={onClick}>
        <span className="rssi-legend__label">{minLabel} dBm</span>
        <div className="rssi-legend__bar rssi-legend__bar--custom">
          {sortedStops.map((stop) => {
            const span = stop.maxDbm - stop.minDbm;
            const widthPct = (span / totalFlex) * 100;
            return (
              <div
                key={stop.id}
                className="rssi-legend__block"
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: `rgb(${stop.color[0]}, ${stop.color[1]}, ${stop.color[2]})`,
                }}
                onMouseEnter={() => setHoveredStopId(stop.id)}
                onMouseLeave={() => setHoveredStopId(null)}
              />
            );
          })}

          {/* Tooltip styled like the GPS data point tooltip */}
          {hoveredStop && (
            <div className="rssi-legend__info">
              <div><strong>{hoveredStop.label}</strong></div>
              <div><strong>Range:</strong> {hoveredStop.minDbm} to {hoveredStop.maxDbm} dBm</div>
              <div><strong>Readings:</strong> {countsById.get(hoveredStop.id) ?? 0}</div>
            </div>
          )}
        </div>
        <span className="rssi-legend__label">{maxLabel} dBm</span>
      </div>
    );
  }

  /* Default: continuous CSS gradient with quality-band tooltip */
  const defaultInfo = hoverDefault && defaultBandAtDbm ? defaultBandAtDbm(hoverDefault.dBm) : null;

  return (
    <div className="rssi-legend" onClick={onClick}>
      <span className="rssi-legend__label">{RSSI_MIN} dBm</span>
      <div
        className="rssi-legend__bar"
        onMouseMove={handleDefaultMouseMove}
        onMouseLeave={() => setHoverDefault(null)}
      >
        {hoverDefault && defaultInfo && (
          <div className="rssi-legend__info" style={{ left: hoverDefault.offsetX }}>
            <div><strong>{defaultInfo.label}</strong></div>
            <div><strong>RSSI:</strong> {hoverDefault.dBm} dBm</div>
            <div><strong>Readings:</strong> {defaultInfo.count}</div>
          </div>
        )}
      </div>
      <span className="rssi-legend__label">{RSSI_MAX} dBm</span>
    </div>
  );
};

export default RssiLegend;
