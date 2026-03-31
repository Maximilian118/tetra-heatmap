import type { Reading } from "./api";

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
}

/* What loadDataset returns — readings plus optional view/style metadata */
export interface DatasetResult {
  readings: Reading[];
  viewState?: SavedViewState;
  mapStyle?: string;
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
): void => {
  const envelope: DatasetEnvelope = {
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    readingCount: readings.length,
    readings,
    viewState,
    mapStyle,
  };

  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `tetra-heatmap-${datestamp()}.json`;
  a.click();

  URL.revokeObjectURL(url);
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
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Failed to parse dataset file"));
      }
    };

    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
