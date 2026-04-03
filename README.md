# TetraFlex RSSI Heatmap

A data visualisation tool for DAMM TetraFlex log servers. Displays TETRA radio signal strength (RSSI) and GPS location data as a heatmap overlay on an interactive map, providing clear visual feedback on coverage quality across a venue.

## Quick Start (Docker)

Pull and run the pre-built image from GitHub Container Registry:

```bash
docker run -d \
  --name tetra-heatmap \
  -p 3001:3001 \
  -v tetra-data:/app/server/data \
  ghcr.io/maximilian118/tetra-heatmap:latest
```

Open [http://localhost:3001](http://localhost:3001) in your browser and follow the [first-time setup](#first-time-setup) steps.

To use a different external port, change the first number in `-p`:

```bash
-p 8080:3001
```

The app is then accessible at `http://localhost:8080`.

## Docker Compose

Create a `docker-compose.yml`:

```yaml
services:
  tetra-heatmap:
    image: ghcr.io/maximilian118/tetra-heatmap:latest
    ports:
      - "3001:3001"
    volumes:
      - tetra-data:/app/server/data
    restart: unless-stopped

volumes:
  tetra-data:
```

```bash
docker compose up -d
```

### Persistent Data

The `-v tetra-data:/app/server/data` volume mount stores the SQLite database that holds all cached readings and application settings. Without it, data is lost when the container is recreated.

### Network Access

The TetraFlex logserver must be reachable from the machine running Docker. Containers use Docker's bridge network and can reach any LAN host through NAT — no special networking configuration is required. Enter the logserver's LAN IP (e.g. `10.46.72.41`) in the Settings tab.

## First-Time Setup

On first launch, the app presents a setup screen:

1. **Mapbox Token** — Create a free access token at [account.mapbox.com/access-tokens](https://account.mapbox.com/access-tokens) and paste it into the setup screen. Click **Apply** — the page reloads with the map.

2. **Logserver Connection** — Open the **Settings** tab in the sidebar. Enter the TetraFlex logserver host, port, credentials, and database name. Click **Apply** to save and test the connection.

All configuration is stored in the SQLite database and persists across container restarts (as long as the volume is mounted).

## Development

For local development without Docker:

### Prerequisites

- Node.js 22+
- Network access to a DAMM TetraFlex Logserver (MySQL 8.x)

### Setup

```bash
git clone https://github.com/Maximilian118/tetra-heatmap.git
cd tetra-heatmap
npm install
cp .env.dev .env
```

### Run

```bash
npm run dev
```

Starts the backend (port 3001) and frontend (port 5173) side-by-side with hot reload via `concurrently`.

### Production Build

```bash
npm start
```

Builds the client and starts a single Express server that serves both the API and the built frontend on port 3001.

### Environment Variables (Bare-Metal Only)

These are only relevant when running outside of Docker. The Docker image sets sensible defaults automatically.

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `HOST` | Bind address (`0.0.0.0` for LAN access) | `localhost` |

All other configuration (Mapbox token, database credentials, sync settings) is managed through the Settings tab in the UI.

## Architecture

- **`client/`** — React + TypeScript + Vite frontend with MapBox GL and deck.gl visualisation layers (heatmap, hexagon, line)
- **`server/`** — Express + TypeScript backend that syncs RSSI and GPS data from the TetraFlex `sdsdata` table, decodes ETSI LIP PDUs to extract coordinates, and caches everything in a local SQLite database. Serves the REST API and the built client on a single port.
- **`reports/`** — Technical documentation on data flow and protocol details

The local SQLite cache is created automatically on first run. Data retention defaults to 5 days and is configurable in the Settings tab. If the TetraFlex logserver is unreachable, the sync service retries automatically and resumes on reconnection.
