# =============================================================
# Stage 1: Build the Vite client
# =============================================================
FROM node:22-slim AS client-builder

WORKDIR /build/client

# Copy client package files and install dependencies
COPY client/package.json client/package-lock.json ./
RUN npm ci

# Copy client source and build the static bundle
COPY client/ ./
RUN npm run build

# =============================================================
# Stage 2: Production image
# =============================================================
FROM node:22-slim AS production

# Install build tools required by better-sqlite3 native compilation
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy server package files and install all dependencies (including devDeps for tsx)
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci

# Copy server source code and config
COPY server/src ./server/src
COPY server/tsconfig.json ./server/

# Copy the built client from stage 1
COPY --from=client-builder /build/client/dist ./client/dist

# Create the data directory for SQLite (volume mount point)
RUN mkdir -p /app/server/data

EXPOSE 3001

# Start the server using tsx for TypeScript execution
WORKDIR /app/server
CMD ["node", "--import", "tsx", "src/index.ts"]
