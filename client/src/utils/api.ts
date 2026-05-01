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

/* Shape of database, sync, and Mapbox configuration */
export interface Settings {
  mapboxToken: string;
  dbHost: string;
  dbPort: number;
  dbUser: string;
  dbPassword: string;
  dbName: string;
  syncIntervalMs: number;
  syncBatchSize: number;
  retentionDays: number;
  symbolSize: number;
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

/* Assert that a fetch response is OK, throwing the status text on failure */
const assertOk = async (res: Response): Promise<Response> => {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res;
};

/* Response shape from the /rssi endpoint — readings plus clock/timezone metadata */
export interface RssiResponse {
  readings: Reading[];
  clockOffsetMs: number;
  serverTzOffsetHours: number;
}

/* Fetch all cached RSSI readings and server clock metadata */
export const fetchReadings = async (): Promise<RssiResponse> => {
  const res = await assertOk(await fetch(`${API_BASE}/rssi`));
  const data = await res.json();
  /* Support both the new object shape and a bare array (backward compat) */
  if (Array.isArray(data)) return { readings: data, clockOffsetMs: 0, serverTzOffsetHours: 0 };
  return data;
};

/* Clear the local RSSI cache and start collecting fresh data from now */
export const resetCache = async (): Promise<{ success: boolean; syncFrom: string }> => {
  const res = await assertOk(await fetch(`${API_BASE}/rssi/reset`, { method: "POST" }));
  return res.json();
};

/* Fetch current database settings from the server (password is masked) */
export const fetchSettings = async (): Promise<Settings> => {
  const res = await assertOk(await fetch(`${API_BASE}/settings`));
  return res.json();
};

/* Test the connection using the currently saved settings */
export const testDbConnection = async (): Promise<ConnectionTestResult> => {
  const res = await assertOk(await fetch(`${API_BASE}/settings/test`, { method: "POST" }));
  return res.json();
};

/* ── Subscriber API ────────────────────────────────────────────────── */

/* Shape of a subscriber row returned by the server */
export interface Subscriber {
  ssi: number;
  description: string;
  organisation_id: number | null;
  organisation: string;
  profile_id: number | null;
  profile_name: string;
  readings_count: number;
  rejected_count: number;
  last_reading: string | null;
  last_location: string | null;
  accuracy_breakdown: Record<number, number> | null;
  rejection_breakdown: Record<string, number> | null;
}

/* Fetch all subscribers with per-SSI reading statistics */
export const fetchSubscribers = async (): Promise<Subscriber[]> => {
  const res = await assertOk(await fetch(`${API_BASE}/subscribers`));
  return res.json();
};

/* Import the full SSI Register from the remote TetraFlex LogServer */
export const importSubscribers = async (): Promise<{
  success: boolean;
  imported?: number;
  error?: string;
}> => {
  const res = await fetch(`${API_BASE}/subscribers/import`, { method: "POST" });
  return res.json();
};

/* Backfill missing location data for subscribers with readings but no location */
export const backfillSubscriberLocations = async (): Promise<{
  success: boolean;
  updated: number;
}> => {
  const res = await assertOk(
    await fetch(`${API_BASE}/subscribers/backfill-locations`, { method: "POST" })
  );
  return res.json();
};

/* Batch reverse-geocode coordinates into location strings */
export const geocodeCoordinates = async (
  coords: { latitude: number; longitude: number }[],
): Promise<(string | null)[]> => {
  const res = await assertOk(
    await fetch(`${API_BASE}/subscribers/geocode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(coords),
    })
  );
  const data = await res.json();
  return data.locations;
};

/* Clear all local subscriber data */
export const clearSubscribers = async (): Promise<{
  success: boolean;
  cleared: number;
}> => {
  const res = await assertOk(
    await fetch(`${API_BASE}/subscribers/clear`, { method: "POST" })
  );
  return res.json();
};

/* ── Stats API ────────────────────────────────────────────────────── */

/* Shape of the logserver stats response */
export interface LogserverStats {
  server: {
    version: string | null;
    dbVersion: string | null;
    mysqlVersion: string | null;
    hostname: string | null;
    startupTime: string | null;
    timezone: number;
  };
  system: {
    cpuLoad: number | null;
    memUsageMB: number | null;
    memPeakMB: number | null;
    memAvailableMB: number | null;
    diskFreeMB: number | null;
    diskTotalMB: number | null;
    dbSizeMB: number | null;
  };
  network: {
    nodes: { nodeNo: number; description: string }[];
    organizationCount: number;
    individualSubscribers: number;
    groupSubscribers: number;
    registeredMs: number;
  };
  activity: {
    groupCalls: number;
    individualCalls: number;
    pttEvents: number;
    sdsMessages: number;
    lastGroupCall: string | null;
    lastIndividualCall: string | null;
    lastSds: string | null;
    lastRegistration: string | null;
  };
  logging: {
    infoLog: boolean;
    sdsLog: boolean;
    logAll: boolean;
    voiceLogMax: number;
  };
  license: {
    serial: number | null;
    expiryDate: string | null;
  };
  alarms: {
    last24h: number;
  };
}

/* Fetch comprehensive logserver statistics */
export const fetchStats = async (): Promise<LogserverStats> => {
  const res = await assertOk(await fetch(`${API_BASE}/stats`));
  return res.json();
};

/* Update the symbol display size setting */
export const updateSymbolSize = async (symbolSize: number): Promise<void> => {
  await assertOk(
    await fetch(`${API_BASE}/settings/symbol-size`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbolSize }),
    })
  );
};

/* ── Symbols API ─────────────────────────────────────────────────── */

/* Shape of a user-placed map symbol */
export interface MapSymbol {
  id: string;
  type: string;
  label: string;
  longitude: number;
  latitude: number;
  direction: number | null;
  created_at: string;
}

/* Fetch all placed map symbols */
export const fetchSymbols = async (): Promise<MapSymbol[]> => {
  const res = await assertOk(await fetch(`${API_BASE}/symbols`));
  return res.json();
};

/* Create a new symbol on the map */
export const createSymbol = async (symbol: MapSymbol): Promise<void> => {
  await assertOk(
    await fetch(`${API_BASE}/symbols`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(symbol),
    })
  );
};

/* Update only the position of an existing symbol */
export const updateSymbolPosition = async (id: string, longitude: number, latitude: number): Promise<void> => {
  await assertOk(
    await fetch(`${API_BASE}/symbols/${id}/position`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ longitude, latitude }),
    })
  );
};

/* Update the direction angle of a symbol */
export const updateSymbolDirection = async (id: string, direction: number | null): Promise<void> => {
  await assertOk(
    await fetch(`${API_BASE}/symbols/${id}/direction`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ direction }),
    })
  );
};

/* Delete a symbol from the map */
export const deleteSymbol = async (id: string): Promise<void> => {
  await assertOk(
    await fetch(`${API_BASE}/symbols/${id}`, { method: "DELETE" })
  );
};

/* Save new settings, test connection, and restart sync service */
export const saveSettings = async (settings: Settings): Promise<SettingsResponse> => {
  const res = await assertOk(
    await fetch(`${API_BASE}/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    })
  );
  return res.json();
};
