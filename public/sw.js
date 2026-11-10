// Minimal App Shell Service Worker for Calculator
const CACHE_NAME = 'calculator-shell-v1';

const APP_SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL_FILES);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. NEVER intercept or cache /api/* requests or non-GET methods
  if (req.method !== 'GET' || url.pathname.startsWith('/api/')) {
    return;
  }

  // 2. Navigation requests (HTML pages) -> Network first, fallback to cached index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => {
        return caches.match('/index.html').then((cached) => {
          return cached || caches.match('/');
        });
      })
    );
    return;
  }

  // 3. Static assets -> Cache first, fallback to network and update cache
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(req).then((networkResponse) => {
        // Only cache valid GET responses for same-origin static assets or Google Fonts
        if (
          networkResponse &&
          networkResponse.status === 200 &&
          (url.origin === self.location.origin || url.hostname.includes('fonts.g'))
        ) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseToCache);
          });
        }
        return networkResponse;
      });
    })
  );
});

