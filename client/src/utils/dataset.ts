import type { Reading, Subscriber, MapSymbol } from "./api";

/* ── Format versions ──────────────────────────────────────────────────── */

/* v2: gzip-compressed columnar JSON (.thm) */
const FORMAT_VERSION = 2;

/* Gzip magic bytes used to auto-detect compressed files */
const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

/* ── Public types ─────────────────────────────────────────────────────── */

/* Saved map viewport included in the dataset file */
export interface SavedViewState {
  longitude: number;
  latitude: number;
  zoom: number;
  bearing: number;
  pitch: number;
}

/* What loadDataset returns — readings plus optional view/style/subscriber/symbol metadata */
export interface DatasetResult {
  readings: Reading[];
  viewState?: SavedViewState;
  mapStyle?: string;
  subscribers?: Subscriber[];
  symbols?: MapSymbol[];
  symbolSize?: number;
}

/* ── Columnar types (v2 internal format) ──────────────────────────────── */

/* Readings stored as parallel arrays — one array per field */
interface ColumnarReadings {
  id: number[];
  ts: string[];
  ssi: number[];
  rssi: (number | null)[];
  msd: (number | null)[];
  lat: number[];
  lon: number[];
  pe: (number | null)[];
  vel: (number | null)[];
  dir: (number | null)[];
}

/* Subscribers stored as parallel arrays */
interface ColumnarSubscribers {
  ssi: number[];
  desc: string[];
  oid: (number | null)[];
  org: string[];
  pid: (number | null)[];
  pn: string[];
  rc: number[];
  lr: (string | null)[];
  ll: (string | null)[];
}

/* Abbreviated view state for the compressed envelope */
interface CompressedViewState {
  ln: number;
  lt: number;
  z: number;
  b: number;
  p: number;
}

/* Shape of the gzip-compressed JSON payload */
interface CompressedEnvelope {
  v: typeof FORMAT_VERSION;
  at: string;
  n: number;
  vs?: CompressedViewState;
  ms?: string;
  r: ColumnarReadings;
  s?: ColumnarSubscribers;
  sym?: MapSymbol[];
  ss?: number;
}

/* ── Legacy v1 types ──────────────────────────────────────────────────── */

/* Shape of the legacy JSON file */
interface LegacyEnvelope {
  version: number;
  exportedAt: string;
  readingCount: number;
  readings: Reading[];
  viewState?: SavedViewState;
  mapStyle?: string;
  subscribers?: Subscriber[];
}

/* ── Columnar conversion helpers ──────────────────────────────────────── */

/* Transpose an array of reading objects into parallel column arrays */
const readingsToColumnar = (readings: Reading[]): ColumnarReadings => {
  const n = readings.length;
  const cols: ColumnarReadings = {
    id: new Array(n),
    ts: new Array(n),
    ssi: new Array(n),
    rssi: new Array(n),
    msd: new Array(n),
    lat: new Array(n),
    lon: new Array(n),
    pe: new Array(n),
    vel: new Array(n),
    dir: new Array(n),
  };

  for (let i = 0; i < n; i++) {
    const r = readings[i];
    cols.id[i] = r.id;
    cols.ts[i] = r.timestamp;
    cols.ssi[i] = r.ssi;
    cols.rssi[i] = r.rssi;
    cols.msd[i] = r.ms_distance;
    cols.lat[i] = r.latitude;
    cols.lon[i] = r.longitude;
    cols.pe[i] = r.position_error;
    cols.vel[i] = r.velocity;
    cols.dir[i] = r.direction;
  }

  return cols;
};

/* Transpose parallel column arrays back into an array of reading objects */
const columnarToReadings = (cols: ColumnarReadings): Reading[] => {
  const n = cols.id.length;
  const readings: Reading[] = new Array(n);

  for (let i = 0; i < n; i++) {
    readings[i] = {
      id: cols.id[i],
      timestamp: cols.ts[i],
      ssi: cols.ssi[i],
      rssi: cols.rssi[i],
      ms_distance: cols.msd[i],
      latitude: cols.lat[i],
      longitude: cols.lon[i],
      position_error: cols.pe[i],
      velocity: cols.vel[i],
      direction: cols.dir[i],
    };
  }

  return readings;
};

/* Transpose an array of subscriber objects into parallel column arrays */
const subscribersToColumnar = (subs: Subscriber[]): ColumnarSubscribers => {
  const n = subs.length;
  const cols: ColumnarSubscribers = {
    ssi: new Array(n),
    desc: new Array(n),
    oid: new Array(n),
    org: new Array(n),
    pid: new Array(n),
    pn: new Array(n),
    rc: new Array(n),
    lr: new Array(n),
    ll: new Array(n),
  };

  for (let i = 0; i < n; i++) {
    const s = subs[i];
    cols.ssi[i] = s.ssi;
    cols.desc[i] = s.description;
    cols.oid[i] = s.organisation_id;
    cols.org[i] = s.organisation;
    cols.pid[i] = s.profile_id;
    cols.pn[i] = s.profile_name;
    cols.rc[i] = s.readings_count;
    cols.lr[i] = s.last_reading;
    cols.ll[i] = s.last_location;
  }

  return cols;
};

/* Transpose parallel column arrays back into an array of subscriber objects */
const columnarToSubscribers = (cols: ColumnarSubscribers): Subscriber[] => {
  const n = cols.ssi.length;
  const subs: Subscriber[] = new Array(n);

  for (let i = 0; i < n; i++) {
    subs[i] = {
      ssi: cols.ssi[i],
      description: cols.desc[i],
      organisation_id: cols.oid[i],
      organisation: cols.org[i],
      profile_id: cols.pid[i],
      profile_name: cols.pn[i],
      readings_count: cols.rc[i],
      last_reading: cols.lr[i],
      last_location: cols.ll[i],
    };
  }

  return subs;
};

/* ── Compression helpers (browser-native gzip) ────────────────────────── */

/* Compress a JSON string into a gzip blob using the browser CompressionStream API */
const compressToGzip = async (json: string): Promise<Blob> => {
  const blob = new Blob([json]);
  const stream = blob.stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
};

/* Decompress a gzip blob back into a JSON string using the browser DecompressionStream API */
const decompressFromGzip = async (blob: Blob): Promise<string> => {
  const stream = blob.stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).text();
};

/* ── Filename helpers ─────────────────────────────────────────────────── */

/* Build a zero-padded date string for the default filename */
const datestamp = (): string => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

/* ── Save ──────────────────────────────────────────────────────────────── */

/* Build a compressed .thm file and trigger a browser download */
export const saveDataset = async (
  readings: Reading[],
  viewState?: SavedViewState,
  mapStyle?: string,
  subscribers?: Subscriber[],
  symbols?: MapSymbol[],
  symbolSize?: number,
): Promise<void> => {
  /* Build the compressed columnar envelope */
  const envelope: CompressedEnvelope = {
    v: FORMAT_VERSION,
    at: new Date().toISOString(),
    n: readings.length,
    r: readingsToColumnar(readings),
  };

  /* Include view state with abbreviated keys */
  if (viewState) {
    envelope.vs = {
      ln: viewState.longitude,
      lt: viewState.latitude,
      z: viewState.zoom,
      b: viewState.bearing,
      p: viewState.pitch,
    };
  }

  if (mapStyle) envelope.ms = mapStyle;
  if (subscribers?.length) envelope.s = subscribersToColumnar(subscribers);
  if (symbols?.length) envelope.sym = symbols;
  if (symbolSize) envelope.ss = symbolSize;

  /* Serialize to compact JSON (no indentation) then gzip compress */
  const json = JSON.stringify(envelope);
  const compressed = await compressToGzip(json);

  /* Trigger browser download */
  const url = URL.createObjectURL(compressed);
  const a = document.createElement("a");
  a.href = url;
  a.download = `tetra-heatmap-${datestamp()}.thm`;
  a.click();
  URL.revokeObjectURL(url);
};

/* ── Load ──────────────────────────────────────────────────────────────── */

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

/* Parse a legacy v1 JSON envelope into a DatasetResult */
const parseLegacyEnvelope = (text: string): DatasetResult => {
  const parsed = JSON.parse(text) as LegacyEnvelope;

  if (!Array.isArray(parsed.readings)) {
    throw new Error("Invalid dataset: missing readings array");
  }

  /* Validate every reading in the file */
  const invalid = parsed.readings.findIndex((r) => !isValidReading(r));
  if (invalid !== -1) {
    throw new Error(`Invalid reading at index ${invalid}: missing required fields`);
  }

  return {
    readings: parsed.readings,
    viewState: parsed.viewState,
    mapStyle: parsed.mapStyle,
    subscribers: parsed.subscribers,
  };
};

/* Parse a v2 compressed columnar envelope into a DatasetResult */
const parseCompressedEnvelope = (text: string): DatasetResult => {
  const parsed = JSON.parse(text) as CompressedEnvelope;

  if (!parsed.r || !Array.isArray(parsed.r.id)) {
    throw new Error("Invalid compressed dataset: missing columnar readings");
  }

  const readings = columnarToReadings(parsed.r);

  /* Reconstruct full view state from abbreviated keys */
  const viewState: SavedViewState | undefined = parsed.vs
    ? { longitude: parsed.vs.ln, latitude: parsed.vs.lt, zoom: parsed.vs.z, bearing: parsed.vs.b, pitch: parsed.vs.p }
    : undefined;

  /* Reconstruct subscribers from columnar format */
  const subscribers = parsed.s ? columnarToSubscribers(parsed.s) : undefined;

  return { readings, viewState, mapStyle: parsed.ms, subscribers, symbols: parsed.sym, symbolSize: parsed.ss };
};

/* Read a dataset file (.thm or legacy .json) and return validated readings with optional metadata.
   Auto-detects format by checking for gzip magic bytes at the start of the file. */
export const loadDataset = async (file: File): Promise<DatasetResult> => {
  /* Peek at first 2 bytes to detect gzip magic number (0x1f 0x8b) */
  const header = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const isGzip = header[0] === GZIP_MAGIC_0 && header[1] === GZIP_MAGIC_1;

  if (isGzip) {
    /* v2 compressed format — decompress then parse columnar JSON */
    const json = await decompressFromGzip(file);
    return parseCompressedEnvelope(json);
  }

  /* Legacy v1 plain JSON — read as text and parse row-oriented format */
  const text = await file.text();
  return parseLegacyEnvelope(text);
};
