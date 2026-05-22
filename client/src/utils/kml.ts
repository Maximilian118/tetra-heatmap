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

/* Find the nearest point on a segment to a query point, returning distance and projected coords */
function nearestPointOnSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
  cosLat: number
): { distance: number; nearestLng: number; nearestLat: number; segDx: number; segDy: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  let t: number;
  if (lenSq === 0) {
    t = 0;
  } else {
    t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }

  const nearestLng = ax + t * dx;
  const nearestLat = ay + t * dy;
  const distance = fastDistance(py, px, nearestLat, nearestLng, cosLat);

  return { distance, nearestLng, nearestLat, segDx: dx, segDy: dy };
}

/* Find the anchor point for a label on a set of line segments (nearest point on any segment).
   Returns null if no segments are provided. */
function findAnchorOnSegments(
  px: number, py: number, cosLat: number,
  segments: { ax: number; ay: number; bx: number; by: number }[]
): { lng: number; lat: number } | null {
  if (segments.length === 0) return null;

  let bestDist = Infinity;
  let bestLng = px;
  let bestLat = py;

  for (const seg of segments) {
    const result = nearestPointOnSegment(px, py, seg.ax, seg.ay, seg.bx, seg.by, cosLat);
    if (result.distance < bestDist) {
      bestDist = result.distance;
      bestLng = result.nearestLng;
      bestLat = result.nearestLat;
    }
  }

  return { lng: bestLng, lat: bestLat };
}

/* Reposition point labels to sit at a consistent offset from the track.
   Strategy per label:
   1. If sameFolderLines has segments → anchor = nearest point on those (same-folder match)
   2. Else → anchor = nearest point on sector polygon boundaries (track edges)
   3. If neither found → keep original position
   The label is then placed at offsetMeters along the ray from anchor toward the original position. */
export function repositionLabels(
  points: KmlPoint[],
  sameFolderLines: KmlLine[],
  sectorPolygons: KmlPolygon[],
  offsetMeters: number
): [number, number][] {
  /* Pre-flatten same-folder line segments */
  const sfSegments: { ax: number; ay: number; bx: number; by: number }[] = [];
  for (const line of sameFolderLines) {
    const coords = line.coordinates;
    for (let i = 0; i < coords.length - 1; i++) {
      sfSegments.push({ ax: coords[i][0], ay: coords[i][1], bx: coords[i + 1][0], by: coords[i + 1][1] });
    }
  }

  /* Pre-flatten sector polygon boundary segments */
  const polySegments: { ax: number; ay: number; bx: number; by: number }[] = [];
  for (const poly of sectorPolygons) {
    const ring = poly.coordinates;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      polySegments.push({ ax: ring[j][0], ay: ring[j][1], bx: ring[i][0], by: ring[i][1] });
    }
  }

  return points.map((p) => {
    const [px, py] = p.coordinates;
    const cosLat = Math.cos(py * DEG_TO_RAD);

    /* Strategy 1: same-folder line segments */
    let anchor = findAnchorOnSegments(px, py, cosLat, sfSegments);

    /* Strategy 2: nearest point on sector polygon boundaries (track edges) */
    if (!anchor) {
      anchor = findAnchorOnSegments(px, py, cosLat, polySegments);
    }

    /* No anchor found — keep original position */
    if (!anchor) return p.coordinates;

    /* Direction from anchor toward original label position */
    let dirLng = px - anchor.lng;
    let dirLat = py - anchor.lat;

    /* Normalise to unit length in metres */
    const dirLenM = METRES_PER_DEG_LAT * Math.sqrt(
      (dirLng * cosLat) * (dirLng * cosLat) + dirLat * dirLat
    );

    /* Label sits exactly on the anchor — keep original position */
    if (dirLenM < 0.01) return p.coordinates;

    dirLng /= dirLenM;
    dirLat /= dirLenM;

    /* Extra offset for longer labels — text is centre-anchored so half extends back toward track */
    const lengthBonus = Math.max(0, p.name.length - 2) * 3;
    const effectiveOffset = offsetMeters + lengthBonus;

    /* Place label at effectiveOffset along the ray from anchor toward original position */
    const offLng = anchor.lng + dirLng * effectiveOffset;
    const offLat = anchor.lat + dirLat * effectiveOffset;

    return [offLng, offLat] as [number, number];
  });
}

/* Push overlapping labels apart so nearby labels from different folders don't collide.
   Mutates the posMap in place. Runs a few iterations of pairwise repulsion. */
export function separateOverlappingLabels(
  posMap: Map<KmlPoint, [number, number]>,
  minSeparationMeters: number
): void {
  if (posMap.size < 2) return;

  /* Snapshot entries into an indexed array for pairwise comparison */
  const entries = Array.from(posMap.entries()).map(([point, pos]) => ({
    point,
    lng: pos[0],
    lat: pos[1],
  }));

  const n = entries.length;

  /* 3 iterations is enough to resolve chain collisions in typical KML data */
  for (let iter = 0; iter < 3; iter++) {
    for (let i = 0; i < n; i++) {
      const a = entries[i];
      const cosLat = Math.cos(a.lat * DEG_TO_RAD);

      for (let j = i + 1; j < n; j++) {
        const b = entries[j];
        const dist = fastDistance(a.lat, a.lng, b.lat, b.lng, cosLat);

        if (dist >= minSeparationMeters || dist < 0.01) continue;

        /* Push both labels apart equally along their connecting vector */
        const half = (minSeparationMeters - dist) / 2;
        let dx = b.lng - a.lng;
        let dy = b.lat - a.lat;
        const len = Math.sqrt(dx * dx + dy * dy);

        /* Convert half (metres) to degrees for the nudge */
        const nudgeDeg = half / METRES_PER_DEG_LAT;
        dx = (dx / len) * nudgeDeg;
        dy = (dy / len) * nudgeDeg;

        a.lng -= dx;
        a.lat -= dy;
        b.lng += dx;
        b.lat += dy;
      }
    }
  }

  /* Write resolved positions back into the map */
  for (const e of entries) {
    posMap.set(e.point, [e.lng, e.lat]);
  }
}

/* GeoJSON types used for the deck.gl GeoJsonLayer */
export interface KmlGeoJsonProperties {
  name: string;
  medianRssi: number | null;
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

/* Compute the median of a pre-sorted numeric array */
function median(sorted: number[]): number {
  const mid = sorted.length >> 1;
  return sorted.length & 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/* Build coloured GeoJSON and collect scope-filtered readings in a single pass.
   Each polygon is coloured by the median RSSI of readings within scopeMeters.
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

  /* Per-polygon RSSI value collectors */
  const rssiArrays: number[][] = polygons.map(() => []);

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
        rssiArrays[pi].push(r.rssi);
        if (inScope) inScope[ri] = 1;
      }
    }
  }

  /* Build GeoJSON features — sort each polygon's readings to derive median/min/max */
  const features: GeoJsonFeature[] = polygons.map((poly, i) => {
    const arr = rssiArrays[i];
    if (arr.length === 0) {
      return {
        type: "Feature",
        properties: { name: poly.name, medianRssi: null, minRssi: null, maxRssi: null, count: 0, color: NO_DATA_COLOR },
        geometry: { type: "Polygon", coordinates: [poly.coordinates] },
      };
    }

    arr.sort((a, b) => a - b);
    const medianRssi = median(arr);
    const minRssi = arr[0];
    const maxRssi = arr[arr.length - 1];
    /* Use fully opaque fills so the deck.gl opacity prop has full control */
    const raw = rssiToColor(medianRssi);
    const color: [number, number, number, number] = [raw[0], raw[1], raw[2], 255];

    return {
      type: "Feature",
      properties: { name: poly.name, medianRssi, minRssi, maxRssi, count: arr.length, color },
      geometry: { type: "Polygon", coordinates: [poly.coordinates] },
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
