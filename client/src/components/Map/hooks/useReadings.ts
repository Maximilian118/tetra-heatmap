import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { fetchReadings, resetCache, fetchSubscribers, geocodeCoordinates, type Reading, type Subscriber, type MapSymbol } from "../../../utils/api";
import { saveDataset, loadDataset, deriveSubscribersFromReadings, type SavedViewState } from "../../../utils/dataset";
import { readingsBounds } from "../../../utils/geojson";
import { loadSavedViewState, viewStateFromBounds, type ViewState } from "../types";
import { POLL_INTERVAL_MS, VIEW_STATE_KEY } from "../constants";

interface UseReadingsParams {
  setInitialView: (vs: ViewState | ((prev: ViewState | null) => ViewState | null)) => void;
  setMapStyle: (style: string) => void;
  setSymbols: (updater: MapSymbol[] | ((prev: MapSymbol[]) => MapSymbol[])) => void;
  setSymbolSize: (size: number) => void;
  setDataAgeMinutes: (minutes: number | null) => void;
  symbols: MapSymbol[];
  symbolSize: number;
  mapStyle: string;
  loadSymbols: () => Promise<void>;
}

/* Manages reading data from both live API polling and file uploads */
export const useReadings = (params: UseReadingsParams) => {
  const {
    setInitialView, setMapStyle, setSymbols, setSymbolSize,
    setDataAgeMinutes, symbols, symbolSize, mapStyle, loadSymbols,
  } = params;

  const [readings, setReadings] = useState<Reading[]>([]);
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [serverTzOffsetHours, setServerTzOffsetHours] = useState(0);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [lastReset, setLastReset] = useState<string | null>(() => localStorage.getItem("lastCacheReset"));
  const [fileReadings, setFileReadings] = useState<Reading[] | null>(null);
  const [fileSubscribers, setFileSubscribers] = useState<Subscriber[] | null>(null);
  const [liveSubscribers, setLiveSubscribers] = useState<Subscriber[]>([]);
  const savingRef = useRef(false);

  /* Use file data when loaded, otherwise fall back to live server data */
  const displayedReadings = fileReadings ?? readings;

  /* Build an SSI → description lookup from whichever subscriber source is active */
  const ssiDescriptionMap = useMemo(() => {
    const subs = fileSubscribers ?? liveSubscribers;
    const lookup = new globalThis.Map<number, string>();
    for (const s of subs) {
      if (s.description) lookup.set(s.ssi, s.description);
    }
    return lookup;
  }, [fileSubscribers, liveSubscribers]);

  /* Fetch readings and subscribers from the API. On first successful load,
     derive the initial viewport from the data bounding box so the map opens
     already centred on the readings — no fly animation needed. */
  const loadReadings = useCallback(async () => {
    try {
      const { readings: data, clockOffsetMs: offset, serverTzOffsetHours: tzOffset } = await fetchReadings();
      setReadings(data);
      setClockOffsetMs(offset);
      setServerTzOffsetHours(tzOffset);

      /* Set initial viewport from data bounds (first load only) */
      setInitialView((prev) => {
        if (prev) return prev;
        const bounds = readingsBounds(data);
        if (!bounds) return prev;
        return viewStateFromBounds(bounds);
      });
    } catch (err) {
      console.error("[map] Failed to fetch readings:", err);
    }

    /* Refresh subscriber descriptions for tooltip lookups */
    try {
      setLiveSubscribers(await fetchSubscribers());
    } catch { /* subscriber fetch is non-critical */ }
  }, [setInitialView]);

  /* Poll the API on mount and at a regular interval */
  useEffect(() => {
    loadReadings();
    const id = setInterval(loadReadings, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [loadReadings]);

  /* Download the currently displayed readings as a JSON file via the browser save dialog */
  const handleSaveData = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;

    try {
      const savedView = loadSavedViewState(VIEW_STATE_KEY) as SavedViewState | undefined;

      /* Snapshot the current SSI Register: use file subscribers if loaded, otherwise fetch live */
      let subscribers: Subscriber[] | undefined;
      try {
        subscribers = fileSubscribers ?? await fetchSubscribers();
      } catch (err) {
        console.error("[map] Failed to fetch subscribers for save:", err);
      }

      await saveDataset(displayedReadings, savedView ?? undefined, mapStyle, subscribers, symbols, symbolSize);
    } finally {
      savingRef.current = false;
    }
  }, [displayedReadings, mapStyle, fileSubscribers, symbols, symbolSize]);

  /* Load readings from a user-selected JSON file and switch to file mode */
  const handleLoadData = useCallback(async (file: File) => {
    try {
      const { readings: data, viewState, mapStyle: style, subscribers, symbols: fileSyms, symbolSize: fileSymSize } = await loadDataset(file);

      /* Restore symbols and symbol size from the file if present */
      if (fileSyms?.length) setSymbols(fileSyms);
      if (fileSymSize) setSymbolSize(fileSymSize);
      setDataAgeMinutes(null);
      setFileReadings(data);

      /* Use saved subscribers if present, otherwise derive from readings and geocode */
      if (subscribers?.length) {
        setFileSubscribers(subscribers);
      } else {
        const { subscribers: derived, toGeocode } = deriveSubscribersFromReadings(data);
        setFileSubscribers(derived);

        /* Geocode last reading locations in the background */
        if (toGeocode.length > 0) {
          geocodeCoordinates(toGeocode.map(({ latitude, longitude }) => ({ latitude, longitude })))
            .then((locations) => {
              setFileSubscribers((prev) => {
                if (!prev) return prev;
                const updated = [...prev];
                toGeocode.forEach(({ index }, i) => {
                  if (locations[i]) updated[index] = { ...updated[index], last_location: locations[i] };
                });
                return updated;
              });
            })
            .catch(() => { /* geocoding unavailable — locations stay empty */ });
        }
      }

      /* Restore saved view state from file, or fall back to data bounds */
      if (viewState) {
        setInitialView(viewState as ViewState);
      } else {
        const bounds = readingsBounds(data);
        if (bounds) setInitialView(viewStateFromBounds(bounds));
      }

      /* Restore saved map style if present */
      if (style) setMapStyle(style);
    } catch (err) {
      console.error("[map] Failed to load dataset:", err);
    }
  }, [setInitialView, setMapStyle, setSymbols, setSymbolSize, setDataAgeMinutes]);

  /* Switch back to live server data by clearing the file overlay */
  const handleResumeLive = useCallback(() => {
    setFileReadings(null);
    setFileSubscribers(null);
    loadSymbols();
  }, [loadSymbols]);

  /* Wipe the local cache, reset the sync point, and show a brief confirmation */
  const handleReset = async () => {
    setResetting(true);
    try {
      const { syncFrom } = await resetCache();
      setReadings([]);
      localStorage.setItem("lastCacheReset", syncFrom);
      setLastReset(syncFrom);
      setResetMessage(`Cache cleared — syncing from ${new Date(syncFrom).toLocaleTimeString()}`);
      setTimeout(() => setResetMessage(null), 3000);
    } catch {
      setResetMessage("Reset failed — check server connection");
      setTimeout(() => setResetMessage(null), 3000);
    } finally {
      setResetting(false);
    }
  };

  return {
    displayedReadings,
    clockOffsetMs,
    serverTzOffsetHours,
    resetting,
    resetMessage,
    lastReset,
    fileReadings,
    fileSubscribers,
    liveSubscribers,
    ssiDescriptionMap,
    handleSaveData,
    handleLoadData,
    handleResumeLive,
    handleReset,
  };
};
