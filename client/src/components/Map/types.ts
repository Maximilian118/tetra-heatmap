/* Viewport shape used by deck.gl / react-map-gl */
export interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  bearing: number;
  pitch: number;
}

/* Compute a viewport that encompasses a bounding box [west, south, east, north] */
export const viewStateFromBounds = (bounds: [number, number, number, number]): ViewState => {
  const [west, south, east, north] = bounds;
  const longitude = (west + east) / 2;
  const latitude = (south + north) / 2;
  const lonSpan = east - west;
  const latSpan = north - south;
  const span = Math.max(lonSpan, latSpan, 0.001);
  const zoom = Math.min(Math.log2(360 / span) - 1, 16);
  return { longitude, latitude, zoom, bearing: 0, pitch: 0 };
};

/* Try to restore a previously saved view state from localStorage */
export const loadSavedViewState = (key: string): ViewState | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.longitude === "number" &&
      typeof parsed.latitude === "number" &&
      typeof parsed.zoom === "number"
    ) {
      return {
        longitude: parsed.longitude,
        latitude: parsed.latitude,
        zoom: parsed.zoom,
        bearing: parsed.bearing ?? 0,
        pitch: parsed.pitch ?? 0,
      };
    }
  } catch { /* corrupt data — ignore */ }
  return null;
};
