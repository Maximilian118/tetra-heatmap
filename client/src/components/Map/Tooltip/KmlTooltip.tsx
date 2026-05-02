import { rssiQualityLabel } from "../../../utils/rssi";
import "./Tooltip.scss";

/* State shape for a hovered KML polygon */
export interface KmlTooltipInfo {
  x: number;
  y: number;
  name: string;
  meanRssi: number | null;
  minRssi: number | null;
  maxRssi: number | null;
  count: number;
}

interface KmlTooltipProps {
  tooltip: KmlTooltipInfo | null;
}

/* Floating tooltip that follows the cursor over KML polygon sectors */
const KmlTooltip = ({ tooltip }: KmlTooltipProps) => {
  if (!tooltip) return null;

  const hasData = tooltip.meanRssi !== null;

  return (
    <div
      className="map-tooltip"
      style={{ left: tooltip.x + 12, top: tooltip.y - 12 }}
    >
      <div><strong>{tooltip.name}</strong></div>
      {hasData ? (
        <>
          <div><strong>Quality:</strong> {rssiQualityLabel(tooltip.meanRssi!)}</div>
          <div><strong>Mean RSSI:</strong> {Math.round(tooltip.meanRssi!)} dBm</div>
          <div><strong>Range:</strong> {tooltip.minRssi} to {tooltip.maxRssi} dBm</div>
          <div><strong>Data Points:</strong> {tooltip.count.toLocaleString()}</div>
        </>
      ) : (
        <div>No data</div>
      )}
    </div>
  );
};

export default KmlTooltip;
