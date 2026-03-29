import type { Reading } from "./api";
import type { FeatureCollection, Point } from "geojson";

/* Properties attached to each GeoJSON feature for MapBox data-driven styling */
export interface ReadingProperties {
  rssi: number;
  timestamp: string;
  ssi: number;
  positionError: number | null;
}

/* Convert an array of API readings into a GeoJSON FeatureCollection.
   Readings without a valid RSSI value are excluded since they can't be visualised. */
export const readingsToGeoJSON = (
  readings: Reading[]
): FeatureCollection<Point, ReadingProperties> => ({
  type: "FeatureCollection",
  features: readings
    .filter((r) => r.rssi !== null)
    .map((r) => ({
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [r.longitude, r.latitude],
      },
      properties: {
        rssi: r.rssi as number,
        timestamp: r.timestamp,
        ssi: r.ssi,
        positionError: r.position_error,
      },
    })),
});

/* Compute a [west, south, east, north] bounding box from readings.
   Returns null if the array is empty. */
export const readingsBounds = (
  readings: Reading[]
): [number, number, number, number] | null => {
  if (readings.length === 0) return null;

  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const r of readings) {
    if (r.longitude < west) west = r.longitude;
    if (r.longitude > east) east = r.longitude;
    if (r.latitude < south) south = r.latitude;
    if (r.latitude > north) north = r.latitude;
  }

  return [west, south, east, north];
};
