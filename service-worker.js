// ═══════════════════════════════════════════════════════════
// SERVICE WORKER — Pilotage Hypermarché (Supabase)
// Version : hm-supabase-v1
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = 'pilotage-hm-v1';
const ASSETS = ['./'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Toujours réseau en priorité, cache en fallback
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
