# GPS Data Flow: Motorola MXP600 to DAMM TetraFlex LogServer

## Overview

This report documents how GPS location data from Motorola MXP600 TETRA radios should be routed through a DAMM TetraFlex base station system and into the LogServer MySQL database, where our application can extract and decode it.

## Architecture

The DAMM TetraFlex system has **no centralized location server**. GPS data flows through the system as standard SDS (Short Data Service) messages using the ETSI LIP (Location Information Protocol) standard. The Dispatcher application is the intended consumer that decodes LIP into coordinates — the LogServer only records raw SDS bytes.

### Data Flow

```
Motorola MXP600 (GPS module acquires satellite fix)
  → Radio encodes position as LIP PDU (ETSI TS 100 392-18-1)
  → Radio sends LIP PDU as SDS type 4 via TETRA control channel
  → SDS is addressed to a dedicated LIP talk group (GSSI)
  → DAMM base station receives on uplink (measures RSSI at this point)
  → IP backbone multicasts SDS to dispatchers/applications
  → LogServer records raw SDS in MySQL `sdsdata` table
  → Our application reads `sdsdata`, decodes LIP PDU, extracts lat/lon
```

## Protocol Details

### LIP (Location Information Protocol)

- Defined in ETSI TS 100 392-18-1
- Application-layer protocol carried inside SDS-TL (Short Data Service Transport Layer)
- The TETRA infrastructure treats LIP as **opaque payload** — it transports the SDS without decoding it
- `ProtocolIdentifier = 10` (0x0A) in the SDS header identifies a LIP message

### Motorola MXP600 and LIP

- The MXP600 uses **standard ETSI LIP**, specifically "ETSI LIP (extended)"
- The "extended" designation refers to additional trigger types and features, not a modified PDU format
- Motorola's proprietary LRRP protocol is **DMR/MOTOTRBO only** — it is not used on TETRA networks
- CPS Plus codeplug setting "Location Protocol = LIP" confirms standard ETSI LIP PDUs

### LIP Short Location Report PDU (11 bytes)

| Field | Bits | Description |
|-------|------|-------------|
| PDU Type | 0-1 | `00` = Short Location Report |
| Time Elapsed | 2-3 | Time since position was determined |
| Longitude | 4-28 | 25-bit signed, scale: 360/2^25 degrees per unit |
| Latitude | 29-52 | 24-bit signed, scale: 180/2^24 degrees per unit |
| Position Error | 53-55 | Accuracy code (0=<2m, 1=<20m, 2=<200m, 3=<2km, 4=<20km, 5=≤200km, 6=>200km, 7=unknown) |
| Horizontal Velocity | 56-62 | 7-bit encoded speed |
| Direction of Travel | 63-66 | 4-bit, 22.5 degrees per unit (16 compass directions) |
| Additional Data Flag | 67 | 0 = no additional data |

## Configuration Required

### 1. DAMM Network Manager — Create LIP Talk Group

- Navigate to Network Manager → Subscribers → SSI tab
- Create a new talk group (GSSI) dedicated to LIP data
- **Tick "Group Restricted"** — this prevents radios from attaching to the group, ensuring no downlink traffic goes to radios and that voice operations are unaffected
- This GSSI is a silent, data-only routing address — radios never "select" it for voice

### 2. Motorola CPS Plus Codeplug — Set LIP Destination

- In the LIP Configuration section, set the **destination address** to the new GSSI (replacing the current ISSI 100)
- Ensure **Location Bearer = SDS** and **Location Protocol = LIP** (already configured)
- Enable **Periodic Location Reporting** in LIP Triggers (e.g. every 30-60 seconds) to ensure reports are sent after the GPS module has acquired a fix
- Review "Send Immediate Location Reports to Requestor" — change from "Only at Migration" to a less restrictive setting
- Flash the updated codeplug to all radios

### 3. DAMM LogServer — Enable SDS Logging for LIP Group

- Ensure **SDS logging is enabled** (dongle-controlled license feature)
- Add the **LIP talk group as a logging target** in the LogServer subscriber manager
- This ensures all SDS messages addressed to the LIP GSSI are recorded in the `sdsdata` table

### 4. DAMM Dispatcher (Optional)

- If the DAMM Dispatcher is deployed, add the LIP talk group to the dispatcher profile's **group permission table**
- The Dispatcher will then automatically decode LIP and display positions on its built-in map
- Our application provides an alternative to the Dispatcher for heatmap visualisation

## Database Storage

### `sdsdata` Table (TetraFlex LogServer MySQL)

When a LIP message is logged, a single row in `sdsdata` contains:

| Column | Type | Content |
|--------|------|---------|
| `DbId` | int | Primary key |
| `Timestamp` | datetime | When the base station received the message |
| `CallingSsi` | int | The radio's SSI (subscriber ID) |
| `Rssi` | tinyint | Signal strength measured by the base station |
| `MsDistance` | smallint | Estimated distance from base station |
| `ProtocolIdentifier` | smallint | `10` = LIP |
| `UserData` | binary(255) | Raw LIP PDU containing GPS coordinates |

This means a **single row** provides both RSSI (signal strength) and GPS coordinates — exactly what a heatmap needs.

### Tables NOT Populated

- `sdstlreport` and `sdstlshortreport` exist in the database schema but are **empty**
- These tables are likely populated by the DAMM Dispatcher or another application-layer component, not by the LogServer itself
- The DAMM documentation makes no mention of these tables

## Our Application's Approach

Since the LogServer stores raw SDS bytes without decoding LIP, our application implements its own LIP PDU decoder:

1. **Sync service** queries `sdsdata WHERE ProtocolIdentifier = 10` on a configurable interval
2. **LIP decoder** (`server/src/utils/lip.ts`) extracts latitude, longitude, position error, velocity, and direction from the raw `UserData` binary
3. **Local SQLite cache** stores decoded readings with `(timestamp, ssi, rssi, ms_distance, latitude, longitude, position_error, velocity, direction)`
4. **REST API** serves the cached readings to the frontend for heatmap rendering
5. Readings with zeroed coordinates (no GPS fix) are automatically skipped

## Current Status and Known Issues

### Working

- LIP messages from MXP600 radios arrive in `sdsdata` with `ProtocolIdentifier = 10`
- The LogServer records the raw SDS including RSSI measurements
- Our LIP decoder correctly parses the ETSI PDU format

### Not Yet Working

- **GPS coordinates are zeroed** in all LIP PDUs received so far (`lat=0, lon=0, error=unknown, velocity=not available`)
- The radio displays a valid GPS fix on its screen, but the LIP protocol stack is not including coordinates in the reports
- The LIP destination is currently set to **ISSI 100** instead of a dedicated restricted GSSI — this may be preventing proper delivery/logging

### Next Steps

1. Create the dedicated LIP talk group (restricted GSSI) in DAMM Network Manager
2. Update CPS Plus codeplug to send LIP to the new GSSI
3. Enable periodic LIP triggers (not just migration/power-up)
4. Add the LIP GSSI as a LogServer logging target
5. Re-flash radios and verify GPS data appears with non-zero coordinates in `sdsdata`

## References

- ETSI TS 100 392-18-1 — TETRA Location Information Protocol (LIP)
- DAMM AN-LOCATION_SERVICES — Application Note on Location Services
- DAMM OP-DISPATCHER — Dispatcher User Guide
- DAMM OP-LOG_SERVER — LogServer User Guide
- DAMM Module 3D — LogServer Training Slides
- DAMM Module 3F — Applications Training Slides
- osmo-tetra (sq5bpf) — Open-source TETRA LIP decoder reference implementation
