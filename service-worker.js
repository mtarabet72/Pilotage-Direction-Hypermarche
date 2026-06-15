// ═══════════════════════════════════════════════════════════
// SERVICE WORKER — Pilotage Hypermarché (Supabase)
// Version : hm-supabase-v2
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = 'pilotage-hm-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

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
