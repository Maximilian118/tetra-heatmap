import type { Reading } from "./api";

/* RSSI normalisation range based on TETRA signal quality standards.
   -110 dBm: just below Rx sensitivity / radio link failure (-105 to -109)
   -20 dBm:  BS422 RSSI dynamic range ceiling */
export const RSSI_MIN = -110;
export const RSSI_MAX = -20;
const RSSI_RANGE = RSSI_MAX - RSSI_MIN;

/* Normalise RSSI from [-110, -20] → [0, 1] */
export const normalizeRssi = (rssi: number) =>
  Math.max(0, Math.min(1, (rssi - RSSI_MIN) / RSSI_RANGE));

/* V-shaped elevation weight for HexagonLayer — returns 0 at the deep green
   sweet spot (normalised 0.75 ≈ -42 dBm) and 1.0 at both extremes:
   near-black red (unusable, 0.0) and blue (over-strong, 1.0).
   Makes bad signal zones tall and good zones flat. */
const ELEVATION_CENTER = 0.55;
export const rssiElevationWeight = (rssi: number): number => {
  const n = normalizeRssi(rssi);
  return n <= ELEVATION_CENTER
    ? (ELEVATION_CENTER - n) / ELEVATION_CENTER
    : (n - ELEVATION_CENTER) / (1 - ELEVATION_CENTER);
};

/* Pick an RGB colour from RSSI_COLOR_RANGE based on a normalised [0,1] value */
export const rssiToColor = (rssi: number): [number, number, number, number] => {
  const t = normalizeRssi(rssi);
  const idx = Math.min(Math.floor(t * (RSSI_COLOR_RANGE.length - 1)), RSSI_COLOR_RANGE.length - 1);
  const [r, g, b] = RSSI_COLOR_RANGE[idx];
  return [r, g, b, 200];
};

/* Map RSSI to a human-readable signal quality label aligned with the colour ramp */
export const rssiQualityLabel = (rssi: number): string => {
  if (rssi >= -35) return "Over-strong";
  if (rssi >= -55) return "Strong";
  if (rssi >= -75) return "Adequate";
  if (rssi >= -90) return "Marginal";
  if (rssi >= -105) return "Weak";
  return "Unusable";
};

/* A single line segment connecting two consecutive positions from the same radio */
export interface LineSegment {
  sourcePosition: [number, number];
  targetPosition: [number, number];
  rssi: number;
}

/* Build line segments from readings, grouped by SSI (radio identity).
   Each radio's readings are sorted by timestamp and consecutive pairs
   become line segments coloured by the destination reading's RSSI. */
export const buildLineSegments = (readings: Reading[]): LineSegment[] => {
  /* Group readings by radio SSI */
  const bySSI = new Map<number, Reading[]>();
  for (const r of readings) {
    const group = bySSI.get(r.ssi);
    if (group) group.push(r);
    else bySSI.set(r.ssi, [r]);
  }

  const segments: LineSegment[] = [];

  /* For each radio, sort by timestamp and connect consecutive positions */
  for (const group of bySSI.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    for (let i = 1; i < group.length; i++) {
      const prev = group[i - 1];
      const curr = group[i];
      segments.push({
        sourcePosition: [prev.longitude, prev.latitude],
        targetPosition: [curr.longitude, curr.latitude],
        rssi: curr.rssi!,
      });
    }
  }

  return segments;
};

/* A continuous path for a single radio, with per-vertex RSSI colouring */
export interface RadioPath {
  ssi: number;
  path: [number, number][];
  colors: [number, number, number, number][];
}

/* Build continuous paths from readings, one per radio (SSI).
   Each radio's readings are sorted by timestamp and joined into a single
   polyline with per-vertex colours derived from the RSSI at each point. */
export const buildPaths = (readings: Reading[]): RadioPath[] => {
  /* Group readings by radio SSI */
  const bySSI = new Map<number, Reading[]>();
  for (const r of readings) {
    const group = bySSI.get(r.ssi);
    if (group) group.push(r);
    else bySSI.set(r.ssi, [r]);
  }

  const paths: RadioPath[] = [];

  /* For each radio, sort by timestamp and build a single path */
  for (const [ssi, group] of bySSI.entries()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    paths.push({
      ssi,
      path: group.map((r) => [r.longitude, r.latitude]),
      colors: group.map((r) => rssiToColor(r.rssi!)),
    });
  }

  return paths;
};

/* 21-stop colour ramp calibrated to TETRA signal quality thresholds.
   Each stop spans ~4.5 dB across -110 to -20 dBm.
   Red (unusable) → orange (adequate) → green (strong) → blue (over-strong).
   Green dominates the ramp since most usable signals fall in -70 to -35 dBm.
   Transition from green to gold occurs at ~-75 dBm. */
export const RSSI_COLOR_RANGE: [number, number, number][] = [
  [ 80,   0,   0],  // ~-110 — near-black red (unusable)
  [110,   0,   5],  // ~-106 — very dark crimson
  [140,  10,  15],  // ~-101 — dark crimson
  [178,  24,  43],  // ~-97  — deep red (-95 ≈ very deep red)
  [210,  40,  25],  // ~-93  — red (-90 ≈ red)
  [230,  70,  10],  // ~-88  — red-orange (-85 ≈ deep orange)
  [255, 120,   0],  // ~-83  — orange
  [255, 165,   0],  // ~-79  — amber/gold
  [200, 210,   0],  // ~-74  — gold-green (-75 transition)
  [140, 215,  20],  // ~-70  — yellow-green
  [100, 210,  40],  // ~-65  — lime green
  [ 70, 200,  50],  // ~-61  — light green
  [ 50, 190,  50],  // ~-56  — green
  [ 40, 175,  45],  // ~-52  — medium green
  [ 34, 160,  40],  // ~-47  — rich green
  [ 30, 145,  35],  // ~-43  — deep green
  [ 25, 130,  30],  // ~-38  — forest green
  [ 25, 125,  70],  // ~-34  — teal-green (over-strong transition)
  [ 30, 115, 130],  // ~-29  — teal
  [ 30, 100, 185],  // ~-25  — steel blue
  [ 30,  80, 220],  // ~-20  — blue (over-strong)
];
