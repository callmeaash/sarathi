import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// The API runs separately (uvicorn on port 8000); in development Vite forwards /api to it,
// so the browser sees one origin and no CORS setup is needed.
const API_URL = process.env.SARATHI_API_URL ?? 'http://127.0.0.1:8000'
const proxy = { '/api': { target: API_URL, changeOrigin: true } }
// Allow a temporary Cloudflare test tunnel (npm run tunnel) to reach the dev and preview servers.
const allowedHosts = ['.trycloudflare.com']

/** Every file under a folder, as paths relative to it. */
function filesIn(folder: string, base = folder): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesIn(join(folder, entry.name), base)
      : [relative(base, join(folder, entry.name)).replaceAll('\\', '/')])
}

/**
 * After a build, tell the service worker (public/sw.js) which files make up the app, so it can store them for
 * offline use, and give it a version that changes whenever any of them does, so old copies are replaced.
 */
function serviceWorkerFiles(): Plugin {
  return {
    name: 'sarathi-service-worker-files',
    apply: 'build',
    closeBundle() {
      const dist = join(import.meta.dirname, 'dist')
      const files = filesIn(dist).filter((file) => file !== 'sw.js' && !file.endsWith('.map')
        && !file.includes('og-image')).sort()  // the share image is for link previews, not the app
      const hash = createHash('sha256')
      files.forEach((file) => hash.update(file).update(readFileSync(join(dist, file))))
      const worker = readFileSync(join(dist, 'sw.js'), 'utf8')
        .replace("const VERSION = 'dev'", `const VERSION = '${hash.digest('hex').slice(0, 12)}'`)
        .replace('const APP_FILES = []', `const APP_FILES = ${JSON.stringify(files.map((file) => `/${file}`))}`)
      writeFileSync(join(dist, 'sw.js'), worker)
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorkerFiles()],
  server: { proxy, allowedHosts },
  // `npm run preview` serves the production build (with the service worker), talking to the same API.
  preview: { proxy, allowedHosts },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    testTimeout: 15_000,  // each test renders the whole app with the map; parallel runs can be slow
  },
})
