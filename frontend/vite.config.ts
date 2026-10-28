import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The API runs separately (uvicorn on port 8000); in development Vite forwards /api to it,
// so the browser sees one origin and no CORS setup is needed.
const API_URL = process.env.SARATHI_API_URL ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': { target: API_URL, changeOrigin: true } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    testTimeout: 15_000,  // each test renders the whole app with the map; parallel runs can be slow
  },
})
