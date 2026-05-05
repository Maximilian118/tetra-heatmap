import { useState, useEffect } from "react";
import { fetchSettings } from "../../../utils/api";

/* Fetch server settings on mount — Mapbox token, DB status, retention config */
export const useServerSettings = (onInitialSymbolSize: (size: number) => void) => {
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [dbConnected, setDbConnected] = useState(false);
  const [retentionDays, setRetentionDays] = useState(5);

  /* Fetch the Mapbox token and DB connection status from server settings on mount */
  useEffect(() => {
    fetchSettings()
      .then((s) => {
        setMapboxToken(s.mapboxToken || "");
        setDbConnected(s.dbHost.trim() !== "" && s.dbUser.trim() !== "");
        if (s.retentionDays > 0) setRetentionDays(s.retentionDays);
        if (s.symbolSize > 0) onInitialSymbolSize(s.symbolSize);
      })
      .catch((err) => console.error("[map] Failed to fetch settings:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { mapboxToken, dbConnected, retentionDays };
};
