import { Trash2, Navigation } from "lucide-react";
import type { MapSymbol } from "../../../../utils/api";
import { SYMBOL_TYPES, buildIconAtlas, ICON_MAPPING, degreesToCompass, type SymbolType } from "../../../../utils/symbols";
import { useRef, useEffect, useMemo } from "react";
import "./Symbols.scss";

interface SymbolsProps {
  symbols: MapSymbol[];
  symbolSize: number;
  onSymbolSizeChange: (size: number) => void;
  selectedSymbolId: string | null;
  onSelectSymbol: (id: string | null) => void;
  onDelete: (id: string) => void;
  onFlyTo: (longitude: number, latitude: number) => void;
  onDirectionChange: (id: string, direction: number) => void;
}

/* Render a preview canvas for a single symbol type in the drag palette.
   Canvas is drawn at 2x resolution to stay crisp on Retina/HiDPI displays. */
const PREVIEW_SIZE = 44;
const PREVIEW_RES = PREVIEW_SIZE * 2;

const SymbolPreview = ({ type }: { type: SymbolType }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /* Draw the icon from the shared atlas onto the high-res canvas */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const atlas = buildIconAtlas();
    const mapping = ICON_MAPPING[type];
    ctx.clearRect(0, 0, PREVIEW_RES, PREVIEW_RES);
    ctx.drawImage(
      atlas,
      mapping.x, mapping.y, mapping.width, mapping.height,
      0, 0, PREVIEW_RES, PREVIEW_RES
    );
  }, [type]);

  return <canvas ref={canvasRef} width={PREVIEW_RES} height={PREVIEW_RES} className="symbols__preview" />;
};

/* Group definition for the placed symbols list */
interface SymbolGroup {
  category: string;
  color: string;
  items: MapSymbol[];
}

/* Sidebar tab showing draggable symbol palette and list of placed symbols */
const Symbols = ({ symbols, symbolSize, onSymbolSizeChange, selectedSymbolId, onSelectSymbol, onDelete, onFlyTo, onDirectionChange }: SymbolsProps) => {
  /* Set the symbol type in dataTransfer and use the icon as the drag image */
  const handleDragStart = (e: React.DragEvent, type: SymbolType) => {
    e.dataTransfer.setData("symbolType", type);
    e.dataTransfer.effectAllowed = "copy";

    /* Render just the icon as the drag image instead of the whole card.
       The canvas must be in the DOM (off-screen) for browsers to capture it. */
    const atlas = buildIconAtlas();
    const mapping = ICON_MAPPING[type];
    const dragCanvas = document.createElement("canvas");
    dragCanvas.width = 48;
    dragCanvas.height = 48;
    dragCanvas.style.position = "fixed";
    dragCanvas.style.left = "-9999px";
    dragCanvas.style.top = "-9999px";
    document.body.appendChild(dragCanvas);
    const dctx = dragCanvas.getContext("2d")!;
    dctx.drawImage(atlas, mapping.x, mapping.y, mapping.width, mapping.height, 0, 0, 48, 48);
    e.dataTransfer.setDragImage(dragCanvas, 24, 24);

    /* Clean up the temporary canvas after the browser captures it */
    requestAnimationFrame(() => document.body.removeChild(dragCanvas));
  };

  /* Select a symbol and fly to it on the map */
  const handleRowClick = (sym: MapSymbol) => {
    onSelectSymbol(sym.id === selectedSymbolId ? null : sym.id);
    onFlyTo(sym.longitude, sym.latitude);
  };

  /* Group placed symbols by category (Base Station / Repeater) */
  const groupedSymbols = useMemo((): SymbolGroup[] => {
    const groups: SymbolGroup[] = [];
    const seen = new Set<string>();

    for (const def of SYMBOL_TYPES) {
      if (seen.has(def.category)) continue;
      seen.add(def.category);

      /* Collect all items belonging to this category */
      const categoryTypes = SYMBOL_TYPES
        .filter((d) => d.category === def.category)
        .map((d) => d.type);

      const items = symbols.filter((s) => categoryTypes.includes(s.type as SymbolType));
      if (items.length > 0) {
        groups.push({ category: def.category, color: def.color, items });
      }
    }
    return groups;
  }, [symbols]);

  /* Look up a readable sub-label for a symbol (e.g. "Omni" or "Directional") */
  const subLabel = (sym: MapSymbol): string => {
    if (sym.type === "repeater-omni") return "Omni";
    if (sym.type === "repeater-directional") return "Directional";
    return "";
  };

  return (
    <div className="symbols" onClick={() => onSelectSymbol(null)}>
      {/* Draggable icon palette */}
      <span className="symbols__label">Drag to Place</span>
      <div className="symbols__palette">
        {SYMBOL_TYPES.map((def) => (
          <div
            key={def.type}
            className="symbols__card"
            draggable
            onDragStart={(e) => handleDragStart(e, def.type)}
            title={`Drag to place a ${def.label}`}
          >
            <SymbolPreview type={def.type} />
            <span className="symbols__card-label">
              {def.label.split("\n").map((line, i) => (
                <span key={i}>{line}</span>
              ))}
            </span>
          </div>
        ))}
      </div>

      {/* Size slider */}
      <div className="symbols__size">
        <div className="symbols__size-header">
          <span className="symbols__size-name">Size</span>
          <span className="symbols__size-value">{symbolSize}px</span>
        </div>
        <input
          type="range"
          className="symbols__size-slider"
          min={24}
          max={96}
          step={4}
          value={symbolSize}
          onChange={(e) => onSymbolSizeChange(Number(e.target.value))}
        />
      </div>

      {/* List of placed symbols grouped by category */}
      <span className="symbols__label">
        Placed ({symbols.length})
      </span>

      {symbols.length === 0 ? (
        <span className="symbols__empty">No symbols placed yet</span>
      ) : (
        <div className="symbols__list">
          {groupedSymbols.map((group) => (
            <div key={group.category} className="symbols__group">
              <span className="symbols__group-title" style={{ color: group.color }}>
                {group.category} ({group.items.length})
              </span>
              {group.items.map((sym) => (
                <div key={sym.id} className="symbols__item-wrapper">
                  <div
                    className={`symbols__item ${sym.id === selectedSymbolId ? "symbols__item--selected" : ""}`}
                    onClick={(e) => { e.stopPropagation(); handleRowClick(sym); }}
                  >
                    <button
                      className="symbols__fly-btn"
                      onClick={(e) => { e.stopPropagation(); onFlyTo(sym.longitude, sym.latitude); }}
                      title="Fly to symbol"
                    >
                      <Navigation size={12} />
                    </button>
                    <span className="symbols__item-label">
                      {sym.label || group.category}
                      {subLabel(sym) && (
                        <span className="symbols__item-sub"> — {subLabel(sym)}</span>
                      )}
                    </span>
                    <button
                      className="symbols__delete-btn"
                      onClick={(e) => { e.stopPropagation(); onDelete(sym.id); }}
                      title="Delete symbol"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>

                  {/* Direction slider — only for directional repeaters */}
                  {sym.type === "repeater-directional" && (
                    <div className="symbols__direction">
                      <input
                        type="range"
                        className="symbols__direction-slider"
                        min={0}
                        max={360}
                        step={5}
                        value={sym.direction ?? 0}
                        onChange={(e) => onDirectionChange(sym.id, Number(e.target.value))}
                      />
                      <span className="symbols__direction-value">
                        {sym.direction ?? 0}° {degreesToCompass(sym.direction ?? 0)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Symbols;
