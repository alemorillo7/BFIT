export async function forceClearCacheAndReload() {
  try {
    // 1. Desregistrar Service Workers viejos
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
    }

    // 2. Limpiar CacheAPI (assets del SW)
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }

    // 3. Limpiar IndexedDB de bfit (month_cache y sync_queue)
    //    Esto fuerza que al recargar se lea todo fresco desde Supabase
    if ('indexedDB' in window) {
      await new Promise((resolve) => {
        const req = window.indexedDB.deleteDatabase('bfit_offline_db');
        req.onsuccess = () => resolve();
        req.onerror = () => resolve(); // no bloquear si falla
        req.onblocked = () => resolve();
      });
    }

    // 4. Limpiar localStorage items de bfit
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('bfit_') || k.startsWith('sb-'))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    // 5. Limpiar sessionStorage
    sessionStorage.clear();

    // 6. Recargar con cache-busting
    const url = new URL(window.location.href);
    url.searchParams.set('t', Date.now().toString());
    window.location.href = url.toString();
  } catch (err) {
    console.error('Error clearing cache:', err);
    window.location.reload(true);
  }
}
