import type { Reading, Subscriber } from "./api";

/* Version identifier for the dataset file format */
const FORMAT_VERSION = 1;

/* Saved map viewport included in the dataset file */
export interface SavedViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  bearing: number;
  pitch: number;
}

/* Shape of the exported JSON file */
interface DatasetEnvelope {
  version: number;
  exportedAt: string;
  readingCount: number;
  readings: Reading[];
  viewState?: SavedViewState;
  mapStyle?: string;
  subscribers?: Subscriber[];
}

/* What loadDataset returns — readings plus optional view/style/subscriber metadata */
export interface DatasetResult {
  readings: Reading[];
  viewState?: SavedViewState;
  mapStyle?: string;
  subscribers?: Subscriber[];
}

/* Build a zero-padded date string for the default filename */
const datestamp = (): string => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/* Trigger a browser file download with the given readings as a JSON file */
export const saveDataset = (
  readings: Reading[],
  viewState?: SavedViewState,
  mapStyle?: string,
  subscribers?: Subscriber[],
): void => {
  const envelope: DatasetEnvelope = {
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    readingCount: readings.length,
    readings,
    viewState,
    mapStyle,
    subscribers,
  };

  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `tetra-heatmap-${datestamp()}.json`;
  a.click();

  URL.revokeObjectURL(url);
};

/* Per-SSI stats accumulated when deriving subscriber entries from readings */
interface DerivedStats {
  count: number;
  lastTs: string;
  lastLat: number;
  lastLon: number;
}

/* Result from deriveSubscribersFromReadings — subscribers plus coordinates that need geocoding */
export interface DerivedSubscribers {
  subscribers: Subscriber[];
  toGeocode: { index: number; latitude: number; longitude: number }[];
}

/* Derive basic subscriber entries from readings when a save file has no subscriber data.
   Groups readings by SSI, computes count + last reading timestamp, and identifies
   entries that need their last location geocoded. */
export const deriveSubscribersFromReadings = (readings: Reading[]): DerivedSubscribers => {
  const statsMap = new Map<number, DerivedStats>();
  for (const r of readings) {
    const existing = statsMap.get(r.ssi);
    if (!existing) {
      statsMap.set(r.ssi, { count: 1, lastTs: r.timestamp, lastLat: r.latitude, lastLon: r.longitude });
    } else {
      existing.count++;
      if (r.timestamp > existing.lastTs) {
        existing.lastTs = r.timestamp;
        existing.lastLat = r.latitude;
        existing.lastLon = r.longitude;
      }
    }
  }

  const subscribers: Subscriber[] = [];
  const toGeocode: { index: number; latitude: number; longitude: number }[] = [];

  for (const [ssi, stats] of statsMap) {
    subscribers.push({
      ssi,
      description: "",
      organisation_id: null,
      organisation: "",
      profile_id: null,
      profile_name: "",
      readings_count: stats.count,
      last_reading: stats.lastTs,
      last_location: null,
    });
    toGeocode.push({ index: subscribers.length - 1, latitude: stats.lastLat, longitude: stats.lastLon });
  }

  return { subscribers, toGeocode };
};

/* Validate that a reading has the minimum required fields */
const isValidReading = (r: unknown): r is Reading => {
  if (typeof r !== "object" || r === null) return false;
  const obj = r as Record<string, unknown>;
  return (
    typeof obj.id === "number" &&
    typeof obj.timestamp === "string" &&
    typeof obj.ssi === "number" &&
    typeof obj.latitude === "number" &&
    typeof obj.longitude === "number"
  );
};

/* Read a JSON dataset file and return validated readings with optional view metadata */
export const loadDataset = (file: File): Promise<DatasetResult> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as DatasetEnvelope;

        if (!Array.isArray(parsed.readings)) {
          throw new Error("Invalid dataset: missing readings array");
        }

        /* Validate every reading in the file */
        const invalid = parsed.readings.findIndex((r) => !isValidReading(r));
        if (invalid !== -1) {
          throw new Error(`Invalid reading at index ${invalid}: missing required fields`);
        }

        resolve({
          readings: parsed.readings,
          viewState: parsed.viewState,
          mapStyle: parsed.mapStyle,
          subscribers: parsed.subscribers,
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Failed to parse dataset file"));
      }
    };

    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
