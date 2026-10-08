// B-FIT Service Worker for Offline-First Capability
// IMPORTANTE: Cambiar CACHE_VERSION en cada deploy para invalidar el cache anterior
const CACHE_VERSION = 'v7';
const CACHE_NAME = `bfit-shell-${CACHE_VERSION}`;

// Solo cacheamos el HTML shell y assets estáticos pequeños
// Los JS/CSS bundles NO se cachean porque Vite ya les pone hash único en cada build
// y el SW viejo podría servir bundles obsoletos
const ASSETS_TO_CACHE = ['/', '/index.html', '/favicon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(c => c.addAll(ASSETS_TO_CACHE))
      .catch(err => console.warn('[SW] Error cacheando assets:', err))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log('[SW] Eliminando cache viejo:', k);
            return caches.delete(k);
          })
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);

  // NUNCA interceptar requests a Supabase, APIs externas o webhooks
  if (
    u.hostname.includes('supabase.co') ||
    u.hostname.includes('googleapis.com') ||
    u.hostname.includes('google.com') ||
    u.hostname.includes('fluxia.site') ||
    u.hostname.includes('automation8n') ||
    u.pathname.startsWith('/rest/') ||
    u.pathname.startsWith('/auth/') ||
    u.pathname.startsWith('/storage/')
  ) {
    return; // dejar que el browser lo maneje directamente
  }

  // Navegación: siempre intentar red primero, fallback al shell HTML cacheado
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match('/index.html').then(r => r || caches.match('/'))
      )
    );
    return;
  }

  // Assets JS/CSS con hash de Vite (ej: /assets/index-abc123.js): 
  // siempre red primero — Vite genera nombres únicos por build, no hay riesgo de cache stale
  if (u.pathname.startsWith('/assets/')) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res && res.status === 200) {
          const cl = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, cl));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Otros assets del mismo origen (favicon, svg, etc.): cache-first
  if (u.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then(r =>
        r || fetch(e.request).then(res => {
          if (res && res.status === 200) {
            const cl = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, cl));
          }
          return res;
        })
      )
    );
  }
});