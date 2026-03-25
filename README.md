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

## Environment Variables

See `.env.dev` for the full list of required variables. You will need:

- A MapBox access token from https://account.mapbox.com/access-tokens/
- Connection credentials for your TetraFlex Logserver MySQL database
