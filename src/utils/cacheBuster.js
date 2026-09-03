export async function forceClearCacheAndReload() {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
    }
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
    }
    sessionStorage.clear();
    const url = new URL(window.location.href);
    url.searchParams.set('t', Date.now().toString());
    window.location.href = url.toString();
  } catch (err) {
    console.error('Error clearing cache:', err);
    window.location.reload(true);
  }
}
