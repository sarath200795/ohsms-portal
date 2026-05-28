/*
 * Self-destructing service worker.
 *
 * The previous SW cached /index.html as the app shell and served it back on
 * navigations. After a deploy with new hashed bundle filenames, the cached
 * shell still referenced the OLD hashes — Vercel's catch-all rewrite then
 * served /index.html for those missing assets, the browser got HTML when it
 * expected JavaScript, and the page went blank with:
 *
 *   "Failed to load module script: Expected a JavaScript-or-Wasm module
 *   script but the server responded with a MIME type of 'text/html'."
 *
 * This replacement:
 *   1. Skips waiting + claims all clients immediately, so it takes over from
 *      the old SW on the very next page load.
 *   2. Deletes every cache it knows about.
 *   3. Unregisters itself.
 *   4. Reloads any controlled pages so they pick up the now-uncached fresh
 *      bundle.
 *
 * After every existing user has hit this once, the SW is gone and the app
 * loads directly from the network for everyone going forward.
 */

self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        // 1. Wipe all caches.
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));

        // 2. Take control so we can reload pages immediately.
        await self.clients.claim();

        // 3. Unregister ourselves.
        await self.registration.unregister();

        // 4. Force-reload any pages that were controlled by the old SW so
        //    they fetch the fresh index.html and matching bundles from the
        //    network, not from the dead cache.
        const clientList = await self.clients.matchAll({ type: 'window' });
        for (const client of clientList) {
            // navigate() avoids the bfcache and forces a fresh document.
            client.navigate(client.url).catch(() => {});
        }
    })());
});

// Pass through every fetch to the network — no caching, no interception.
// (We don't even need a fetch handler, but keeping it empty / minimal makes
// the intent explicit while the SW is still alive on the very first hit.)
self.addEventListener('fetch', () => { /* network-direct */ });
