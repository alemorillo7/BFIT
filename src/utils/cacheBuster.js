import { supabaseCobros } from '../lib/supabaseCobrosClient';
import { processSyncQueue } from '../services/offlineSyncService';

export async function forceClearCacheAndReload() {
  try {
    // 1. ANTES de cualquier cosa, intentar enviar cualquier cambio pendiente a Supabase
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        await processSyncQueue(supabaseCobros);
      }
    } catch (syncErr) {
      console.warn('Error al sincronizar cola antes de recargar:', syncErr);
    }

    // 2. Desregistrar Service Workers viejos
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
    }

    // 3. Limpiar CacheAPI (únicamente assets de HTML/JS/CSS cacheados por el SW)
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }

    // NUNCA eliminar IndexedDB ni localStorage, para JAMÁS perder datos cargados por la clienta!

    // 4. Recargar con cache-busting en la URL
    const url = new URL(window.location.href);
    url.searchParams.set('t', Date.now().toString());
    window.location.href = url.toString();
  } catch (err) {
    console.error('Error clearing cache:', err);
    window.location.reload(true);
  }
}
