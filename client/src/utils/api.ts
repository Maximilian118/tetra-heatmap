/* Base URL for all API requests — proxied to Express by Vite in dev */
const API_BASE = "/api";

/* Clear the local RSSI cache and start collecting fresh data from now */
export const resetCache = async (): Promise<{ success: boolean; syncFrom: string }> => {
  const res = await fetch(`${API_BASE}/rssi/reset`, { method: "POST" });
  return res.json();
};
