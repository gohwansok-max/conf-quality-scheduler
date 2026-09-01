const CACHE_NAME = 'koenf-quality-pwa-v27';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=202608271172',
  './app.js?v=202609011355',
  './manifest.webmanifest',
  './pwa-icon.svg',
  './pwa-icon-192.png',
  './pwa-icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const shouldRefreshFirst = request.mode === 'navigate' || ['script', 'style', 'manifest'].includes(request.destination);
  if (shouldRefreshFirst) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request.mode === 'navigate' ? './index.html' : request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request.mode === 'navigate' ? './index.html' : request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok && new URL(response.url).origin === self.location.origin) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
