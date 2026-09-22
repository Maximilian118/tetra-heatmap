import { useState, useEffect, useCallback, useRef } from "react";
import { WebMercatorViewport } from "@deck.gl/core";
import type { ViewState } from "../types";
import { loadSavedViewState } from "../types";
import { DEFAULT_VIEW, FIT_MAX_ZOOM, FIT_MIN_EXTENT_DEG, FIT_PADDING_MAX_PX, FIT_PADDING_MIN_PX, FIT_PADDING_RATIO, MAP_AREA_OVERFLOW_PX, VIEW_SAVE_DELAY_MS, VIEW_STATE_KEY } from "../constants";

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

  /* Frame the map on a bounding box so the whole extent fits with a margin around it.
     Uses the live canvas size so the fit accounts for the map area's aspect ratio,
     and keeps the current bearing and pitch rather than snapping the camera upright. */
  const handleFitBounds = useCallback((bounds: [[number, number], [number, number]]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vp = (deckRef.current as any)?.deck?.viewManager?.getViewports()?.[0];
    const width = vp?.width > 0 ? vp.width : window.innerWidth;
    const height = vp?.height > 0 ? vp.height : window.innerHeight;

    /* Scale the margin to the canvas so a phone isn't left with a sliver of map,
       then cap it so fitBounds is never handed padding wider than the canvas */
    const shortAxis = Math.min(width, height);
    const scaled = Math.round(shortAxis * FIT_PADDING_RATIO);
    const padding = Math.min(
      Math.max(FIT_PADDING_MIN_PX, Math.min(FIT_PADDING_MAX_PX, scaled)),
      Math.floor(shortAxis / 2) - 8
    );

    /* The canvas runs past the bottom of the visible area, so reserve that strip */
    const bottom = Math.min(padding + MAP_AREA_OVERFLOW_PX, Math.floor(height / 2) - padding - 8);

    const fitted = new WebMercatorViewport({ width, height }).fitBounds(bounds, {
      padding: { top: padding, bottom: Math.max(padding, bottom), left: padding, right: padding },
      maxZoom: FIT_MAX_ZOOM,
      minExtent: FIT_MIN_EXTENT_DEG,
    });

    setInitialView({
      longitude: fitted.longitude,
      latitude: fitted.latitude,
      zoom: fitted.zoom,
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
    handleFitBounds,
  };
};
