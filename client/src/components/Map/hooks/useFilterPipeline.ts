import { useState, useMemo, useCallback } from "react";
import type { Reading } from "../../../utils/api";

/* Manages the 5-stage reading filter chain: age → SSI → accuracy → valid RSSI.
   dataAgeMinutes is passed in from the orchestrator since it's also set by file-load logic. */
export const useFilterPipeline = (
  displayedReadings: Reading[],
  clockOffsetMs: number,
  dataAgeMinutes: number | null,
) => {
  const [selectedSsis, setSelectedSsis] = useState<Set<number>>(new Set());
  const [maxAccuracy, setMaxAccuracy] = useState(2);

  /* Filter readings by data age — adjusted for MySQL clock offset (disabled in file mode) */
  const ageFilteredReadings = useMemo(() => {
    if (dataAgeMinutes === null) return displayedReadings;
    const cutoffMs = dataAgeMinutes * 60_000;
    const threshold = (Date.now() - clockOffsetMs) - cutoffMs;
    return displayedReadings.filter((r) => new Date(r.timestamp).getTime() >= threshold);
  }, [displayedReadings, dataAgeMinutes, clockOffsetMs]);

  /* When ISSIs are selected in the SSI Register, only show their readings */
  const filteredReadings = useMemo(
    () => selectedSsis.size > 0
      ? ageFilteredReadings.filter((r) => selectedSsis.has(r.ssi))
      : ageFilteredReadings,
    [ageFilteredReadings, selectedSsis]
  );

  /* Filter by GPS accuracy — only show readings within the selected accuracy threshold */
  const accuracyFilteredReadings = useMemo(
    () => filteredReadings.filter((r) =>
      r.position_error !== null && r.position_error <= maxAccuracy
    ),
    [filteredReadings, maxAccuracy]
  );

  /* Filter out readings without a valid RSSI — they can't be visualised */
  const validReadings = useMemo(
    () => accuracyFilteredReadings.filter((r) => r.rssi !== null),
    [accuracyFilteredReadings]
  );

  /* Toggle a single SSI in the selection set */
  const handleToggleSsi = useCallback((ssi: number) => {
    setSelectedSsis((prev) => {
      const next = new Set(prev);
      if (next.has(ssi)) next.delete(ssi);
      else next.add(ssi);
      return next;
    });
  }, []);

  /* Clear all SSI selections — show all readings again */
  const handleResetSsiFilter = useCallback(() => {
    setSelectedSsis(new Set());
  }, []);

  return {
    validReadings,
    selectedSsis,
    maxAccuracy,
    setMaxAccuracy,
    handleToggleSsi,
    handleResetSsiFilter,
  };
};
