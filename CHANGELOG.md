# Changelog

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
