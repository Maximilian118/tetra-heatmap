import { useState, useCallback, useMemo } from "react";
import DeckGL from "@deck.gl/react";
import { Map as MapGL } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { buildBgAtlas, buildFgAtlas } from "../../utils/symbols";
import { useServerSettings, useMapViewport, useReadings, useFilterPipeline, useLayerConfig, useKml, useSymbols } from "./hooks";
import { buildLayers } from "./layers";
import Tooltip, { type TooltipInfo } from "./Tooltip/Tooltip";
import KmlTooltip, { type KmlTooltipInfo } from "./Tooltip/KmlTooltip";
import Sidebar from "./Sidebar/Sidebar";
import LogserverStats from "./LogserverStats/LogserverStats";
import RssiLegend from "./RssiLegend/RssiLegend";
import NorthArrow from "./NorthArrow/NorthArrow";
import Radial from "./Radial/Radial";
import SsiRegister from "./SsiRegister/SsiRegister";
import MapboxSetup from "./MapboxSetup/MapboxSetup";
import "./Map.scss";

/* Full-viewport MapBox map with deck.gl RSSI heatmap + hover tooltips */
const Map = () => {
  /* ─── Bridge state: shared across multiple hooks ─── */
  const [mapStyle, setMapStyle] = useState("mapbox://styles/mapbox/navigation-guidance-night-v4");
  const [dataAgeMinutes, setDataAgeMinutes] = useState<number | null>(null);

  /* ─── UI overlay state ─── */
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [kmlTooltip, setKmlTooltip] = useState<KmlTooltipInfo | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [showStats, setShowStats] = useState(false);

  /* ─── Viewport management ─── */
  const viewport = useMapViewport();

  /* ─── Symbol management (needs deckRef + liveViewState for projection & drag) ─── */
  const sym = useSymbols({ deckRef: viewport.deckRef, liveViewState: viewport.liveViewState });

  /* ─── Server settings (seeds symbol size on mount) ─── */
  const { mapboxToken, dbConnected, retentionDays } = useServerSettings(sym.setSymbolSize);

  /* ─── Data fetching & file mode ─── */
  const data = useReadings({
    setInitialView: viewport.setInitialView,
    setMapStyle,
    setSymbols: sym.setSymbols,
    setSymbolSize: sym.setSymbolSize,
    setDataAgeMinutes,
    symbols: sym.symbols,
    symbolSize: sym.symbolSize,
    mapStyle,
    loadSymbols: sym.loadSymbols,
  });

  /* ─── Filter pipeline ─── */
  const filter = useFilterPipeline(data.displayedReadings, data.clockOffsetMs, dataAgeMinutes);

  /* ─── Layer config (colours, paths, layer type) ─── */
  const config = useLayerConfig(filter.validReadings);

  /* ─── KML overlays ─── */
  const setKmlTooltipNull = useCallback(() => setKmlTooltip(null), []);
  const kml = useKml({
    validReadings: filter.validReadings,
    layerType: config.layerType,
    scope: config.layerSettings.scope,
    activeRssiToColor: config.activeRssiToColor,
    setKmlTooltip: setKmlTooltipNull,
  });

  /* ─── Symbol icon atlases (built once at mount) ─── */
  const bgAtlasUrl = useMemo(() => buildBgAtlas().toDataURL(), []);
  const fgAtlasUrl = useMemo(() => buildFgAtlas().toDataURL(), []);

  /* ─── Assemble deck.gl layers ─── */
  const layers = useMemo(() => buildLayers({
    layerType: config.layerType,
    validReadings: filter.validReadings,
    radioPaths: config.radioPaths,
    layerSettings: config.layerSettings,
    activeColorRange: config.activeColorRange,
    activeRssiToColor: config.activeRssiToColor,
    ssiDescriptionMap: data.ssiDescriptionMap,
    kmlGeoJson: kml.kmlGeoJson,
    kmlScopeReadings: kml.kmlScopeReadings,
    scopeAdjusting: kml.scopeAdjusting,
    kmlData: kml.kmlData,
    kmlLayerStyles: kml.kmlLayerStyles,
    visibleLineFolders: kml.visibleLineFolders,
    visiblePointFolders: kml.visiblePointFolders,
    symbols: sym.symbols,
    bgAtlasUrl,
    fgAtlasUrl,
    selectedSymbolId: sym.selectedSymbolId,
    symbolSize: sym.symbolSize,
    draggingSymbolId: sym.draggingSymbolId,
    setTooltip,
    setKmlTooltip,
    setSelectedSymbolId: sym.setSelectedSymbolId,
    setDraggingSymbolId: sym.setDraggingSymbolId,
    setSymbols: sym.setSymbols,
  }), [
    filter.validReadings, config.layerType, config.radioPaths, config.layerSettings,
    config.activeColorRange, config.activeRssiToColor, data.ssiDescriptionMap,
    kml.kmlGeoJson, kml.kmlScopeReadings, kml.scopeAdjusting, kml.kmlData,
    kml.kmlLayerStyles, kml.visibleLineFolders, kml.visiblePointFolders,
    sym.symbols, bgAtlasUrl, fgAtlasUrl, sym.selectedSymbolId, sym.symbolSize,
    sym.draggingSymbolId, sym.setSelectedSymbolId, sym.setDraggingSymbolId, sym.setSymbols,
  ]);

  /* Log deck.gl rendering errors (layer failures, shader errors, etc.) */
  const handleDeckError = useCallback((error: Error, layer?: unknown) => {
    console.error("[deck.gl] error:", error.message, layer);
  }, []);

  /* Log MapBox errors (tile load failures, style errors, WebGL issues) */
  const handleMapError = useCallback((e: { error?: { message?: string } }) => {
    console.error("[mapbox] error:", e.error?.message ?? e);
  }, []);

  /* Toggle the SSI Register overlay open/closed */
  const handleToggleRegister = useCallback(() => {
    setRegisterOpen((prev) => !prev);
  }, []);

  /* ─── Early returns ─── */

  /* Still loading settings from server */
  if (mapboxToken === null) {
    return <div className="map-container" />;
  }

  /* No Mapbox token configured — show first-time setup screen */
  if (!mapboxToken) {
    return <MapboxSetup />;
  }

  /* ─── Render ─── */
  return (
    <div className="map-container">
      <Sidebar
        resetting={data.resetting}
        resetMessage={data.resetMessage}
        lastReset={data.lastReset}
        mapStyle={mapStyle}
        layerType={config.layerType}
        layerSettings={config.layerSettings}
        readings={data.displayedReadings}
        isFileMode={data.fileReadings !== null}
        kmlLoaded={kml.kmlData !== null}
        kmlFolders={kml.kmlData?.folders ?? []}
        kmlLayerStyles={kml.kmlLayerStyles}
        onKmlLayerStyleChange={(name, style) => kml.setKmlLayerStyles((prev) => ({ ...prev, [name]: style }))}
        onStyleChange={setMapStyle}
        onLayerTypeChange={config.setLayerType}
        onSettingsChange={config.setLayerSettings}
        onKmlLoad={kml.setKmlData}
        onScopeAdjusting={kml.setScopeAdjusting}
        onSaveData={data.handleSaveData}
        onLoadData={data.handleLoadData}
        onResumeLive={data.handleResumeLive}
        onReset={data.handleReset}
        onToggleRegister={handleToggleRegister}
        selectedSsis={filter.selectedSsis}
        dataAgeMinutes={dataAgeMinutes}
        onDataAgeChange={setDataAgeMinutes}
        retentionDays={retentionDays}
        maxAccuracy={filter.maxAccuracy}
        onAccuracyChange={filter.setMaxAccuracy}
        clockOffsetMs={data.clockOffsetMs}
        serverTzOffsetHours={data.serverTzOffsetHours}
        onShowStats={() => setShowStats(true)}
        symbols={sym.symbols}
        symbolSize={sym.symbolSize}
        onSymbolSizeChange={sym.handleSymbolSizeChange}
        selectedSymbolId={sym.selectedSymbolId}
        onSelectSymbol={sym.setSelectedSymbolId}
        onDeleteSymbol={sym.handleDeleteSymbol}
        onFlyTo={viewport.handleFlyTo}
        onDirectionChange={sym.handleDirectionChange}
        customSpectrum={config.customSpectrum}
        onSpectrumChange={config.setCustomSpectrum}
        colourTabTrigger={config.colourTabTrigger}
      />

      <div className="map-area" onDragOver={sym.handleMapDragOver} onDrop={sym.handleMapDrop}>
        {/* DeckGL as root — owns canvas + interactions.
            MapGL is a child that renders tiles and follows DeckGL's viewport. */}
        <DeckGL
          ref={viewport.deckRef}
          initialViewState={viewport.resolvedView}
          controller={{ dragPan: !sym.draggingSymbolId }}
          layers={layers}
          onViewStateChange={viewport.handleViewStateChange}
          onError={handleDeckError}
          getCursor={({ isHovering }) => isHovering ? "pointer" : "grab"}
          onClick={(info) => { if (!info.object) sym.setSelectedSymbolId(null); }}
        >
          <MapGL
            mapboxAccessToken={mapboxToken}
            mapStyle={mapStyle}
            onError={handleMapError}
          />
        </DeckGL>

        <Tooltip tooltip={tooltip} clockOffsetMs={data.clockOffsetMs} serverTzOffsetHours={data.serverTzOffsetHours} />
        <KmlTooltip tooltip={kmlTooltip} />
        <RssiLegend customSpectrum={config.customSpectrum} readings={filter.validReadings} onClick={() => config.setColourTabTrigger((n) => n + 1)} />
        <NorthArrow bearing={viewport.bearing} onResetNorth={viewport.handleResetNorth} />

        {/* Radial action menu — key forces remount on symbol switch for fresh animation */}
        {(sym.selectedSymbol || sym.radialLeaving) && (
          <Radial
            key={sym.radialLeaving ? `leaving-${sym.prevSymbolRef.current?.symbol.id}` : sym.selectedSymbolId!}
            symbol={sym.radialLeaving ? sym.prevSymbolRef.current?.symbol ?? null : sym.selectedSymbol}
            screenPos={sym.radialLeaving ? sym.prevSymbolRef.current?.screenPos ?? null : sym.selectedSymbolScreenPos}
            leaving={sym.radialLeaving}
            onBackupChange={sym.handleBackupChange}
            onInactiveChange={sym.handleInactiveChange}
            onDelete={sym.handleDeleteSymbol}
            onHoverAction={() => { setTooltip(null); setKmlTooltip(null); }}
          />
        )}

        {/* SSI Register overlay — rendered on top of the map without unmounting it */}
        {registerOpen && (
          <SsiRegister
            onClose={() => setRegisterOpen(false)}
            dbConnected={dbConnected}
            selectedSsis={filter.selectedSsis}
            onToggleSsi={filter.handleToggleSsi}
            onResetFilter={filter.handleResetSsiFilter}
            fileSubscribers={data.fileSubscribers}
            isFileMode={data.fileReadings !== null}
            clockOffsetMs={data.clockOffsetMs}
            serverTzOffsetHours={data.serverTzOffsetHours}
          />
        )}

        {/* Logserver stats overlay */}
        {showStats && (
          <LogserverStats onClose={() => setShowStats(false)} />
        )}
      </div>
    </div>
  );
};

export default Map;
