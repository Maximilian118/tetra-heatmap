import type { KmlFolder, KmlLayerStyle } from "../../../../utils/kml";
import Slider from "../../../Slider/Slider";
import "./KmlLayers.scss";

interface KmlLayersProps {
  folders: KmlFolder[];
  styles: Record<string, KmlLayerStyle>;
  onStyleChange: (folderName: string, style: KmlLayerStyle) => void;
}

/* Convert an RGB tuple to a hex color string for the color input */
const rgbToHex = ([r, g, b]: [number, number, number]): string =>
  `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;

/* Convert a hex color string to an RGB tuple */
const hexToRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/* Sidebar section listing all detected KML folder layers with per-layer controls */
const KmlLayers = ({ folders, styles, onStyleChange }: KmlLayersProps) => {
  return (
    <div className="kml-layers">
      <span className="kml-layers__label">KML Layers</span>

      {folders.map((folder) => {
        const style = styles[folder.name];
        if (!style) return null;

        const hasGeometry = folder.lines.length > 0 || folder.polygons.length > 0;

        return (
          <div
            key={folder.name}
            className={`kml-layers__row ${!style.visible ? "kml-layers__row--hidden" : ""}`}
          >
            {/* Top line — checkbox + name + color swatch */}
            <div className="kml-layers__header">
              <label className="kml-layers__check">
                <input
                  type="checkbox"
                  checked={style.visible}
                  onChange={(e) =>
                    onStyleChange(folder.name, { ...style, visible: e.target.checked })
                  }
                />
                <span className="kml-layers__name">{folder.name}</span>
              </label>

              <div className="kml-layers__controls">
                <input
                  type="color"
                  className="kml-layers__color"
                  value={rgbToHex(style.color)}
                  onChange={(e) =>
                    onStyleChange(folder.name, { ...style, color: hexToRgb(e.target.value) })
                  }
                  disabled={!style.visible}
                />
              </div>
            </div>

            {/* Width slider — shown for folders with lines or polygons */}
            {hasGeometry && (
              <div className="kml-layers__width">
                <Slider
                  label="Width"
                  displayValue={style.width.toFixed(1)}
                  value={style.width}
                  min={1}
                  max={10}
                  step={0.5}
                  disabled={!style.visible}
                  onChange={(v) =>
                    onStyleChange(folder.name, { ...style, width: v })
                  }
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default KmlLayers;
