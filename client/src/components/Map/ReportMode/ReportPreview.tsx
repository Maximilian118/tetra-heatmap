import { useState, useRef, useCallback, useMemo } from "react";
import DeckGL from "@deck.gl/react";
import { Map as MapGL } from "react-map-gl/mapbox";
import { Download, X } from "lucide-react";
import type { CustomSpectrum } from "../../../utils/rssi";
import type { MapSymbol } from "../../../utils/api";
import { captureReportPdf } from "../../../utils/reportCapture";
import ReportBanner from "./ReportBanner";
import ReportLegend from "./ReportLegend";
import "./ReportPreview.scss";

interface ReportPreviewProps {
  createLayers: () => unknown[];
  mapboxToken: string;
  mapStyle: string;
  initialViewState: { longitude: number; latitude: number; zoom: number; bearing: number; pitch: number };
  customSpectrum: CustomSpectrum;
  symbols: MapSymbol[];
  onClose: () => void;
}

/* Report preview modal with its own DeckGL + MapGL instance.
   The user can pan/zoom/rotate this map independently.
   What you see here is exactly what gets exported to PDF. */
const ReportPreview = ({ createLayers, mapboxToken, mapStyle, initialViewState, customSpectrum, symbols, onClose }: ReportPreviewProps) => {
  const [title, setTitle] = useState("RSSI Coverage Report");
  const [saving, setSaving] = useState(false);
  const [viewState, setViewState] = useState(initialViewState);
  const captureRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deckRef = useRef<any>(null);

  /* Build independent layer instances for this preview's DeckGL */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reportLayers = useMemo(() => createLayers() as any[], [createLayers]);

  /* Snapshot this preview's map canvases, insert as static image, then capture as PDF */
  const handleSave = useCallback(async () => {
    if (!captureRef.current) return;
    setSaving(true);
    try {
      /* Get this preview's own canvases */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const deckCanvas = (deckRef.current as any)?.deck?.getCanvas() as HTMLCanvasElement | undefined;
      const mapboxCanvas = captureRef.current.querySelector(".mapboxgl-canvas") as HTMLCanvasElement | undefined;
      if (!deckCanvas || !mapboxCanvas) return;

      /* Composite into a single screenshot */
      const offscreen = document.createElement("canvas");
      offscreen.width = deckCanvas.width;
      offscreen.height = deckCanvas.height;
      const ctx = offscreen.getContext("2d")!;
      ctx.drawImage(mapboxCanvas, 0, 0);
      ctx.drawImage(deckCanvas, 0, 0);
      const mapDataUrl = offscreen.toDataURL("image/png");

      /* Insert a temporary static image into the map area */
      const mapArea = captureRef.current.querySelector(".report-preview__map") as HTMLElement;
      const img = document.createElement("img");
      img.className = "report-preview__img";
      img.src = mapDataUrl;

      /* Hide the live canvases so html2canvas only sees the static image */
      const deckContainer = mapArea.querySelector(".report-preview__deck") as HTMLElement;
      if (deckContainer) deckContainer.style.visibility = "hidden";
      mapArea.appendChild(img);

      /* Wait for the image to load */
      await new Promise<void>((resolve) => {
        if (img.complete) resolve();
        else img.onload = () => resolve();
      });

      await captureReportPdf(captureRef.current, title);

      /* Restore */
      img.remove();
      if (deckContainer) deckContainer.style.visibility = "";
    } finally {
      setSaving(false);
    }
  }, [title]);

  return (
    <div className="report-preview">
      {/* Dark backdrop — blocks interaction with the main map behind */}
      <div className="report-preview__backdrop" />

      {/* Centred A4 frame with its own interactive map */}
      <div className="report-preview__frame" ref={captureRef}>
        <ReportBanner title={title} onTitleChange={setTitle} />

        {/* Map area with a dedicated DeckGL + MapGL instance */}
        <div className="report-preview__map">
          <div className="report-preview__deck">
            <DeckGL
              ref={deckRef}
              viewState={viewState}
              controller
              layers={reportLayers}
              onViewStateChange={({ viewState: vs }) => setViewState(vs as typeof viewState)}
              getCursor={({ isHovering }) => isHovering ? "pointer" : "grab"}
            >
              <MapGL
                mapboxAccessToken={mapboxToken}
                mapStyle={mapStyle}
                preserveDrawingBuffer
              />
            </DeckGL>
          </div>

          {/* North arrow */}
          <div className="report-preview__north" onClick={() => setViewState((v) => ({ ...v, bearing: 0 }))} style={{ cursor: Math.abs(viewState.bearing ?? 0) > 0.5 ? "pointer" : "default" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" style={{ transform: `rotate(${-(viewState.bearing ?? 0)}deg)`, transition: "transform 0.3s ease" }}>
              <polygon points="12,2 8,14 12,12" fill="#e05050" />
              <polygon points="12,2 16,14 12,12" fill="#ffffff" />
              <polygon points="12,22 8,14 12,12" fill="rgba(255,255,255,0.35)" />
              <polygon points="12,22 16,14 12,12" fill="rgba(255,255,255,0.15)" />
            </svg>
          </div>

          {/* Legend */}
          <ReportLegend
            customSpectrum={customSpectrum}
            symbols={symbols}
            zoom={viewState.zoom ?? 14}
            latitude={viewState.latitude ?? 0}
          />
        </div>
      </div>

      {/* Action buttons below the frame */}
      <div className="report-preview__actions">
        <button className="report-preview__btn" onClick={onClose} disabled={saving}>
          <X size={14} />
          Cancel
        </button>
        <button className="report-preview__btn report-preview__btn--accent" onClick={handleSave} disabled={saving}>
          <Download size={14} />
          {saving ? "Saving..." : "Save PDF"}
        </button>
      </div>
    </div>
  );
};

export default ReportPreview;
