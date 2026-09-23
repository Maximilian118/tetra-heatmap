import { useMemo, useEffect, useRef } from "react";
import { formatStopRange, rgbToCss, type CustomSpectrum } from "../../../utils/rssi";
import { hasNoDataSectors, NO_DATA_COLOR, type KmlGeoJsonFeatureCollection } from "../../../utils/kml";
import type { MapSymbol } from "../../../utils/api";
import { buildSymbolIcon, type SymbolType } from "../../../utils/symbols";
import "./ReportLegend.scss";

interface ReportLegendProps {
  customSpectrum: CustomSpectrum;
  symbols: MapSymbol[];
  zoom: number;
  latitude: number;
  kmlGeoJson: KmlGeoJsonFeatureCollection | null;
}

/* A single legend row. A null range marks an entry with no dBm bounds,
   such as the no-data fill, which renders as its label alone. */
interface LegendBand {
  range: string | null;
  color: string;
  label: string;
}

/* Default RSSI quality bands matching the example PDF legend */
const DEFAULT_BANDS: { minDbm: number | null; maxDbm: number; color: string; label: string }[] = [
  { minDbm: null, maxDbm: -105, color: "#1a1a1a", label: "Critical" },
  { minDbm: -105, maxDbm:  -96, color: "#d32f2f", label: "Poor" },
  { minDbm:  -96, maxDbm:  -81, color: "#f5a623", label: "Marginal" },
  { minDbm:  -81, maxDbm:    0, color: "#388e3c", label: "Good" },
];

/* Legend row explaining sectors drawn with the no-data fill */
const NO_DATA_BAND: LegendBand = {
  range: null,
  color: rgbToCss(NO_DATA_COLOR),
  label: "No readings",
};

/* Round distance candidates for the scale bar */
const SCALE_STEPS = [25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];

/* Maximum pixel width for the scale bar */
const MAX_BAR_PX = 120;

/* Compute scale bar distance and pixel width from zoom level and latitude.
   Uses the Web Mercator formula: metersPerPixel = C * cos(lat) / 2^zoom */
const computeScaleBar = (zoom: number, latitude: number): { distance: number; widthPx: number; label: string } => {
  const metersPerPx = (156543.03 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom);
  const maxMeters = MAX_BAR_PX * metersPerPx;

  /* Pick the largest round step that fits within the max pixel width */
  let distance = SCALE_STEPS[0];
  for (const step of SCALE_STEPS) {
    if (step <= maxMeters) distance = step;
    else break;
  }

  const widthPx = distance / metersPerPx;
  const label = distance >= 1000 ? `${distance / 1000} km` : `${distance} m`;
  return { distance, widthPx, label };
};

/* Derive distinct symbol legend entries from the symbols on the map.
   Shows one row per unique category: base-station, base-station backup,
   and at most one repeater entry (omni or directional, whichever appears first). */
const deriveSymbolEntries = (symbols: MapSymbol[]) => {
  let baseStation = false;
  let backupBaseStation = false;
  let repeaterType: SymbolType | null = null;
  let repeaterBackup = false;

  for (const s of symbols) {
    if (s.inactive) continue;
    if (s.type === "base-station" && !s.backup) baseStation = true;
    else if (s.type === "base-station" && s.backup) backupBaseStation = true;
    else if ((s.type === "repeater-omni" || s.type === "repeater-directional") && !repeaterType) {
      repeaterType = s.type as SymbolType;
      repeaterBackup = s.backup;
    }
  }

  /* Fixed order: base station → backup base station → repeater */
  const entries: { type: SymbolType; backup: boolean; label: string }[] = [];
  if (baseStation) entries.push({ type: "base-station", backup: false, label: "Base Station" });
  if (backupBaseStation) entries.push({ type: "base-station", backup: true, label: "Backup Base Station" });
  if (repeaterType) entries.push({ type: repeaterType, backup: repeaterBackup, label: "Repeater" });

  return entries;
};

/* Renders a single symbol icon to a <canvas> element in the legend */
const SymbolIcon = ({ type, backup }: { type: SymbolType; backup: boolean }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  /* Draw the symbol once on mount */
  useEffect(() => {
    if (!ref.current) return;
    const icon = buildSymbolIcon(type, backup, 24);
    const ctx = ref.current.getContext("2d")!;
    ctx.clearRect(0, 0, 24, 24);
    ctx.drawImage(icon, 0, 0);
  }, [type, backup]);

  return <canvas ref={ref} width={24} height={24} className="report-legend__icon" />;
};

/* Report legend box — RSSI colour swatches, map symbols, and scale bar.
   Positioned at the bottom-left of the map in report mode. */
const ReportLegend = ({ customSpectrum, symbols, zoom, latitude, kmlGeoJson }: ReportLegendProps) => {
  const useCustom = customSpectrum?.enabled && customSpectrum.stops.length > 0;

  /* Build the legend bands from either custom spectrum or default thresholds,
     weakest first. The no-data row is prepended above the lowest band, and only
     when the map actually shows a sector with no readings. */
  const bands = useMemo(() => {
    const ranged: LegendBand[] = useCustom
      ? [...customSpectrum.stops]
          .sort((a, b) => (a.minDbm ?? -Infinity) - (b.minDbm ?? -Infinity))
          .map((s) => ({ range: formatStopRange(s), color: rgbToCss(s.color), label: s.label }))
      : DEFAULT_BANDS.map((b) => ({ range: formatStopRange(b), color: b.color, label: b.label }));

    return hasNoDataSectors(kmlGeoJson) ? [NO_DATA_BAND, ...ranged] : ranged;
  }, [useCustom, customSpectrum, kmlGeoJson]);

  /* Derive which symbol types are present on the map */
  const symbolEntries = useMemo(() => deriveSymbolEntries(symbols), [symbols]);

  /* Compute the scale bar width and label */
  const scale = useMemo(() => computeScaleBar(zoom, latitude), [zoom, latitude]);

  return (
    <div className="report-legend">
      <div className="report-legend__heading">Legend</div>
      <div className="report-legend__subtitle">RSSI Level (dBm)</div>

      {/* Colour swatches with dBm range and label */}
      <div className="report-legend__bands">
        {bands.map((band, i) => (
          <div key={i} className="report-legend__band">
            <span className="report-legend__swatch" style={{ backgroundColor: band.color }} />
            <span className="report-legend__label">
              {band.range === null ? band.label : `${band.range} — ${band.label}`}
            </span>
          </div>
        ))}
      </div>

      {/* Actual map symbol icons derived from placed symbols */}
      {symbolEntries.length > 0 && (
        <div className="report-legend__symbols">
          {symbolEntries.map((entry, i) => (
            <div key={i} className="report-legend__symbol">
              <SymbolIcon type={entry.type} backup={entry.backup} />
              <span className="report-legend__label">{entry.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Scale bar */}
      <div className="report-legend__scale">
        <div className="report-legend__scale-labels">
          <span>0</span>
          <span>{Math.round(scale.distance / 2)}</span>
          <span>{scale.label}</span>
        </div>
        <div className="report-legend__scale-bar" style={{ width: scale.widthPx }}>
          <div className="report-legend__scale-half report-legend__scale-half--dark" />
          <div className="report-legend__scale-half report-legend__scale-half--light" />
        </div>
      </div>
    </div>
  );
};

export default ReportLegend;
