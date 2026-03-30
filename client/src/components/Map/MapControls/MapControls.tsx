import "./MapControls.scss";

interface MapControlsProps {
  resetting: boolean;
  resetMessage: string | null;
  onReset: () => void;
}

/* Overlay controls for cache management */
const MapControls = ({ resetting, resetMessage, onReset }: MapControlsProps) => (
  <div className="map-controls">
    <button
      className="reset-btn"
      onClick={onReset}
      disabled={resetting}
    >
      {resetting ? "Resetting..." : "Reset Cache"}
    </button>
    {resetMessage && <span className="reset-message">{resetMessage}</span>}
  </div>
);

export default MapControls;
