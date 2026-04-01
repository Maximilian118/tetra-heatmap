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

/* Shape of database and sync settings */
export interface Settings {
  dbHost: string;
  dbPort: number;
  dbUser: string;
  dbPassword: string;
  dbName: string;
  syncIntervalMs: number;
  syncBatchSize: number;
  retentionDays: number;
}

/* Response from the connection test endpoint */
export interface ConnectionTestResult {
  connected: boolean;
  error: string | null;
}

/* Response from the POST settings endpoint after saving and testing connection */
export interface SettingsResponse {
  success: boolean;
  connected: boolean;
  connectionError: string | null;
  errors?: string[];
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

/* Fetch current database settings from the server (password is masked) */
export const fetchSettings = async (): Promise<Settings> => {
  const res = await fetch(`${API_BASE}/settings`);
  return res.json();
};

/* Test the connection using the currently saved settings */
export const testDbConnection = async (): Promise<ConnectionTestResult> => {
  const res = await fetch(`${API_BASE}/settings/test`, { method: "POST" });
  return res.json();
};

/* Save new settings, test connection, and restart sync service */
export const saveSettings = async (settings: Settings): Promise<SettingsResponse> => {
  const res = await fetch(`${API_BASE}/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  return res.json();
};
