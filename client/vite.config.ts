import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  /* Load .env from the project root rather than client/ */
  envDir: path.resolve(__dirname, ".."),
  build: {
    /* Suppress chunk size warning for mapbox-gl (~1.6MB, can't be split) */
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        /* Split large dependencies into separate chunks for better long-term caching */
        manualChunks(id: string) {
          if (id.includes("mapbox-gl") || id.includes("react-map-gl")) return "mapbox";
          if (id.includes("deck.gl")) return "deckgl";
        },
      },
    },
  },
  server: {
    /* Proxy API requests to the Express backend */
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.PORT || 3001}`,
        changeOrigin: true,
      },
    },
  },
})
