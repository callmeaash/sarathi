// Sarathi's service worker: keeps the app's own files on the device so it opens fast, and opens at all when offline.
// Live data (/api/...) and map tiles are never stored here: closures must always come fresh from the server.
// The build fills in the two values below (see vite.config.ts); in development this file is not registered.
const VERSION = 'dev'
const APP_FILES = []

const APP_CACHE = `sarathi-app-${VERSION}`
const FONT_CACHE = 'sarathi-fonts'
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

self.addEventListener('install', (event) => {
  // Take over as soon as the new files are stored; file names change with every build, so old pages keep working.
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(APP_FILES)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter((name) => name !== APP_CACHE && name !== FONT_CACHE).map((name) => caches.delete(name)))
    await self.clients.claim()
  })())
})

/** The stored copy if there is one; otherwise fetch it and store it for next time. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  // ignoreVary: these files are the same for everyone, but servers often mark them "Vary: Origin", and the page
  // asks for its script with an Origin header while the copy stored at install time was fetched without one.
  const stored = await cache.match(request, { ignoreVary: true })
  if (stored) return stored
  const response = await fetch(request)
  if (response.ok || response.type === 'opaque') cache.put(request, response.clone())
  return response
}

/** A page load: the live page when online, the stored app when not (the app then says it is offline). */
async function page(request) {
  try {
    return await fetch(request)
  } catch {
    const stored = await caches.match('/index.html', { cacheName: APP_CACHE, ignoreVary: true })
    if (stored) return stored
    throw new Error('offline and the app is not stored yet')
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, FONT_CACHE))
    return
  }
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return  // straight to the network
  event.respondWith(request.mode === 'navigate' ? page(request) : cacheFirst(request, APP_CACHE))
})
