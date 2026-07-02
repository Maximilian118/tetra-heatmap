# Changelog

## [0.15.0] — 2026-07-02

### Fixed
- **Last reading lost after retention pruning** — The "Last Reading" timestamp in the SSI Register was computed dynamically from the readings table, so it disappeared once readings were pruned after the retention period. The timestamp is now persisted on the subscribers table (mirroring the existing `last_location` behaviour) and falls back to the stored value when live readings have been purged. Also fixed a latent bug where re-importing subscribers via the Import button would reset the stored last location.

## [0.14.0] — 2026-07-02

### Fixed
- **Notes button hidden on mobile** — The notes button on the map was obscured by the sidebar drawer toggle on mobile viewports. Repositioned it to the right of the toggle and matched its height for a uniform appearance.

## [0.13.0] — 2026-07-02

### Fixed
- **KML picker in report mode** — Clicking the KML button while in the PDF preview now opens the new KML picker tab instead of the old native file dialog. Closing the picker returns to the report tab instead of the map tab.

## [0.12.0] — 2026-07-02

### Changed
- **Symbols scale with map zoom** — Symbols now scale smoothly with the map zoom level using GPU-accelerated common-space units, maintaining a consistent geographic footprint. Zooming out shrinks symbols to avoid collisions; zooming in grows them proportionally with the map. The size slider still controls the base size at the reference zoom level.

### Fixed
- **PDF map position shift** — The exported PDF map no longer shifts slightly upward. The DeckGL canvas extended below the visible area to hide MapBox branding; the composite snapshot now crops to only the visible portion instead of centre-cropping.
- **PDF text sharpness** — Increased html2canvas capture scale from 2x to 3x and raised JPEG quality from 95% to 98%, producing noticeably sharper banner and legend text. Intermediate pre-crop encoding switched from JPEG to PNG to avoid double lossy compression.
- **PDF symbol sizing** — Map symbols in the PDF preview now scale proportionally to the preview's smaller map area, matching the visual weight they have on the main map.

## [0.11.0] — 2026-07-01

### Added
- **Batch KML upload** — The KML file picker now supports multi-file selection, allowing users to upload many KML files at once (e.g. 100+). All files are uploaded concurrently, and the button shows an "Uploading N..." indicator during the batch.

### Fixed
- **KML upload crash on HTTP** — Fixed `crypto.randomUUID is not a function` error when uploading KML files over a non-secure (HTTP) context by using the existing `generateUUID()` fallback utility.

## [0.10.0] — 2026-06-28

### Added
- **KML file storage** — Uploaded KML files are now persisted on the server (SQLite metadata + disk storage inside the Docker volume), making them available to all connected users across sessions and restarts.
- **KML Picker sidebar tab** — Clicking the KML button opens a dedicated picker tab with a search bar, proximity-sorted file list, upload button, per-file delete, and a clear selection button that reverts to the heatmap layer. KML files are automatically sorted by geographic proximity to the current RSSI readings data.

### Fixed
- **Colour spectrum save crash** — Fixed a `TypeError: SQLite3 can only bind booleans` error when saving colour spectrum or symbol size settings, caused by the `symbolsLocked` boolean not being coerced to an integer before binding.
- **Express JSON body limit** — Increased the default 100KB JSON body limit to 10MB, allowing KML file uploads (typically 150–300KB) to succeed.

## [0.9.0] — 2026-06-27

### Added
- **Symbol lock toggle** — A lock/unlock button in the Symbols tab prevents all symbol movement on the map when engaged. Dragging existing symbols and placing new ones from the palette are both disabled while locked. Lock state is persisted to the database across refreshes and restarts.

## [0.8.0] — 2026-06-27

### Added
- **Colour spectrum database persistence** — Custom colour spectrum settings (enabled state, stops, colours, labels) are now saved to the SQLite database, persisting across page refreshes, different browsers/devices, and Docker restarts. Previously stored in browser localStorage only.
- **Unbounded lowest colour range** — The lowest signal quality band no longer has a fixed lower bound. Displays as `≤ -106 dBm` instead of `-110 to -106 dBm`, meaning any signal at or below that threshold is always captured by the worst-signal colour. Adding, removing, or splitting stops preserves the unbounded behaviour on the lowest band.

## [0.7.0] — 2026-06-26

### Fixed
- **Mapbox incidents tileset 404 errors** — Redirected requests to the `mapbox-incidents-v1` tileset (requires a paid plan) to an empty response via `transformRequest`, eliminating console 404 spam on every map render.
- **KML label outline warning** — Added `fontSettings: { sdf: true }` to deck.gl TextLayer for KML labels, fixing the `fontSettings.sdf is required to render outline` console warning.

## [0.6.0] — 2026-06-26

### Added
- **Notes legend in PDF preview** — A new "Notes" panel appears at the bottom-right of the PDF report showing each note's colour indicator, title, and description. The panel is height-matched to the left-side legends for a uniform layout. Only renders when notes exist.

## [0.5.0] — 2026-06-26

### Fixed
- **Note areas missing in PDF preview without KML** — Notes with polygon areas now display their standard filled zones in the PDF preview when no KML file is loaded. When a KML is loaded, only the clipped KML intersection highlights are shown (unchanged behaviour).

## [0.4.0] — 2026-06-25

### Fixed
- **KML layers not styled in report mode** — Loading a KML file while the PDF Viewer is already open now correctly colours Lines and Turns layers black.
- **KML data disappearing on report close** — Closing the PDF Viewer after loading a KML file during report mode no longer wipes the KML layer data from the main map.

## [0.3.0] — 2026-06-25

### Added
- **Version indicator** — App version now displayed in the Settings tab footer.

## [0.2.0] — 2026-06-25

### Added
- **Note zone KML highlighting** — KML polygons (sectors) and lines that intersect note zones are now visually highlighted with clipped fills, coloured borders, and diagonal hatch patterns.
- **Geometry clipping utilities** — `clipLineToPolygon`, `clipPolygonToPolygon` (Sutherland-Hodgman), `segmentsIntersect`, and `lineLineIntersection` in `kml.ts`.
- **UUID fallback** — New `generateUUID()` utility for non-secure (HTTP) contexts where `crypto.randomUUID()` is unavailable.
- **Report tab panels** — Customise and KML Layers panels now available in the report sidebar tab.

### Changed
- **Report mode style management** — Entering report mode switches to `light-v11` map style and sets KML Lines/Turns layers to black; exiting restores previous styles.
- Replaced all `crypto.randomUUID()` calls with `generateUUID()`.
- Added `zoom` and `reportMode` to `LayerBuildParams` interface.

## [0.1.0]

### Added
- Initial release with RSSI heatmap visualisation, KML overlay, notes, symbols, PDF report generation, and TetraFlex LogServer integration.
