import type { Reading } from "./api";

/* Pre-computed bounding box for fast spatial rejection */
interface Bbox {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

/* Parsed point placemark from a KML file */
export interface KmlPoint {
  name: string;
  coordinates: [number, number]; // [lng, lat]
}

/* Parsed linestring placemark from a KML file */
export interface KmlLine {
  name: string;
  coordinates: [number, number][]; // [lng, lat][]
}

/* Parsed polygon from a KML file, with pre-computed spatial data */
export interface KmlPolygon {
  name: string;
  coordinates: [number, number][]; // [lng, lat] closed ring
  bbox: Bbox;
  cosLat: number; // cos(centroid latitude) for equirectangular distance
}

/* A KML folder containing placemarks grouped by geometry type */
export interface KmlFolder {
  name: string;
  points: KmlPoint[];
  lines: KmlLine[];
  polygons: KmlPolygon[];
}

/* Parsed KML document containing all folder layers */
export interface KmlData {
  name: string; // filename for display
  folders: KmlFolder[];
}

/* Per-layer styling state for sidebar controls */
export interface KmlLayerStyle {
  visible: boolean;
  color: [number, number, number]; // RGB for lines/points
  width: number; // line width (px)
}

/* Default palette for overlay layer colors (rotated per folder) */
const LAYER_PALETTE: [number, number, number][] = [
  [255, 255, 255], // white
  [255, 204, 0],   // yellow
  [255, 102, 51],  // orange
  [0, 204, 255],   // cyan
  [255, 51, 102],  // pink
  [102, 255, 51],  // lime
  [204, 102, 255], // purple
  [255, 153, 51],  // amber
];

/* Build default layer styles for all folders — rotating palette colors */
export function getDefaultKmlLayerStyles(folders: KmlFolder[]): Record<string, KmlLayerStyle> {
  const styles: Record<string, KmlLayerStyle> = {};
  let colorIdx = 0;

  for (const folder of folders) {
    const hasPolygons = folder.polygons.length > 0;
    styles[folder.name] = {
      visible: true,
      color: hasPolygons ? [80, 80, 80] : folder.name === "Lines" ? [255, 255, 255] : LAYER_PALETTE[colorIdx++ % LAYER_PALETTE.length],
      width: hasPolygons ? 1 : 2,
    };
  }

  return styles;
}

/* Earth radius in metres */
const EARTH_RADIUS = 6_371_000;

/* Degrees-to-radians multiplier */
const DEG_TO_RAD = Math.PI / 180;

/* Metres per degree of latitude (constant) */
const METRES_PER_DEG_LAT = EARTH_RADIUS * DEG_TO_RAD;

/* Compute bounding box and cosLat for a coordinate ring */
function computeSpatialData(coords: [number, number][]): { bbox: Bbox; cosLat: number } {
  let minLng = Infinity, maxLng = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;

  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const midLat = (minLat + maxLat) / 2;
  return { bbox: { minLng, maxLng, minLat, maxLat }, cosLat: Math.cos(midLat * DEG_TO_RAD) };
}

/* Parse coordinate text from a KML element into [lng, lat] tuples */
function parseCoordinateText(text: string): [number, number][] {
  return text
    .split(/\s+/)
    .filter((s) => s.length > 0)
    .map((s) => {
      const [lng, lat] = s.split(",").map(Number);
      return [lng, lat] as [number, number];
    })
    .filter(([lng, lat]) => !isNaN(lng) && !isNaN(lat));
}

/* Extract placemarks from a DOM element, classifying by geometry type */
function extractPlacemarks(
  container: Element,
  directOnly: boolean
): { points: KmlPoint[]; lines: KmlLine[]; polygons: KmlPolygon[] } {
  const points: KmlPoint[] = [];
  const lines: KmlLine[] = [];
  const polygons: KmlPolygon[] = [];

  /* Get placemarks — either direct children or all descendants */
  const placemarks = directOnly
    ? Array.from(container.children).filter((el) => el.tagName === "Placemark")
    : Array.from(container.querySelectorAll("Placemark"));

  for (const pm of placemarks) {
    const name = pm.querySelector("name")?.textContent?.trim() ?? "Unnamed";

    /* Check for polygon geometry */
    const polygon = pm.querySelector("Polygon");
    if (polygon) {
      const coordsText =
        polygon.querySelector("outerBoundaryIs coordinates")?.textContent?.trim() ??
        polygon.querySelector("coordinates")?.textContent?.trim();
      if (coordsText) {
        const coordinates = parseCoordinateText(coordsText);
        if (coordinates.length >= 3) {
          const { bbox, cosLat } = computeSpatialData(coordinates);
          polygons.push({ name, coordinates, bbox, cosLat });
        }
      }
      continue;
    }

    /* Check for linestring geometry */
    const lineString = pm.querySelector("LineString");
    if (lineString) {
      const coordsText = lineString.querySelector("coordinates")?.textContent?.trim();
      if (coordsText) {
        const coordinates = parseCoordinateText(coordsText);
        if (coordinates.length >= 2) {
          lines.push({ name, coordinates });
        }
      }
      continue;
    }

    /* Check for point geometry */
    const point = pm.querySelector("Point");
    if (point) {
      const coordsText = point.querySelector("coordinates")?.textContent?.trim();
      if (coordsText) {
        const coords = parseCoordinateText(coordsText);
        if (coords.length >= 1) {
          points.push({ name, coordinates: coords[0] });
        }
      }
    }
  }

  return { points, lines, polygons };
}

/* Parse a KML XML string and extract all folder layers with their placemarks */
export function parseKml(xmlString: string, filename: string): KmlData {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");
  const allFolders = doc.querySelectorAll("Folder");
  const folders: KmlFolder[] = [];

  /* Process each folder — collect only direct child placemarks to avoid
     double-counting when folders are nested */
  allFolders.forEach((folderEl) => {
    const name = folderEl.querySelector(":scope > name")?.textContent?.trim() ?? "Unnamed";
    const { points, lines, polygons } = extractPlacemarks(folderEl, true);

    /* Skip empty container folders (e.g. top-level "Miami" wrapper) */
    if (points.length === 0 && lines.length === 0 && polygons.length === 0) return;

    /* Skip folders not useful for visualisation */
    if (name === "Riflag" || name === "Track") return;

    /* Filter out DRS and pit lane placemarks from any folder */
    const isFiltered = (n: string) =>
      /^(Line)?(Drs|DRS|Pit|PIT)/i.test(n) || /^(DRS |PIT_)/i.test(n) ||
      /^(Line)?SpeedTrap/i.test(n) || n === "T";
    const filteredPoints = points.filter((p) => !isFiltered(p.name));
    const filteredLines = lines.filter((l) => !isFiltered(l.name));

    /* Polygon folders don't need their label points rendered (e.g. sector numbers) */
    const folderPoints = polygons.length > 0 ? [] : filteredPoints;

    /* Skip if everything was filtered out */
    if (folderPoints.length === 0 && filteredLines.length === 0 && polygons.length === 0) return;

    folders.push({ name, points: folderPoints, lines: filteredLines, polygons });
  });

  /* Fallback: if no folders exist, treat all document placemarks as one layer */
  if (folders.length === 0) {
    const { points, lines, polygons } = extractPlacemarks(doc.documentElement, false);
    if (points.length > 0 || lines.length > 0 || polygons.length > 0) {
      const docName = filename.replace(/\.kml$/i, "");
      folders.push({ name: docName, points, lines, polygons });
    }
  }

  return { name: filename, folders };
}

/* Equirectangular distance approximation — accurate at track scale (<10 km),
   ~10× faster than haversine (1 sqrt vs 6 trig calls) */
function fastDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  cosLat: number
): number {
  const dx = (lon2 - lon1) * cosLat;
  const dy = lat2 - lat1;
  return METRES_PER_DEG_LAT * Math.sqrt(dx * dx + dy * dy);
}

/* Ray-casting point-in-polygon test. Point and ring are [lng, lat]. */
function pointInPolygon(
  px: number,
  py: number,
  ring: [number, number][]
): boolean {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}

/* Fast distance from a point to a line segment (a->b).
   Uses equirectangular projection with pre-computed cosLat. */
function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cosLat: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  /* Degenerate segment */
  if (lenSq === 0) return fastDistance(py, px, ay, ax, cosLat);

  /* Project point onto segment, clamped to [0, 1] */
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;

  return fastDistance(py, px, ay + t * dy, ax + t * dx, cosLat);
}

/* Check if a point is within scopeMeters of a polygon.
   Returns true as soon as any edge is close enough (early-out). */
function isWithinScope(
  px: number,
  py: number,
  poly: KmlPolygon,
  scopeMeters: number
): boolean {
  const ring = poly.coordinates;

  /* Point inside the polygon is always within scope */
  if (pointInPolygon(px, py, ring)) return true;

  /* Check each edge — early-out as soon as one is within scope */
  const cosLat = poly.cosLat;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const d = distanceToSegment(px, py, ring[j][0], ring[j][1], ring[i][0], ring[i][1], cosLat);
    if (d <= scopeMeters) return true;
  }

  return false;
}

/* GeoJSON types used for the deck.gl GeoJsonLayer */
export interface KmlGeoJsonProperties {
  name: string;
  meanRssi: number | null;
  minRssi: number | null;
  maxRssi: number | null;
  count: number;
  color: [number, number, number, number];
}

interface GeoJsonFeature {
  type: "Feature";
  properties: KmlGeoJsonProperties;
  geometry: {
    type: "Polygon";
    coordinates: [number, number][][];
  };
}

export interface KmlGeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

/* Combined result from a single pass over readings */
export interface KmlResult {
  geoJson: KmlGeoJsonFeatureCollection;
  scopeReadings: Reading[];
}

/* Build coloured GeoJSON and collect scope-filtered readings in a single pass.
   Each polygon is coloured by the mean RSSI of readings within scopeMeters.
   Bounding box pre-filter + equirectangular distance + early-out make this fast. */
export function buildKmlResult(
  polygons: KmlPolygon[],
  readings: Reading[],
  scopeMeters: number,
  rssiToColor: (rssi: number) => [number, number, number, number],
  collectReadings: boolean
): KmlResult {
  /* No-data fill — fully opaque dark grey so opacity slider controls visibility */
  const NO_DATA_COLOR: [number, number, number, number] = [60, 60, 60, 255];

  /* Convert scope to degree offset for bbox pre-filter.
     Use worst-case (equator) cosLat=1 so the offset is generous enough at all latitudes. */
  const scopeDeg = scopeMeters / METRES_PER_DEG_LAT;

  /* Per-polygon accumulators */
  const rssiSums = new Float64Array(polygons.length);
  const counts = new Uint32Array(polygons.length);
  const rssiMins = new Float64Array(polygons.length).fill(Infinity);
  const rssiMaxs = new Float64Array(polygons.length).fill(-Infinity);

  /* Track which readings are within scope of any polygon (avoid Set overhead) */
  const inScope = collectReadings ? new Uint8Array(readings.length) : null;

  /* Single pass over all readings */
  for (let ri = 0; ri < readings.length; ri++) {
    const r = readings[ri];
    if (r.rssi === null) continue;

    const px = r.longitude;
    const py = r.latitude;

    for (let pi = 0; pi < polygons.length; pi++) {
      const poly = polygons[pi];
      const bb = poly.bbox;

      /* Bounding box pre-filter — skip if clearly outside expanded bbox */
      if (
        px < bb.minLng - scopeDeg ||
        px > bb.maxLng + scopeDeg ||
        py < bb.minLat - scopeDeg ||
        py > bb.maxLat + scopeDeg
      ) continue;

      /* Detailed check */
      if (isWithinScope(px, py, poly, scopeMeters)) {
        rssiSums[pi] += r.rssi;
        counts[pi]++;
        if (r.rssi < rssiMins[pi]) rssiMins[pi] = r.rssi;
        if (r.rssi > rssiMaxs[pi]) rssiMaxs[pi] = r.rssi;
        if (inScope) inScope[ri] = 1;
      }
    }
  }

  /* Build GeoJSON features from accumulators */
  const features: GeoJsonFeature[] = polygons.map((poly, i) => {
    const meanRssi = counts[i] > 0 ? rssiSums[i] / counts[i] : null;
    const minRssi = counts[i] > 0 ? rssiMins[i] : null;
    const maxRssi = counts[i] > 0 ? rssiMaxs[i] : null;
    /* Use fully opaque fills so the deck.gl opacity prop has full control */
    const raw = meanRssi !== null ? rssiToColor(meanRssi) : NO_DATA_COLOR;
    const color: [number, number, number, number] = [raw[0], raw[1], raw[2], 255];

    return {
      type: "Feature",
      properties: { name: poly.name, meanRssi, minRssi, maxRssi, count: counts[i], color },
      geometry: {
        type: "Polygon",
        coordinates: [poly.coordinates],
      },
    };
  });

  /* Collect scope readings if requested */
  const scopeReadings: Reading[] = [];
  if (inScope) {
    for (let ri = 0; ri < readings.length; ri++) {
      if (inScope[ri]) scopeReadings.push(readings[ri]);
    }
  }

  return {
    geoJson: { type: "FeatureCollection", features },
    scopeReadings,
  };
}
