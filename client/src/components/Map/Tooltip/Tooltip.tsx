import { formatAccuracy, formatServerTime, formatTzLabel } from "../../../utils/format";
import "./Tooltip.scss";

/* State shape for a hovered reading */
export interface TooltipInfo {
  x: number;
  y: number;
  ssi: number;
  rssi: number;
  timestamp: string;
  positionError: number | null;
  description: string;
}

interface TooltipProps {
  tooltip: TooltipInfo | null;
  clockOffsetMs: number;
  serverTzOffsetHours: number;
}

/* Floating tooltip that follows the cursor over heatmap data points */
const Tooltip = ({ tooltip, clockOffsetMs, serverTzOffsetHours }: TooltipProps) => {
  if (!tooltip) return null;

  /* Show description alongside ISSI if available */
  const issiLabel = tooltip.description
    ? `${tooltip.ssi} - ${tooltip.description}`
    : String(tooltip.ssi);

  return (
    <div
      className="map-tooltip"
      style={{ left: tooltip.x + 12, top: tooltip.y - 12 }}
    >
      <div><strong>ISSI:</strong> {issiLabel}</div>
      <div><strong>RSSI:</strong> {tooltip.rssi} dBm</div>
      <div><strong>Time:</strong> {formatServerTime(tooltip.timestamp, clockOffsetMs, serverTzOffsetHours)} {formatTzLabel(serverTzOffsetHours)}</div>
      <div><strong>GPS Accuracy:</strong> {formatAccuracy(tooltip.positionError)}</div>
    </div>
  );
};

export default Tooltip;
