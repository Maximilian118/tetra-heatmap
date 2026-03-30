/* RSSI normalisation range based on TETRA signal quality standards.
   -110 dBm: just below Rx sensitivity / radio link failure (-105 to -109)
   -20 dBm:  BS422 RSSI dynamic range ceiling */
export const RSSI_MIN = -110;
export const RSSI_MAX = -20;
const RSSI_RANGE = RSSI_MAX - RSSI_MIN;

/* Normalise RSSI from [-110, -20] → [0, 1] */
export const normalizeRssi = (rssi: number) =>
  Math.max(0, Math.min(1, (rssi - RSSI_MIN) / RSSI_RANGE));

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
