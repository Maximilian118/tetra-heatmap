import { useState, useEffect, useMemo, useCallback } from "react";
import { X, Info, RotateCcw, Download, Trash2, CircleCheck, CircleX } from "lucide-react";
import {
  fetchSubscribers,
  importSubscribers,
  clearSubscribers,
  backfillSubscriberLocations,
  type Subscriber,
} from "../../../utils/api";
import { formatServerTime, formatTzLabel } from "../../../utils/format";
import Confirm from "../Confirm/Confirm";
import "./SsiRegister.scss";

/* Threshold for showing 0-reading rows when searching */
const SEARCH_SHOW_ALL_THRESHOLD = 50;


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
              <th>ISSI</th>
              <th>Description</th>
              <th>Organisation</th>
              <th>Profile</th>
              <th>Readings</th>
              <th>Last Reading</th>
            </tr>
          </thead>
          <tbody>
            {filteredSubscribers.map((s) => (
              <tr
                key={s.ssi}
                className={rowClassName(s)}
                onClick={() => onToggleSsi(s.ssi)}
              >
                <td>{s.ssi}</td>
                <td>{s.description || "—"}</td>
                <td>{formatIdDesc(s.organisation_id, s.organisation)}</td>
                <td>{formatIdDesc(s.profile_id, s.profile_name)}</td>
                <td>{s.readings_count || "—"}</td>
                <td title={formatLastReading(s.last_reading, s.last_location, clockOffsetMs, serverTzOffsetHours)}>
                  {formatLastReading(s.last_reading, s.last_location, clockOffsetMs, serverTzOffsetHours)}
                </td>
              </tr>
            ))}
            {filteredSubscribers.length === 0 && (
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
              <dd>The total number of RSSI readings received from this ISSI within the retention window.</dd>

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
