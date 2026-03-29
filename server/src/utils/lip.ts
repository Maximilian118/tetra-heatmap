/* LIP (Location Information Protocol) PDU decoder
   Implements ETSI TS 100 392-18-1 decoding for both Short Location Reports
   and Immediate Location Reports (extended PDU type). */

/* Position error lookup table (metres) — ETSI TS 100 392-18-1 Table 6.28 */
const POSITION_ERROR_M = [
  2, 20, 200, 2_000, 20_000, 200_000, Infinity, null,
] as const;

/* Number of time-data bits for each time-type value in a Long Immediate Location Report.
   Index = time-type field (2 bits at offset 7 in the PDU).
   Note: Motorola MXP600 encoding differs from ETSI standard numbering.
   - 0: no time information (0 bits)
   - 1: time of position (25 bits) — CONFIRMED with live data
   - 2: time elapsed (estimated 5 bits — unverified)
   - 3: reserved (treated as 0) */
const TIME_DATA_BITS: Record<number, number> = { 0: 0, 1: 25, 2: 5, 3: 0 };

/* Decoded fields from a LIP Location Report */
export interface LipReport {
  latitude: number;
  longitude: number;
  positionError: number | null;
  velocity: number | null;
  direction: number | null;
}

/* Extract a signed (two's complement) integer from a bit offset within a buffer */
const readSignedBits = (buf: Buffer, bitOffset: number, bitLength: number): number => {
  let value = 0;
  for (let i = 0; i < bitLength; i++) {
    const byteIdx = Math.floor((bitOffset + i) / 8);
    const bitIdx = 7 - ((bitOffset + i) % 8);
    if (buf[byteIdx] & (1 << bitIdx)) {
      value |= 1 << (bitLength - 1 - i);
    }
  }
  /* Sign-extend if the MSB is set */
  if (value & (1 << (bitLength - 1))) {
    value -= 1 << bitLength;
  }
  return value;
};

/* Extract an unsigned integer from a bit offset within a buffer */
const readUnsignedBits = (buf: Buffer, bitOffset: number, bitLength: number): number => {
  let value = 0;
  for (let i = 0; i < bitLength; i++) {
    const byteIdx = Math.floor((bitOffset + i) / 8);
    const bitIdx = 7 - ((bitOffset + i) % 8);
    if (buf[byteIdx] & (1 << bitIdx)) {
      value |= 1 << (bitLength - 1 - i);
    }
  }
  return value;
};

/* Extract longitude, latitude, and position error starting at the given bit offset.
   Returns null if the coordinates are zeroed (no GPS fix) or out of valid range. */
const extractCoordinates = (
  data: Buffer,
  lonOffset: number
): { latitude: number; longitude: number; positionError: number | null } | null => {
  const latOffset = lonOffset + 25;
  const posErrOffset = latOffset + 24;

  /* Ensure we have enough bits to read all fields */
  if (posErrOffset + 3 > data.length * 8) return null;

  /* Longitude: 25-bit signed, scale: 360 / 2^25 degrees per unit */
  const rawLon = readSignedBits(data, lonOffset, 25);
  const longitude = rawLon * (360 / (1 << 25));

  /* Latitude: 24-bit signed, scale: 180 / 2^24 degrees per unit */
  const rawLat = readSignedBits(data, latOffset, 24);
  const latitude = rawLat * (180 / (1 << 24));

  /* Skip rows with zeroed coordinates — indicates no GPS fix.
     A real GPS fix will never land exactly on 0° latitude or 0° longitude. */
  if (rawLon === 0 || rawLat === 0) return null;

  /* Validate coordinate ranges */
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  /* Position error code (3 bits) */
  const errorCode = readUnsignedBits(data, posErrOffset, 3);
  const positionError = POSITION_ERROR_M[errorCode] ?? null;

  return { latitude, longitude, positionError };
};

/* Decode a LIP Short Location Report (PDU type 0b00).
   Format: pduType(2) + timeElapsed(2) + lon(25) + lat(24) + posErr(3) + vel(7) + dir(4) */
const decodeLipShortReport = (data: Buffer): LipReport | null => {
  const coords = extractCoordinates(data, 4);
  if (!coords) return null;

  /* Velocity: 7 bits at offset 56 */
  const rawVelocity = readUnsignedBits(data, 56, 7);
  const velocity = rawVelocity === 127 ? null : rawVelocity;

  /* Direction: 4 bits at offset 63, 22.5° per unit */
  const rawDirection = readUnsignedBits(data, 63, 4);
  const direction = rawDirection * 22.5;

  return { ...coords, velocity, direction };
};

/* Decode a LIP Immediate Location Report (PDU type 0b01, extension 0b0011).
   The MXP600 sends these for periodic/triggered reports. The CPS Plus
   "Basic Location Report Type" setting controls the time-type field,
   which determines how many bits of time data precede the coordinates.
   Format: pduType(2) + ext(4) + reportType(1) + timeType(2) + timeData(var) + lon(25) + lat(24) + posErr(3) */
const decodeLipImmediateReport = (data: Buffer): LipReport | null => {
  /* Bit 6: report type (0 = short embedded, 1 = long embedded) */
  const reportType = readUnsignedBits(data, 6, 1);

  if (reportType === 0) {
    /* Short embedded report — coordinates follow immediately after the 7-bit header
       with the standard short-report layout: timeElapsed(2) + lon(25) + lat(24) */
    const coords = extractCoordinates(data, 9);
    if (!coords) return null;
    return { ...coords, velocity: null, direction: null };
  }

  /* Long embedded report — time-type field determines the offset to coordinates */
  const timeType = readUnsignedBits(data, 7, 2);
  const timeBits = TIME_DATA_BITS[timeType] ?? 0;

  /* Longitude starts after: header(6) + reportType(1) + timeType(2) + timeData(var) */
  const lonOffset = 9 + timeBits;
  const coords = extractCoordinates(data, lonOffset);
  if (!coords) return null;

  return { ...coords, velocity: null, direction: null };
};

/* Unified LIP decoder — auto-detects the PDU format and decodes accordingly.
   Handles both Short Location Reports (PDU type 00) and Immediate Location Reports
   (PDU type 01, extension 0011) regardless of the CPS Plus report type setting. */
export const decodeLipReport = (data: Buffer): LipReport | null => {
  if (data.length < 10) return null;

  /* Bits 0-1: PDU type */
  const pduType = readUnsignedBits(data, 0, 2);

  if (pduType === 0b00) {
    /* Short Location Report — power-on / registration events */
    return decodeLipShortReport(data);
  }

  if (pduType === 0b01) {
    /* Extended PDU — check extension type (bits 2-5) */
    const extension = readUnsignedBits(data, 2, 4);
    if (extension === 0b0011) {
      /* Immediate Location Report (MS → SwMI) — periodic/triggered reports */
      return decodeLipImmediateReport(data);
    }
  }

  /* Unsupported PDU type or extension */
  return null;
};
