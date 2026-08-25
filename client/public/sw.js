/*
 * Nabz service worker — minimal offline shell (winning plan §16, mobile P2).
 *
 * Strategy:
 *   - Precache the app shell on install.
 *   - Runtime cache-first for same-origin static assets so the SPA opens
 *     instantly when Wi-Fi drops mid-demo.
 *   - Network-first for /api/* so health data is never stale — the SW never
 *     caches JWT-bearing responses.
 */
const CACHE = 'nabz-shell-v3-auth-validation'
const SHELL = ['/', '/manifest.webmanifest', '/icon.svg', '/icon-maskable.svg']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.pathname.startsWith('/api/')) {
    // Never cache API traffic (auth + PHI). Just pass through.
    return
  }

  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached
      return fetch(req)
        .then((resp) => {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            const copy = resp.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return resp
        })
        .catch(() => cached || Response.error())
    }),
  )
})
