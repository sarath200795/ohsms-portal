/*
 * Minimal, conservative service worker.
 *
 * Goal: make the app installable (PWA) and give an offline fallback for page
 * navigations — WITHOUT aggressive asset caching that could serve stale builds.
 * Hashed JS/CSS assets are intentionally NOT cached here; they are already
 * long-cached via HTTP headers and change name on every deploy.
 *
 * Strategy:
 *   - navigations: network-first, fall back to the cached app shell when offline
 *   - everything else: passthrough (let the network/HTTP cache handle it)
 *
 * NOTE: test with `npm run build && npm run preview` before deploying. To roll
 * back, remove the registration in main.jsx / fieldPortalMain.jsx and bump
 * SHELL_CACHE to force old caches to clear.
 */
const SHELL_CACHE = 'ehs-shell-v1';
const APP_SHELL = '/index.html';

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(SHELL_CACHE).then((cache) => cache.put(APP_SHELL, copy)).catch(() => {});
                    return response;
                })
                .catch(() => caches.match(request).then((cached) => cached || caches.match(APP_SHELL)))
        );
    }
});
