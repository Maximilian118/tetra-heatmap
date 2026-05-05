import { useMemo } from "react";
import { SendToBack, PowerOff, Trash2 } from "lucide-react";
import type { MapSymbol } from "../../../utils/api";
import "./Radial.scss";

interface RadialProps {
  symbol: MapSymbol | null;
  /* Screen-space position of the selected symbol [x, y] or null if unavailable */
  screenPos: [number, number] | null;
  /* True when playing the exit animation before unmount */
  leaving?: boolean;
  onBackupChange: (id: string, backup: boolean) => void;
  onInactiveChange: (id: string, inactive: boolean) => void;
  onDelete: (id: string) => void;
  onHoverAction?: () => void;
}

/* Radial offset distance from symbol centre (px) */
const RADIUS = 54;

/* Angle offsets for each action button (in radians, starting from top) */
const ANGLES = [
  -Math.PI / 2,                       // top — Backup
  -Math.PI / 2 + (2 * Math.PI / 3),   // bottom-right — Inactive
  -Math.PI / 2 + (4 * Math.PI / 3),   // bottom-left — Remove
];

/* On-map radial action menu — three circular buttons around the selected symbol */
const Radial = ({ symbol, screenPos, leaving, onBackupChange, onInactiveChange, onDelete, onHoverAction }: RadialProps) => {
  /* Compute button positions from centre */
  const positions = useMemo(() => ANGLES.map((a) => ({
    x: Math.cos(a) * RADIUS,
    y: Math.sin(a) * RADIUS,
  })), []);

  if (!symbol || !screenPos) return null;

  const containerClass = `radial${leaving ? " radial--leaving" : ""}`;

  return (
    <div
      className={containerClass}
      style={{ left: screenPos[0], top: screenPos[1] }}
    >
      {/* Backup toggle */}
      <button
        className={`radial__btn${symbol.backup ? " radial__btn--active" : ""}`}
        style={{ transform: `translate(${positions[0].x}px, ${positions[0].y}px)` }}
        onClick={() => onBackupChange(symbol.id, !symbol.backup)}
        onMouseEnter={onHoverAction}
        data-tooltip={symbol.backup ? "Remove backup" : "Backup"}
      >
        <SendToBack size={16} />
      </button>

      {/* Inactive toggle */}
      <button
        className={`radial__btn${symbol.inactive ? " radial__btn--active" : ""}`}
        style={{ transform: `translate(${positions[1].x}px, ${positions[1].y}px)` }}
        onClick={() => onInactiveChange(symbol.id, !symbol.inactive)}
        onMouseEnter={onHoverAction}
        data-tooltip={symbol.inactive ? "Activate" : "Inactive"}
      >
        <PowerOff size={16} />
      </button>

      {/* Remove */}
      <button
        className="radial__btn radial__btn--danger"
        style={{ transform: `translate(${positions[2].x}px, ${positions[2].y}px)` }}
        onClick={() => onDelete(symbol.id)}
        onMouseEnter={onHoverAction}
        data-tooltip="Remove"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
};

export default Radial;
