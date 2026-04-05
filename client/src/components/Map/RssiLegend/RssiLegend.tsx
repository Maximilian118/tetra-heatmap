import { useState, type MouseEvent } from "react";
import { RSSI_MIN, RSSI_MAX } from "../../../utils/rssi";
import "./RssiLegend.scss";

/* Colour gradient legend showing the RSSI dBm range */
const RssiLegend = () => {
  const [hover, setHover] = useState<{ offsetX: number; dBm: number } | null>(null);

  /* Interpolate dBm from cursor position along the gradient bar */
  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const bar = e.currentTarget;
    const offsetX = Math.max(0, Math.min(e.nativeEvent.offsetX, bar.offsetWidth));
    const dBm = Math.round(RSSI_MIN + (offsetX / bar.offsetWidth) * (RSSI_MAX - RSSI_MIN));
    setHover({ offsetX, dBm });
  };

  return (
    <div className="rssi-legend">
      <span className="rssi-legend__label">{RSSI_MIN} dBm</span>
      <div
        className="rssi-legend__bar"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        {hover && (
          <div className="rssi-legend__tooltip" style={{ left: hover.offsetX }}>
            {hover.dBm} dBm
          </div>
        )}
      </div>
      <span className="rssi-legend__label">{RSSI_MAX} dBm</span>
    </div>
  );
};

export default RssiLegend;
