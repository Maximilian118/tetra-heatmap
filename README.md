# TetraFlex RSSI Heatmap

A data visualisation tool for DAMM TetraFlex log servers. Displays TETRA radio signal strength (RSSI) and GPS location data as a heatmap overlay on an interactive map, providing clear visual feedback on coverage quality across a venue.

## Prerequisites

- Node.js 18+
- A MapBox account and access token
- Network access to a DAMM TetraFlex Logserver (MySQL 8.x on port 3306)

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.dev` to `.env` and fill in your credentials:
   ```bash
   cp .env.dev .env
   ```

### Development

```bash
npm run dev
```

Starts the backend (port 3001) and frontend (port 5173) side-by-side with hot reload via `concurrently`.

### Production

```bash
npm start
```

Builds the client and starts a single Express server that serves both the API and the built frontend on one port (default `3001`). Configure `PORT` and `HOST` in `.env` to control where the server binds — set `HOST=0.0.0.0` to allow LAN access.

The local SQLite cache is created automatically on first run and persists across restarts.

## Environment Variables

See `.env.dev` for the full list with descriptions. Key variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_MAPBOX_TOKEN` | MapBox access token ([get one here](https://account.mapbox.com/access-tokens/)) | — |
| `PORT` | Server port | `3001` |
| `HOST` | Bind address (`0.0.0.0` for LAN access) | `localhost` |
| `DB_HOST` | TetraFlex Logserver IP | — |
| `DB_PORT` | MySQL port | `3306` |
| `DB_USER` / `DB_PASSWORD` | MySQL credentials | — |
| `DB_NAME` | Database name | `tetraflexlogdb` |
| `SYNC_INTERVAL_MS` | Polling interval in milliseconds | `60000` |
| `SYNC_BATCH_SIZE` | Max rows per sync batch | `10000` |
| `RETENTION_DAYS` | Days of data to retain locally | `5` |

## Architecture

- **`client/`** — React + TypeScript + MapBox GL frontend
- **`server/`** — Express backend that syncs RSSI and GPS data from the TetraFlex `sdsdata` table, decodes ETSI LIP PDUs to extract coordinates, and caches everything in a local SQLite database. Serves the REST API and, in production, the built client on a single port.
- **`reports/`** — Technical documentation on data flow and protocol details

Data retention is configurable via `RETENTION_DAYS` (default: 5 days). If the TetraFlex database is unreachable, the sync service retries every 5 minutes and resumes automatically on reconnection.
