const CACHE_VERSION = 'v2';
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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Network-first for navigations to keep content fresh
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match('/')))
    );
    return;
  }

  // Only handle same-origin static-ish requests
  if (url.origin === self.location.origin) {
    const accept = request.headers.get('accept') || '';
    const isStatic =
      ['.js', '.css', '.png', '.svg', '.jpg', '.jpeg', '.gif', '.webp', '.woff2', '.woff'].some((ext) =>
        url.pathname.endsWith(ext)
      ) || accept.includes('image');

    if (isStatic) {
      event.respondWith(
        caches.match(request).then((cached) => {
          const networkFetch = fetch(request)
            .then((response) => {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
              return response;
            })
            .catch(() => cached);
          return cached || networkFetch;
        })
      );
    }
  }
});
