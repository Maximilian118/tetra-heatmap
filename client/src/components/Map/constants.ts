import type { ViewState } from "./types";

/* How often to poll for new readings (ms) */
export const POLL_INTERVAL_MS = 30_000;

/* How long to wait after the last interaction before saving view state (ms) */
export const VIEW_SAVE_DELAY_MS = 500;

/* localStorage key for persisted map viewport */
export const VIEW_STATE_KEY = "mapViewState";

/* Margin left around a bounding box when framing the map on it, as a fraction of the
   shorter canvas axis so the proportions hold on a phone as well as a desktop */
export const FIT_PADDING_RATIO = 0.08;

/* Bounds for the computed padding, in pixels */
export const FIT_PADDING_MIN_PX = 16;
export const FIT_PADDING_MAX_PX = 80;

/* The deck canvas runs this far below the visible map area to hide MapBox branding
   (see `.map-area` in Map.scss). Framing adds it as bottom padding so a fitted
   bounding box lands centred in the part the user can actually see. */
export const MAP_AREA_OVERFLOW_PX = 100;

/* Closest zoom a bounds fit will go to, so a tiny extent doesn't fill the screen */
export const FIT_MAX_ZOOM = 17;

/* Smallest bounding box a fit will consider, in degrees (~100 m) */
export const FIT_MIN_EXTENT_DEG = 0.001;

/* Fallback viewport when there are no readings and no saved view in localStorage */
export const DEFAULT_VIEW: ViewState = {
  longitude: 0,
  latitude: 30,
  zoom: 2,
  bearing: 0,
  pitch: 0,
};
