import { useState, useEffect, useMemo, useCallback } from "react";
import {
  fetchSubscribers,
  importSubscribers,
  clearSubscribers,
  backfillSubscriberLocations,
  type Subscriber,
} from "../../../utils/api";
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
}

/* Format a "ID - Description" display string, showing em dash when data is unknown */
const formatIdDesc = (id: number | null, desc: string): string => {
  if (!id && !desc) return "—";
  if (!id) return desc;
  if (!desc) return String(id);
  return `${id} - ${desc}`;
};

/* Format the Last Reading cell: timestamp with optional location suffix */
const formatLastReading = (iso: string | null, location: string | null): string => {
  if (!iso) return "—";
  const ts = new Date(iso).toLocaleString();
  return location ? `${ts} - ${location}` : ts;
};

/* Full-screen overlay displaying the SSI Register table with search, import, and filtering */
const SsiRegister = ({ onClose, dbConnected, selectedSsis, onToggleSsi, onResetFilter, fileSubscribers, isFileMode }: SsiRegisterProps) => {
  const [liveSubscribers, setLiveSubscribers] = useState<Subscriber[]>([]);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

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
      await importSubscribers();
      await loadSubscribers();
    } catch (err) {
      console.error("[ssi-register] Import failed:", err);
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
          ✕
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
              onClick={handleImport}
              disabled={!dbConnected || importing}
            >
              {importing ? "Importing..." : "Import"}
            </button>

            <button
              className="ssi-register__btn--clear"
              onClick={handleClear}
              disabled={clearing}
            >
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
                <td className="ssi-register__cell--ellipsis">{s.description || "—"}</td>
                <td className="ssi-register__cell--ellipsis">
                  {formatIdDesc(s.organisation_id, s.organisation)}
                </td>
                <td className="ssi-register__cell--ellipsis">
                  {formatIdDesc(s.profile_id, s.profile_name)}
                </td>
                <td>{s.readings_count || "—"}</td>
                <td
                  className="ssi-register__cell--ellipsis"
                  title={formatLastReading(s.last_reading, s.last_location)}
                >
                  {formatLastReading(s.last_reading, s.last_location)}
                </td>
              </tr>
            ))}
            {filteredSubscribers.length === 0 && (
              <tr>
                <td colSpan={6} className="ssi-register__empty">
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
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
          <text x="10" y="14.5" textAnchor="middle" fill="currentColor" fontSize="12" fontWeight="600" fontFamily="serif">i</text>
        </svg>
      </button>

      {/* Info overlay — explains the SSI Register in detail */}
      {showInfo && (
        <div className="ssi-register__info">
          <button
            className="ssi-register__close"
            onClick={() => setShowInfo(false)}
            aria-label="Close info panel"
          >
            ✕
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
