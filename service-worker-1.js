// ═══════════════════════════════════════════════════════════
// SERVICE WORKER — Pilotage Hypermarché (Supabase)
// Version : hm-supabase-v1
// ═══════════════════════════════════════════════════════════

const CACHE = 'hm-supabase-v1';

// Fichiers à mettre en cache pour le mode offline
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192-marjane.png',
  './icons/icon-512-marjane.png'
];

// Domaines qui ne doivent JAMAIS être mis en cache
// (Supabase realtime + CDN Supabase SDK)
const NEVER_CACHE = [
  'supabase.co',
  'supabase.in',
  'supabase.com',
  'cdn.jsdelivr.net'
];

// ── Installation : mise en cache des assets statiques ──
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ── Activation : supprimer les anciens caches ──
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE)
          .map(k => {
            console.log('[SW] Suppression ancien cache :', k);
            return caches.delete(k);
          })
      ))
      .then(() => clients.claim())
  );
});

// ── Fetch : stratégie Network-first avec fallback cache ──
self.addEventListener('fetch', e => {
  // Ignorer les requêtes non-GET
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Ne JAMAIS intercepter Supabase et CDN externes — laisser passer directement
  if (NEVER_CACHE.some(domain => url.hostname.includes(domain))) {
    return; // pas de e.respondWith → fetch natif du navigateur
  }

  // Ignorer les extensions chrome et autres protocoles
  if (!url.protocol.startsWith('http')) return;

  e.respondWith(
    // Network-first : essayer le réseau en priorité
    fetch(e.request)
      .then(response => {
        // Mettre en cache la réponse réseau si valide
        if (response && response.status === 200 && response.type !== 'opaque') {
          const responseClone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, responseClone));
        }
        return response;
      })
      .catch(() => {
        // Réseau indisponible → fallback sur le cache
        return caches.match(e.request)
          .then(cached => {
            if (cached) return cached;
            // Fallback final : retourner index.html (app shell)
            return caches.match('./index.html');
          });
      })
  );
});

// ── Message : forcer la mise à jour ──
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
