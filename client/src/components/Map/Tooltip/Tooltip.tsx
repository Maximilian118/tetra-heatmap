import "./Tooltip.scss";

/* State shape for a hovered reading */
export interface TooltipInfo {
  x: number;
  y: number;
  ssi: number;
  rssi: number;
  timestamp: string;
}

interface TooltipProps {
  tooltip: TooltipInfo | null;
}

/* Floating tooltip that follows the cursor over heatmap data points */
const Tooltip = ({ tooltip }: TooltipProps) => {
  if (!tooltip) return null;

  return (
    <div
      className="map-tooltip"
      style={{ left: tooltip.x + 12, top: tooltip.y - 12 }}
    >
      <div><strong>ISSI:</strong> {tooltip.ssi}</div>
      <div><strong>RSSI:</strong> {tooltip.rssi} dBm</div>
      <div><strong>Time:</strong> {new Date(tooltip.timestamp).toLocaleString()}</div>
    </div>
  );
};

export default Tooltip;
