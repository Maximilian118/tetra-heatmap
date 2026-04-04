import { useState, useEffect, useMemo, useCallback } from "react";
import {
  fetchSubscribers,
  importSubscribers,
  clearSubscribers,
  type Subscriber,
} from "../../../utils/api";
import "./SsiRegister.scss";

/* Threshold for showing 0-reading rows when searching */
const SEARCH_SHOW_ALL_THRESHOLD = 50;

interface SsiRegisterProps {
  onClose: () => void;
  dbConnected: boolean;
}

/* Format a "ID - Description" display string, showing "-" when data is unknown */
const formatIdDesc = (id: number | null, desc: string): string => {
  if (!id && !desc) return "—";
  if (!id) return desc;
  if (!desc) return String(id);
  return `${id} - ${desc}`;
};

/* Format an ISO timestamp to a compact locale string, showing "-" when unknown */
const formatTimestamp = (iso: string | null): string => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
};

/* Full-screen overlay displaying the SSI Register table with search, import, and filtering */
const SsiRegister = ({ onClose, dbConnected }: SsiRegisterProps) => {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [importing, setImporting] = useState(false);
  const [clearing, setClearing] = useState(false);

  /* Fetch subscribers from the API */
  const loadSubscribers = useCallback(async () => {
    try {
      const data = await fetchSubscribers();
      setSubscribers(data);
    } catch (err) {
      console.error("[ssi-register] Failed to fetch subscribers:", err);
    }
  }, []);

  /* Load subscribers on mount */
  useEffect(() => {
    loadSubscribers();
  }, [loadSubscribers]);

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
        s.profile_name.toLowerCase().includes(term)
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

        {/* Spacer pushes Import and Clear to the far right */}
        <div className="ssi-register__spacer" />

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
              <tr key={s.ssi} className={s.readings_count === 0 ? "ssi-register__row--dim" : ""}>
                <td>{s.ssi}</td>
                <td className="ssi-register__cell--ellipsis">{s.description || "—"}</td>
                <td className="ssi-register__cell--ellipsis">
                  {formatIdDesc(s.organisation_id, s.organisation)}
                </td>
                <td className="ssi-register__cell--ellipsis">
                  {formatIdDesc(s.profile_id, s.profile_name)}
                </td>
                <td>{s.readings_count || "—"}</td>
                <td>{formatTimestamp(s.last_reading)}</td>
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
    </div>
  );
};

export default SsiRegister;
