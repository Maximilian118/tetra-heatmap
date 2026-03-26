# TetraFlex RSSI Heatmap

A data visualisation tool for DAMM TetraFlex log servers. Displays TETRA radio signal strength (RSSI) data as a heatmap overlay on an interactive map, providing clear visual feedback on coverage quality across a venue.

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
4. Start the development server:
   ```bash
   npm run dev
   ```

This starts both the backend (port 3001) and the frontend (port 5173). The backend syncs RSSI data from the remote TetraFlex database into a local SQLite cache, which is created automatically on first run.

## Environment Variables

See `.env.dev` for the full list of required variables. You will need:

- A MapBox access token from https://account.mapbox.com/access-tokens/
- Connection credentials for your TetraFlex Logserver MySQL database

## Architecture

- **`client/`** — React + TypeScript + MapBox GL frontend
- **`server/`** — Express backend that syncs RSSI data from the remote TetraFlex MySQL database into a local SQLite cache and serves it to the frontend via a REST API

Data older than 7 days is automatically pruned from the local cache.
