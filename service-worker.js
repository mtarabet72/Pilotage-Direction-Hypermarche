// ═══════════════════════════════════════════════════════════
// SERVICE WORKER — Pilotage Hypermarché (Supabase)
// Version : hm-supabase-v2
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = 'pilotage-hm-v3';
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
  const req = e.request;
  if (req.method !== 'GET') return;
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  // Réseau d'abord ; on mémorise chaque ressource de l'application (index, modules JS/CSS)
  // pour qu'elle s'ouvre aussi hors ligne. Les appels Supabase (autre origine) ne sont jamais mis en cache.
  e.respondWith(
    fetch(req).then(res => {
      if (sameOrigin && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
