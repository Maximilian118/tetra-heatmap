import { useState, useEffect, useMemo, useCallback } from "react";
import { X, Info, RotateCcw, Download, Trash2, CircleCheck, CircleX, ChevronUp } from "lucide-react";
import {
  fetchSubscribers,
  importSubscribers,
  clearSubscribers,
  backfillSubscriberLocations,
  type Subscriber,
} from "../../../utils/api";
import { formatServerTime, formatTzLabel, formatAccuracy } from "../../../utils/format";
import Confirm from "../Confirm/Confirm";
import "./SsiRegister.scss";

/* Tooltip state for the accuracy/rejection breakdown popover */
interface BreakdownTooltip {
  x: number;
  y: number;
  type: "accepted" | "rejected";
  lines: { label: string; count: number }[];
}

/* Human-readable labels for each LIP rejection reason */
const REJECT_LABELS: Record<string, string> = {
  low_accuracy: "Low accuracy",
  out_of_range: "Out of range",
};

/* Threshold for showing 0-reading rows when searching */
const SEARCH_SHOW_ALL_THRESHOLD = 50;

/* Sortable column identifiers */
type SortColumn = "ssi" | "description" | "organisation" | "profile" | "readings" | "lastReading";

interface SsiRegisterProps {
  onClose: () => void;
  dbConnected: boolean;
  selectedSsis: Set<number>;
  onToggleSsi: (ssi: number) => void;
  onResetFilter: () => void;
  fileSubscribers: Subscriber[] | null;
  isFileMode: boolean;
  clockOffsetMs: number;
  serverTzOffsetHours: number;
}

/* Format a "ID - Description" display string, showing em dash when data is unknown */
const formatIdDesc = (id: number | null, desc: string): string => {
  if (!id && !desc) return "—";
  if (!id) return desc;
  if (!desc) return String(id);
  return `${id} - ${desc}`;
};

/* Format the Last Reading cell: server-timezone timestamp with optional location suffix */
const formatLastReading = (
  iso: string | null, location: string | null,
  clockOffsetMs: number, serverTzOffsetHours: number,
): string => {
  if (!iso) return "—";
  const ts = `${formatServerTime(iso, clockOffsetMs, serverTzOffsetHours)} ${formatTzLabel(serverTzOffsetHours)}`;
  return location ? `${ts} - ${location}` : ts;
};

/* Full-screen overlay displaying the SSI Register table with search, import, and filtering */
const SsiRegister = ({ onClose, dbConnected, selectedSsis, onToggleSsi, onResetFilter, fileSubscribers, isFileMode, clockOffsetMs, serverTzOffsetHours }: SsiRegisterProps) => {
  const [liveSubscribers, setLiveSubscribers] = useState<Subscriber[]>([]);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmingImport, setConfirmingImport] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null);
  const [breakdownTooltip, setBreakdownTooltip] = useState<BreakdownTooltip | null>(null);
  const [sortColumn, setSortColumn] = useState<SortColumn>("readings");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  /* Use file subscribers when viewing a saved snapshot, otherwise live data */
  const subscribers = fileSubscribers ?? liveSubscribers;

  /* Fetch subscribers from the API */
  const loadSubscribers = useCallback(async () => {
    try {
      const data = await fetchSubscribers();
      setLiveSubscribers(data);
    } catch (err) {
      console.error("[ssi-register] Failed to fetch subscribers:", err);
    }
  }, []);

  /* Load live subscribers on mount, then backfill any missing location data */
  useEffect(() => {
    if (fileSubscribers) return;
    loadSubscribers().then(() => {
      backfillSubscriberLocations()
        .then(({ updated }) => {
          if (updated > 0) loadSubscribers();
        })
        .catch(() => { /* backfill failed — locations stay empty */ });
    });
  }, [loadSubscribers, fileSubscribers]);

  /* Import the full SSI Register from the remote LogServer */
  const handleImport = async () => {
    setImporting(true);
    try {
      const result = await importSubscribers();
      if (result.success) {
        await loadSubscribers();
        setImportResult({ success: true, message: `Successfully imported ${result.imported} subscribers.` });
      } else {
        setImportResult({ success: false, message: result.error ?? "Unknown error" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setImportResult({ success: false, message });
    } finally {
      setImporting(false);
    }
  };

  /* Clear all local subscriber data */
  const handleClear = async () => {
    setClearing(true);
    try {
      await clearSubscribers();
      await loadSubscribers();
    } catch (err) {
      console.error("[ssi-register] Clear failed:", err);
    } finally {
      setClearing(false);
    }
  };

  /* Filter subscribers based on search term and showAll toggle */
  const filteredSubscribers = useMemo(() => {
    const term = search.trim().toLowerCase();

    /* Match a subscriber against the search term */
    const matchesTerm = (s: Subscriber) => {
      if (!term) return true;
      return (
        String(s.ssi).includes(term) ||
        s.description.toLowerCase().includes(term) ||
        s.organisation.toLowerCase().includes(term) ||
        String(s.profile_id ?? "").includes(term) ||
        s.profile_name.toLowerCase().includes(term) ||
        (s.last_location ?? "").toLowerCase().includes(term)
      );
    };

    if (showAll) {
      /* Show All checked — display everything, still apply search */
      return term ? subscribers.filter(matchesTerm) : subscribers;
    }

    if (!term) {
      /* No search, Show All off — only show rows with readings */
      return subscribers.filter((s) => s.readings_count > 0);
    }

    /* Searching with Show All off — show matching rows with readings first,
       then include 0-reading matches if the result set is small enough */
    const withReadings = subscribers.filter(
      (s) => matchesTerm(s) && s.readings_count > 0
    );

    if (withReadings.length >= SEARCH_SHOW_ALL_THRESHOLD) return withReadings;

    const withoutReadings = subscribers.filter(
      (s) => matchesTerm(s) && s.readings_count === 0
    );

    return [...withReadings, ...withoutReadings];
  }, [subscribers, search, showAll]);

  /* Toggle sort column or reverse direction if already active */
  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection("desc");
    }
  };

  /* Sort the filtered list by the active column and direction */
  const sortedSubscribers = useMemo(() => {
    const dir = sortDirection === "asc" ? 1 : -1;

    return [...filteredSubscribers].sort((a, b) => {
      switch (sortColumn) {
        case "ssi":
          return (a.ssi - b.ssi) * dir;
        case "description":
          return a.description.localeCompare(b.description) * dir;
        case "organisation":
          return formatIdDesc(a.organisation_id, a.organisation)
            .localeCompare(formatIdDesc(b.organisation_id, b.organisation)) * dir;
        case "profile":
          return formatIdDesc(a.profile_id, a.profile_name)
            .localeCompare(formatIdDesc(b.profile_id, b.profile_name)) * dir;
        case "readings":
          return (a.readings_count - b.readings_count) * dir;
        case "lastReading": {
          const aVal = a.last_reading ?? "";
          const bVal = b.last_reading ?? "";
          if (!aVal && !bVal) return 0;
          if (!aVal) return 1;
          if (!bVal) return -1;
          return aVal.localeCompare(bVal) * dir;
        }
        default:
          return 0;
      }
    });
  }, [filteredSubscribers, sortColumn, sortDirection]);

  /* Show a tooltip with accuracy or rejection breakdown for a subscriber */
  const showBreakdown = (e: React.MouseEvent, s: Subscriber, type: "accepted" | "rejected") => {
    const lines: { label: string; count: number }[] = [];

    if (type === "accepted" && s.accuracy_breakdown) {
      /* Sort accuracy levels ascending (2, 20, 200, 2000) */
      const sorted = Object.entries(s.accuracy_breakdown)
        .map(([m, cnt]) => ({ metres: Number(m), count: cnt }))
        .sort((a, b) => a.metres - b.metres);
      for (const { metres, count } of sorted) {
        lines.push({ label: formatAccuracy(metres), count });
      }
    } else if (type === "rejected" && s.rejection_breakdown) {
      for (const [reason, count] of Object.entries(s.rejection_breakdown)) {
        lines.push({ label: REJECT_LABELS[reason] ?? reason, count });
      }
    }

    if (lines.length === 0) return;
    setBreakdownTooltip({ x: e.clientX + 12, y: e.clientY - 12, type, lines });
  };

  const hideBreakdown = () => setBreakdownTooltip(null);

  const hasSelection = selectedSsis.size > 0;

  /* Build row class name based on selection and readings state */
  const rowClassName = (s: Subscriber): string => {
    const classes: string[] = [];
    if (selectedSsis.has(s.ssi)) classes.push("ssi-register__row--selected");
    if (s.readings_count === 0) classes.push("ssi-register__row--dim");
    return classes.join(" ");
  };

  return (
    <div className="ssi-register">
      {/* Toolbar */}
      <div className="ssi-register__toolbar">
        <button className="ssi-register__close" onClick={onClose} aria-label="Close SSI Register">
          <X size={18} />
        </button>

        <input
          className="ssi-register__search"
          type="text"
          placeholder="Search ISSI, description, org, profile..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <label className="ssi-register__checkbox">
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
          />
          Show All
        </label>

        {/* Spacer pushes action buttons to the far right */}
        <div className="ssi-register__spacer" />

        {/* Reset filter — only visible when ISSIs are selected */}
        {hasSelection && (
          <button className="ssi-register__btn--reset" onClick={onResetFilter}>
            <RotateCcw size={14} />
            Reset
          </button>
        )}

        {/* In file mode show a snapshot notice; in live mode show Import/Clear */}
        {isFileMode ? (
          <span className="ssi-register__snapshot-notice">
            Viewing saved snapshot
          </span>
        ) : (
          <>
            <button
              className="ssi-register__btn--import"
              onClick={() => setConfirmingImport(true)}
              disabled={!dbConnected || importing}
            >
              <Download size={14} />
              {importing ? "Importing..." : "Import"}
            </button>

            <button
              className="ssi-register__btn--clear"
              onClick={() => setConfirmingClear(true)}
              disabled={clearing}
            >
              <Trash2 size={14} />
              {clearing ? "Clearing..." : "Clear"}
            </button>
          </>
        )}
      </div>

      {/* Subscriber table */}
      <div className="ssi-register__table-wrap">
        <table className="ssi-register__table">
          <thead>
            <tr>
              {([
                ["ssi", "ISSI"],
                ["description", "Description"],
                ["organisation", "Organisation"],
                ["profile", "Profile"],
                ["readings", "Readings"],
                ["lastReading", "Last Reading"],
              ] as [SortColumn, string][]).map(([col, label]) => (
                <th key={col} onClick={() => handleSort(col)}>
                  <span className="ssi-register__th-content">
                    {label}
                    <ChevronUp
                      size={14}
                      className={`ssi-register__sort-icon${
                        sortColumn === col ? " ssi-register__sort-icon--active" : ""
                      }${sortColumn === col && sortDirection === "asc" ? " ssi-register__sort-icon--asc" : ""}`}
                    />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedSubscribers.map((s) => (
              <tr
                key={s.ssi}
                className={rowClassName(s)}
                onClick={() => onToggleSsi(s.ssi)}
              >
                <td>{s.ssi}</td>
                <td>{s.description || "—"}</td>
                <td>{formatIdDesc(s.organisation_id, s.organisation)}</td>
                <td>{formatIdDesc(s.profile_id, s.profile_name)}</td>
                <td className="ssi-register__readings">
                  {s.readings_count > 0 ? (
                    <span
                      className="ssi-register__accepted"
                      onMouseEnter={(e) => showBreakdown(e, s, "accepted")}
                      onMouseLeave={hideBreakdown}
                    >
                      {s.readings_count}
                    </span>
                  ) : "—"}
                  {s.rejected_count > 0 && (
                    <span
                      className="ssi-register__rejected"
                      onMouseEnter={(e) => showBreakdown(e, s, "rejected")}
                      onMouseLeave={hideBreakdown}
                    >
                      {s.rejected_count}
                    </span>
                  )}
                </td>
                <td title={formatLastReading(s.last_reading, s.last_location, clockOffsetMs, serverTzOffsetHours)}>
                  {formatLastReading(s.last_reading, s.last_location, clockOffsetMs, serverTzOffsetHours)}
                </td>
              </tr>
            ))}
            {sortedSubscribers.length === 0 && (
              <tr>
                {/* colSpan 99 is clamped by the browser to the actual visible column count */}
              <td colSpan={99} className="ssi-register__empty">
                  {subscribers.length === 0
                    ? "No subscribers — use Import or wait for readings"
                    : "No matching subscribers"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Info button — fixed to the bottom-right corner */}
      <button
        className="ssi-register__info-btn"
        onClick={() => setShowInfo(true)}
        aria-label="About SSI Register"
      >
        <Info size={20} />
      </button>

      {/* Confirm overlay for Import action */}
      {confirmingImport && (
        <Confirm
          title="Import Subscribers"
          message="This will pull all subscriber metadata from the remote TetraFlex LogServer. Any missing ISSIs will be added to the local register and existing subscriber data will be updated."
          confirmLabel="Import"
          confirmIcon={Download}
          variant="overlay"
          confirmColor="blue"
          onConfirm={() => { setConfirmingImport(false); handleImport(); }}
          onCancel={() => setConfirmingImport(false)}
        />
      )}

      {/* Import result notice */}
      {importResult && (
        <Confirm
          title={importResult.success ? "Import Succeeded" : "Import Failed"}
          message={importResult.message}
          confirmIcon={importResult.success ? CircleCheck : CircleX}
          variant="overlay"
          onCancel={() => setImportResult(null)}
        />
      )}

      {/* Confirm overlay for Clear action */}
      {confirmingClear && (
        <Confirm
          title="Clear Subscribers"
          message="This will remove all subscriber metadata from the local database. Reading data and heatmap points are not affected. You can re-import at any time to restore subscriber information."
          confirmLabel="Clear"
          confirmIcon={Trash2}
          variant="overlay"
          onConfirm={() => { setConfirmingClear(false); handleClear(); }}
          onCancel={() => setConfirmingClear(false)}
        />
      )}

      {/* Accuracy / rejection breakdown tooltip */}
      {breakdownTooltip && (
        <div
          className="ssi-register__breakdown-tooltip"
          style={{ left: breakdownTooltip.x, top: breakdownTooltip.y }}
        >
          <div className={`ssi-register__breakdown-header ssi-register__breakdown-header--${breakdownTooltip.type}`}>
            {breakdownTooltip.type === "accepted" ? "Accepted" : "Rejected"}
          </div>
          {breakdownTooltip.lines.map((line, i) => (
            <div key={i}><strong>{line.label}:</strong> {line.count}</div>
          ))}
        </div>
      )}

      {/* Info overlay — explains the SSI Register in detail */}
      {showInfo && (
        <div className="ssi-register__info">
          <button
            className="ssi-register__close"
            onClick={() => setShowInfo(false)}
            aria-label="Close info panel"
          >
            <X size={18} />
          </button>

          <div className="ssi-register__info-content">
            <h2>SSI Register</h2>

            <p>
              The SSI Register is a directory of all TETRA Individual Short Subscriber
              Identities (ISSIs) known to this system. It combines subscriber metadata
              imported from the TetraFlex LogServer with live reading statistics collected
              automatically by the sync service.
            </p>

            <h3>Columns</h3>
            <dl>
              <dt>ISSI</dt>
              <dd>The unique Individual Short Subscriber Identity number assigned to each radio terminal.</dd>

              <dt>Description</dt>
              <dd>A human-readable name or label for the subscriber, as configured in the TetraFlex CPS.</dd>

              <dt>Organisation</dt>
              <dd>The organisation the subscriber belongs to, shown as "ID - Name".</dd>

              <dt>Profile</dt>
              <dd>The subscriber's TetraFlex profile, controlling permissions and features.</dd>

              <dt>Readings</dt>
              <dd>
                The number of accepted readings (green) and rejected readings (red) for this ISSI.
                Hover over each count to see a breakdown — accepted readings show accuracy levels,
                rejected readings show the rejection reason.
              </dd>

              <dt>Last Reading</dt>
              <dd>
                The timestamp and reverse-geocoded location of the most recent GPS reading
                from this ISSI, e.g. "28/03/2026, 21:30:15 - Suzuka, Japan". Location data
                is computed automatically from GPS coordinates and updates each sync cycle.
              </dd>
            </dl>

            <h3>Getting Data In</h3>
            <p>
              <strong>Import</strong> pulls subscriber metadata (descriptions, organisations, profiles)
              from the remote TetraFlex LogServer. This is a manual, one-time action — use it when
              subscribers are first set up or when changes are made in the CPS.
            </p>
            <p>
              <strong>Reading statistics and location data update automatically.</strong> The sync
              service polls the LogServer for new LIP messages at a configured interval. As new
              readings arrive, the readings count, last reading timestamp, and location are kept
              up to date without any manual action.
            </p>

            <h3>Filtering the Map</h3>
            <p>
              Click any row to select that ISSI — the map will filter to show only readings from
              selected ISSIs. Click again to deselect. Use the <strong>Reset</strong> button to
              clear all selections and show all readings on the map.
            </p>

            <h3>Search</h3>
            <p>
              Use the search bar to filter by ISSI number, description, organisation, profile, or
              location name. Enable <strong>Show All</strong> to include subscribers with zero
              readings in the results.
            </p>

            <h3>Clear</h3>
            <p>
              The <strong>Clear</strong> button removes all subscriber metadata from the local
              database. Reading data is not affected. Re-import to restore subscriber information.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SsiRegister;
