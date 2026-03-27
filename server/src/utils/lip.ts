/* LIP (Location Information Protocol) PDU decoder
   Implements ETSI TS 100 392-18-1 Short Location Report decoding */

/* Position error lookup table (metres) — ETSI TS 100 392-18-1 Table 6.28 */
const POSITION_ERROR_M = [
  2, 20, 200, 2_000, 20_000, 200_000, Infinity, null,
] as const;

/* Decoded fields from a LIP Short Location Report */
export interface LipShortReport {
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

/* Decode a LIP Short Location Report from a raw UserData buffer.
   Returns null if the PDU is not a short report or coordinates are zeroed (no GPS fix). */
export const decodeLipShortReport = (data: Buffer): LipShortReport | null => {
  if (data.length < 10) return null;

  /* Bits 0-1: PDU type (0b00 = short location report) */
  const pduType = readUnsignedBits(data, 0, 2);
  if (pduType !== 0b00) return null;

  /* Bits 2-3: Time elapsed since last position fix */

  /* Bits 4-28: Longitude (25-bit signed, scale: 360 / 2^25 degrees per unit) */
  const rawLon = readSignedBits(data, 4, 25);
  const longitude = rawLon * (360 / (1 << 25));

  /* Bits 29-52: Latitude (24-bit signed, scale: 180 / 2^24 degrees per unit) */
  const rawLat = readSignedBits(data, 29, 24);
  const latitude = rawLat * (180 / (1 << 24));

  /* Skip rows with zeroed coordinates — indicates no GPS fix */
  if (rawLon === 0 && rawLat === 0) return null;

  /* Bits 53-55: Position error code */
  const errorCode = readUnsignedBits(data, 53, 3);
  const positionError = POSITION_ERROR_M[errorCode] ?? null;

  /* Bits 56-62: Horizontal velocity (7-bit encoded) */
  const rawVelocity = readUnsignedBits(data, 56, 7);
  const velocity = rawVelocity === 127 ? null : rawVelocity;

  /* Bits 63-66: Direction of travel (4-bit, 22.5° per unit) */
  const rawDirection = readUnsignedBits(data, 63, 4);
  const direction = rawDirection * 22.5;

  return { latitude, longitude, positionError, velocity, direction };
};
