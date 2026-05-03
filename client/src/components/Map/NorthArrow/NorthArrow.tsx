import "./NorthArrow.scss";

interface NorthArrowProps {
  bearing: number;
  onResetNorth: () => void;
}

/* Compass arrow overlay — rotates to always point north.
   Clicking it snaps the map bearing back to 0°. */
const NorthArrow = ({ bearing, onResetNorth }: NorthArrowProps) => {
  const isRotated = Math.abs(bearing) > 0.5;

  return (
    <button
      className={`north-arrow${isRotated ? " north-arrow--rotated" : ""}`}
      onClick={onResetNorth}
      title={isRotated ? "Reset to north" : "Facing north"}
      aria-label="Reset map orientation to north"
    >
      {/* Arrow SVG — the "N" tip is red, body is white */}
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        style={{ transform: `rotate(${-bearing}deg)`, transition: "transform 0.3s ease" }}
      >
        {/* North half of the arrow (red) */}
        <polygon points="12,2 8,14 12,12" fill="#e05050" />
        {/* South half of the arrow (white) */}
        <polygon points="12,2 16,14 12,12" fill="#ffffff" />
        {/* South tail left */}
        <polygon points="12,22 8,14 12,12" fill="rgba(255,255,255,0.35)" />
        {/* South tail right */}
        <polygon points="12,22 16,14 12,12" fill="rgba(255,255,255,0.15)" />
      </svg>
    </button>
  );
};

export default NorthArrow;
