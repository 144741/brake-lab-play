const CACHE_NAME = 'brakelab-offline-v12';
const FILES = [
  './', './index.html', './styles.css', './app.js', './scene3d.js', './site-pwa.js',
  './favicon.svg', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './v800-cinematic-wide.png', './v800-cinematic-portrait.png', './v800-drive-sprite.png',
  './v800-drive-sky-wide.png', './v800-drive-sky-portrait.png',
  './assets/vendor/three.core.js', './assets/vendor/three.module.js',
  './assets/vendor/RoundedBoxGeometry.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      }
      return response;
    }))
  );
});
