/* Base URL for all API requests — proxied to Express by Vite in dev */
const API_BASE = "/api";

/* Shape of a single RSSI reading returned by the server */
export interface Reading {
  id: number;
  timestamp: string;
  ssi: number;
  rssi: number | null;
  ms_distance: number | null;
  latitude: number;
  longitude: number;
  position_error: number | null;
  velocity: number | null;
  direction: number | null;
}

/* Fetch all cached RSSI readings from the local database */
export const fetchReadings = async (): Promise<Reading[]> => {
  const res = await fetch(`${API_BASE}/rssi`);
  return res.json();
};

/* Clear the local RSSI cache and start collecting fresh data from now */
export const resetCache = async (): Promise<{ success: boolean; syncFrom: string }> => {
  const res = await fetch(`${API_BASE}/rssi/reset`, { method: "POST" });
  return res.json();
};
