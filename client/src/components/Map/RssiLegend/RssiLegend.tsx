import { RSSI_MIN, RSSI_MAX } from "../../../utils/rssi";
import "./RssiLegend.scss";

/* Colour gradient legend showing the RSSI dBm range */
const RssiLegend = () => (
  <div className="rssi-legend">
    <span className="rssi-legend__label">{RSSI_MIN} dBm</span>
    <div className="rssi-legend__bar" />
    <span className="rssi-legend__label">{RSSI_MAX} dBm</span>
  </div>
);

export default RssiLegend;
