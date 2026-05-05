import type { ViewState } from "./types";

/* How often to poll for new readings (ms) */
export const POLL_INTERVAL_MS = 30_000;

/* How long to wait after the last interaction before saving view state (ms) */
export const VIEW_SAVE_DELAY_MS = 500;

/* localStorage key for persisted map viewport */
export const VIEW_STATE_KEY = "mapViewState";

/* Fallback viewport when there are no readings and no saved view in localStorage */
export const DEFAULT_VIEW: ViewState = {
  longitude: 0,
  latitude: 30,
  zoom: 2,
  bearing: 0,
  pitch: 0,
};
