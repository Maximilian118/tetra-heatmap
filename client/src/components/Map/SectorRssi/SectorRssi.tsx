import { useState, useRef, useEffect, useCallback } from "react";
import { X, Eraser, Check } from "lucide-react";
import type { KmlSectorRssi } from "../../../utils/api";
import { clampRssi, RSSI_MIN, RSSI_MAX } from "../../../utils/rssi";
import "./SectorRssi.scss";

/* Measured figures for one KML sector, taken before any manual override */
export interface SectorStat {
  name: string;
  measuredRssi: number | null;
  count: number;
}

interface SectorRssiProps {
  sectors: SectorStat[];
  manualRssi: KmlSectorRssi;
  focusSector: string | null;
  onSave: (values: KmlSectorRssi) => void;
  onClose: () => void;
}

/* Seed the editable draft from the stored values, one string entry per sector */
const toDraft = (sectors: SectorStat[], manualRssi: KmlSectorRssi): Record<string, string> => {
  const draft: Record<string, string> = {};
  for (const sector of sectors) {
    const stored = manualRssi[sector.name];
    draft[sector.name] = stored === undefined ? "" : String(stored);
  }
  return draft;
};

/* Normalise a typed entry into a usable dBm figure.
   A positive number is treated as a missing minus sign, since RSSI is never positive. */
const normaliseEntry = (raw: string): number | null => {
  const parsed = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(parsed)) return null;
  return clampRssi(parsed > 0 ? -parsed : parsed);
};

/* Full-area form for entering an RSSI value by hand against each sector of the loaded KML.
   A value entered here replaces that sector's measured median until it is cleared.
   focusSector is the sector clicked on the map, or null when opened from the sidebar. */
const SectorRssi = ({ sectors, manualRssi, focusSector, onSave, onClose }: SectorRssiProps) => {
  const [draft, setDraft] = useState<Record<string, string>>(() => toDraft(sectors, manualRssi));
  const focusRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  /* Start on the clicked sector, or on the first row when opened from the sidebar */
  const focusName = focusSector ?? sectors[0]?.name ?? null;

  /* Centre the starting sector in the list and put the caret in its field.
     The scroll is applied to the list element directly, and focus is taken with
     preventScroll: scrollIntoView() and a plain focus() both walk up and scroll
     every scrollable ancestor, which drags the whole app off-screen. */
  useEffect(() => {
    const input = focusRef.current;
    const body = bodyRef.current;
    if (!input) return;

    if (body) {
      const rowRect = (input.closest(".sector-rssi__row") ?? input).getBoundingClientRect();
      const offset = rowRect.top - body.getBoundingClientRect().top;
      body.scrollTop += offset - (body.clientHeight - rowRect.height) / 2;
    }

    input.focus({ preventScroll: true });
    input.select();
  }, []);

  /* Record a keystroke verbatim so partial entries like "-" or "-7" stay editable */
  const handleChange = useCallback((name: string, value: string) => {
    setDraft((prev) => ({ ...prev, [name]: value }));
  }, []);

  /* Tidy the entry once the field loses focus — fix a missing minus and clamp to range */
  const handleBlur = useCallback((name: string) => {
    setDraft((prev) => {
      const normalised = normaliseEntry(prev[name]);
      return { ...prev, [name]: normalised === null ? "" : String(normalised) };
    });
  }, []);

  /* Return a single sector to live data */
  const handleClearRow = useCallback((name: string) => {
    setDraft((prev) => ({ ...prev, [name]: "" }));
  }, []);

  /* Return every sector to live data */
  const handleClearAll = useCallback(() => {
    setDraft(toDraft(sectors, {}));
  }, [sectors]);

  /* Persist the entered values, dropping any field left blank or unparseable */
  const handleSave = useCallback(() => {
    const values: KmlSectorRssi = {};
    for (const sector of sectors) {
      const normalised = normaliseEntry(draft[sector.name] ?? "");
      if (normalised !== null) values[sector.name] = normalised;
    }
    onSave(values);
    onClose();
  }, [sectors, draft, onSave, onClose]);

  const entered = sectors.filter((s) => normaliseEntry(draft[s.name] ?? "") !== null).length;

  return (
    <div className="sector-rssi">
      <div className="sector-rssi__header">
        <h3 className="sector-rssi__title">Manual Sector RSSI</h3>
        <button className="sector-rssi__close" onClick={onClose} aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <p className="sector-rssi__hint">
        A value entered here replaces that sector's measured median. Clear a field to return
        the sector to live data. Accepted range {RSSI_MIN} to {RSSI_MAX} dBm.
      </p>

      <div className="sector-rssi__body" ref={bodyRef}>
        <div className="sector-rssi__columns">
          <span className="sector-rssi__col-name">Sector</span>
          <span className="sector-rssi__col-measured">Measured</span>
          <span className="sector-rssi__col-input">Manual (dBm)</span>
        </div>

        {sectors.map((sector) => (
          <div
            key={sector.name}
            className={`sector-rssi__row ${sector.name === focusSector ? "sector-rssi__row--focused" : ""}`}
          >
            <span className="sector-rssi__name">{sector.name}</span>

            <span className="sector-rssi__measured">
              {sector.measuredRssi === null
                ? "No data"
                : `${Math.round(sector.measuredRssi)} dBm (${sector.count.toLocaleString()})`}
            </span>

            <input
              ref={sector.name === focusName ? focusRef : undefined}
              type="number"
              className="sector-rssi__input"
              placeholder="—"
              step={1}
              min={RSSI_MIN}
              max={RSSI_MAX}
              value={draft[sector.name] ?? ""}
              onChange={(e) => handleChange(sector.name, e.target.value)}
              onBlur={() => handleBlur(sector.name)}
            />

            <button
              className="sector-rssi__clear"
              onClick={() => handleClearRow(sector.name)}
              disabled={(draft[sector.name] ?? "") === ""}
              aria-label={`Clear ${sector.name}`}
              title="Return this sector to live data"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="sector-rssi__footer">
        <span className="sector-rssi__count">
          {entered} of {sectors.length} sectors set manually
        </span>

        <div className="sector-rssi__actions">
          <button
            className="sector-rssi__btn sector-rssi__btn--clear"
            onClick={handleClearAll}
            disabled={entered === 0}
          >
            <Eraser size={14} />
            Clear All
          </button>
          <button className="sector-rssi__btn sector-rssi__btn--cancel" onClick={onClose}>
            <X size={14} />
            Cancel
          </button>
          <button className="sector-rssi__btn sector-rssi__btn--save" onClick={handleSave}>
            <Check size={14} />
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default SectorRssi;
