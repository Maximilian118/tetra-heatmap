import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  /* Load .env from the project root rather than client/ */
  envDir: path.resolve(__dirname, ".."),
  /* Suppress chunk size warning for mapbox-gl (~1.6MB, can't be split) */
  build: { chunkSizeWarningLimit: 2000 },
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
