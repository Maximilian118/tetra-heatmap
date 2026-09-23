import { useMemo } from "react";
import { compareSectorNames, hasMeasuredSectors, type KmlGeoJsonFeatureCollection } from "../../../../utils/kml";
import "./ReportSectorStats.scss";

interface ReportSectorStatsProps {
  kmlGeoJson: KmlGeoJsonFeatureCollection | null;
}

/* Maximum sector rows per column before wrapping to the next column */
const MAX_PER_COLUMN = 12;

/* Row height in px (11px font + 2px padding + 2px gap) — used to set
   an explicit grid height so column-fill: auto fills left-first */
const ROW_HEIGHT_PX = 15;

/* Extract a short display label from a KML sector name.
   e.g. "Sector00" → "PIT", "Sector05" → "05", "Turn 3" → "Turn 3" */
const sectorLabel = (name: string): string => {
  const match = name.match(/(\d+)$/);
  if (!match) return name;
  return match[1] === "00" ? "PIT" : match[1].padStart(2, "0");
};

/* Sector median RSSI stats box for the PDF report.
   Lists every KML polygon sector so the numbering stays continuous — sectors with
   neither readings nor a manual override show a dash rather than being omitted.
   Hidden entirely when no sector has a value at all. */
const ReportSectorStats = ({ kmlGeoJson }: ReportSectorStatsProps) => {
  /* Every sector, sorted by name (numeric-aware) */
  const sectors = useMemo(() => {
    if (!kmlGeoJson) return [];
    return [...kmlGeoJson.features].sort((a, b) =>
      compareSectorNames(a.properties.name, b.properties.name)
    );
  }, [kmlGeoJson]);

  if (!hasMeasuredSectors(kmlGeoJson)) return null;

  /* Determine column count and explicit grid height so column-fill: auto fills left-first */
  const columnCount = Math.ceil(sectors.length / MAX_PER_COLUMN);
  const rowsInFirstCol = Math.min(sectors.length, MAX_PER_COLUMN);
  const gridHeight = rowsInFirstCol * ROW_HEIGHT_PX;

  return (
    <div className="report-sector-stats">
      <div className="report-sector-stats__heading">Sector Median</div>
      <div className="report-sector-stats__grid" style={{ columnCount, height: gridHeight }}>
        {sectors.map((f, i) => (
            <div key={i} className="report-sector-stats__row">
              <span className="report-sector-stats__name">{sectorLabel(f.properties.name)}</span>
              <span className="report-sector-stats__value">
                {f.properties.medianRssi === null ? "—" : Math.round(f.properties.medianRssi)}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
};

export default ReportSectorStats;
