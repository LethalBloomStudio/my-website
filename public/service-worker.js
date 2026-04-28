const CACHE_VERSION = 'v3-disabled';
const STATIC_CACHE = `lbs-static-${CACHE_VERSION}`;
const STATIC_ASSETS = [
  '/',
  '/favicon.ico',
  '/brand/icon-192.png',
  '/brand/icon-512.png',
  '/Website Logo.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => (key.startsWith('lbs-static-') && key !== STATIC_CACHE ? caches.delete(key) : null)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', () => {
  // Intentionally no-op while production feedback-selection issues are being debugged.
  // This avoids stale JS/CSS bundles masking live fixes.
});
