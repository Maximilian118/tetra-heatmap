import { useState, useEffect, useCallback, useMemo, useRef, type MutableRefObject } from "react";
import { fetchSymbols, createSymbol, updateSymbolDirection, updateSymbolBackup, updateSymbolInactive, updateSymbolSize as apiUpdateSymbolSize, deleteSymbol as apiDeleteSymbol, type MapSymbol } from "../../../utils/api";

interface UseSymbolsParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deckRef: MutableRefObject<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  liveViewState: any;
}

/* Manages user-placed map symbols, radial menu state, and drag/drop interactions */
export const useSymbols = (params: UseSymbolsParams) => {
  const { deckRef, liveViewState } = params;

  const [symbols, setSymbols] = useState<MapSymbol[]>([]);
  const [symbolSize, setSymbolSize] = useState(48);
  const [selectedSymbolId, setSelectedSymbolId] = useState<string | null>(null);
  const [draggingSymbolId, setDraggingSymbolId] = useState<string | null>(null);
  const [radialLeaving, setRadialLeaving] = useState(false);
  const prevSymbolRef = useRef<{ symbol: MapSymbol; screenPos: [number, number] } | null>(null);
  const radialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const directionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* The currently selected symbol object (for the radial action menu) */
  const selectedSymbol = useMemo(
    () => symbols.find((s) => s.id === selectedSymbolId) ?? null,
    [symbols, selectedSymbolId]
  );

  /* Screen-space position of the selected symbol for the radial action menu.
     liveViewState triggers re-render on every frame; the actual projection uses
     deck.getViewports() which has correct canvas width/height baked in. */
  const selectedSymbolScreenPos = useMemo((): [number, number] | null => {
    if (!selectedSymbol || !liveViewState) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const viewport = (deckRef.current as any)?.deck?.getViewports?.()?.[0];
    if (!viewport) return null;
    const [x, y] = viewport.project([selectedSymbol.longitude, selectedSymbol.latitude]);
    return [x, y];
  }, [selectedSymbol, liveViewState, deckRef]);

  /* Track previous symbol data for exit animation, and manage the leaving state.
     When selection goes away, play exit animation for 150ms before fully hiding. */
  useEffect(() => {
    if (selectedSymbol && selectedSymbolScreenPos) {
      prevSymbolRef.current = { symbol: selectedSymbol, screenPos: selectedSymbolScreenPos };
      setRadialLeaving(false);
      if (radialTimerRef.current) clearTimeout(radialTimerRef.current);
    } else if (prevSymbolRef.current && !radialLeaving) {
      setRadialLeaving(true);
      radialTimerRef.current = setTimeout(() => {
        setRadialLeaving(false);
        prevSymbolRef.current = null;
      }, 120);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSymbol, selectedSymbolScreenPos]);

  /* Load placed symbols from the server on mount */
  const loadSymbols = useCallback(async () => {
    try {
      setSymbols(await fetchSymbols());
    } catch (err) {
      console.error("[map] Failed to fetch symbols:", err);
    }
  }, []);

  useEffect(() => { loadSymbols(); }, [loadSymbols]);

  /* Delete a symbol and refresh the list */
  const handleDeleteSymbol = useCallback(async (id: string) => {
    try {
      await apiDeleteSymbol(id);
      setSymbols((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error("[map] Failed to delete symbol:", err);
    }
  }, []);

  /* Update the direction angle of a directional repeater symbol.
     Local state updates immediately for responsive UI; API persist is debounced. */
  const handleDirectionChange = useCallback((id: string, direction: number) => {
    setSymbols((prev) => prev.map((s) => s.id === id ? { ...s, direction } : s));
    if (directionTimer.current) clearTimeout(directionTimer.current);
    directionTimer.current = setTimeout(() => {
      updateSymbolDirection(id, direction).catch(
        (err) => console.error("[map] Failed to update symbol direction:", err)
      );
    }, 300);
  }, []);

  /* Toggle the backup flag on a symbol */
  const handleBackupChange = useCallback(async (id: string, backup: boolean) => {
    setSymbols((prev) => prev.map((s) => s.id === id ? { ...s, backup } : s));
    try {
      await updateSymbolBackup(id, backup);
    } catch (err) {
      console.error("[map] Failed to update symbol backup:", err);
    }
  }, []);

  /* Toggle the inactive flag on a symbol */
  const handleInactiveChange = useCallback(async (id: string, inactive: boolean) => {
    setSymbols((prev) => prev.map((s) => s.id === id ? { ...s, inactive } : s));
    try {
      await updateSymbolInactive(id, inactive);
    } catch (err) {
      console.error("[map] Failed to update symbol inactive:", err);
    }
  }, []);

  /* Handle dropping a symbol from the sidebar palette onto the map */
  const handleMapDrop = useCallback(async (e: React.DragEvent) => {
    const symbolType = e.dataTransfer.getData("symbolType");
    if (!symbolType) return;

    e.preventDefault();

    /* Convert drop pixel coordinates to lng/lat via DeckGL viewport */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const deck = (deckRef.current as any)?.deck;
    if (!deck) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const viewport = deck.getViewports()[0];
    if (!viewport) return;

    const [longitude, latitude] = viewport.unproject([x, y]);

    const symbol: MapSymbol = {
      id: crypto.randomUUID(),
      type: symbolType,
      label: "",
      longitude,
      latitude,
      direction: null,
      backup: false,
      inactive: false,
      created_at: new Date().toISOString(),
    };

    try {
      await createSymbol(symbol);
      setSymbols((prev) => [symbol, ...prev]);
    } catch (err) {
      console.error("[map] Failed to create symbol:", err);
    }
  }, [deckRef]);

  /* Allow the map area to accept drops (browsers lowercase dataTransfer type keys) */
  const handleMapDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("symboltype")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  /* Update symbol size locally and persist to server */
  const handleSymbolSizeChange = useCallback((size: number) => {
    setSymbolSize(size);
    apiUpdateSymbolSize(size).catch((err) => console.error("[map] Failed to save symbol size:", err));
  }, []);

  return {
    symbols,
    setSymbols,
    symbolSize,
    setSymbolSize,
    selectedSymbolId,
    setSelectedSymbolId,
    draggingSymbolId,
    setDraggingSymbolId,
    selectedSymbol,
    selectedSymbolScreenPos,
    radialLeaving,
    prevSymbolRef,
    loadSymbols,
    handleDeleteSymbol,
    handleDirectionChange,
    handleBackupChange,
    handleInactiveChange,
    handleMapDrop,
    handleMapDragOver,
    handleSymbolSizeChange,
  };
};
