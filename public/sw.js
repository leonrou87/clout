// CLOUT service worker — makes the app installable + fast. Network-first for everything,
// with a cached app-shell fallback so it still opens offline. API responses are not cached
// (they're live: balances, the index, chat), only the static shell + rendered cards.
const SHELL = 'clout-shell-v1';
const SHELL_FILES = ['/', '/app.js', '/icon.svg', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return; // never cache writes
  const cacheable = SHELL_FILES.includes(url.pathname) || url.pathname.startsWith('/api/render/');
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (cacheable && res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/')))
  );
});
