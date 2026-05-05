import { useState, useEffect, useCallback, useRef } from "react";
import type { ViewState } from "../types";
import { loadSavedViewState } from "../types";
import { DEFAULT_VIEW, VIEW_SAVE_DELAY_MS, VIEW_STATE_KEY } from "../constants";

/* Manages map viewport state, saves/restores from localStorage, and exposes navigation helpers */
export const useMapViewport = () => {
  const [initialView, setInitialView] = useState<ViewState | null>(() => loadSavedViewState(VIEW_STATE_KEY));
  const [bearing, setBearing] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [liveViewState, setLiveViewState] = useState<any>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const deckRef = useRef<any>(null);

  /* DeckGL only fires onViewStateChange for user interactions, not for programmatic
     initialViewState changes. Sync liveViewState after the deck processes a fly-to. */
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vp = (deckRef.current as any)?.deck?.getViewports?.()?.[0];
      if (vp) setLiveViewState({ longitude: vp.longitude, latitude: vp.latitude, zoom: vp.zoom, bearing: vp.bearing, pitch: vp.pitch });
    });
    return () => cancelAnimationFrame(id);
  }, [initialView]);

  /* Debounce-save the current viewport to localStorage so it persists across refreshes */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleViewStateChange = useCallback(({ viewState }: any) => {
    setBearing(viewState.bearing ?? 0);
    setLiveViewState(viewState);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      localStorage.setItem(VIEW_STATE_KEY, JSON.stringify({
        longitude: viewState.longitude,
        latitude: viewState.latitude,
        zoom: viewState.zoom,
        bearing: viewState.bearing,
        pitch: viewState.pitch,
      }));
    }, VIEW_SAVE_DELAY_MS);
  }, []);

  /* Fly the map to a specific coordinate, preserving current bearing and pitch */
  const handleFlyTo = useCallback((longitude: number, latitude: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vp = (deckRef.current as any)?.deck?.viewManager?.getViewports()?.[0];
    setInitialView({
      longitude,
      latitude,
      zoom: vp?.zoom ?? 16,
      bearing: vp?.bearing ?? 0,
      pitch: vp?.pitch ?? 0,
    });
  }, []);

  /* Snap the map bearing back to 0° (facing north) */
  const handleResetNorth = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vp = (deckRef.current as any)?.deck?.viewManager?.getViewports()?.[0];
    setInitialView({
      longitude: vp?.longitude ?? 0,
      latitude: vp?.latitude ?? 30,
      zoom: vp?.zoom ?? 2,
      bearing: 0,
      pitch: vp?.pitch ?? 0,
    });
  }, []);

  /* Resolve the viewport: saved view > data bounds > world overview fallback */
  const resolvedView = initialView ?? DEFAULT_VIEW;

  return {
    deckRef,
    resolvedView,
    bearing,
    liveViewState,
    initialView,
    setInitialView,
    handleViewStateChange,
    handleResetNorth,
    handleFlyTo,
  };
};
