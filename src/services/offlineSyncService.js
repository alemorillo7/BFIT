/**
 * offlineSyncService.js
 * 
 * Gestiona el almacenamiento local en IndexedDB (con fallback a localStorage)
 * y la cola de sincronización en segundo plano con Supabase.
 */

const DB_NAME = 'bfit_offline_db';
const DB_VERSION = 1;
const STORE_MONTHS = 'month_cache';
const STORE_QUEUE = 'sync_queue';

let dbInstance = null;
const listeners = new Set();

let syncStatus = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSyncing: false,
  pendingCount: 0,
  lastSyncedAt: null,
  error: null,
};

/**
 * Abre o inicializa la base de datos IndexedDB
 */
const getDB = () => {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }

    try {
      // Solicitar persistencia al navegador para que nunca limpie los datos locales por falta de espacio
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
      }

      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_MONTHS)) {
          db.createObjectStore(STORE_MONTHS, { keyPath: 'month' });
        }
        if (!db.objectStoreNames.contains(STORE_QUEUE)) {
          const queueStore = db.createObjectStore(STORE_QUEUE, { keyPath: 'id', autoIncrement: true });
          queueStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (e) => {
        dbInstance = e.target.result;
        resolve(dbInstance);
      };

      request.onerror = (e) => {
        console.warn('IndexedDB no disponible, se usará fallback de localStorage:', e);
        resolve(null);
      };
    } catch (err) {
      console.warn('Error al inicializar IndexedDB:', err);
      resolve(null);
    }
  });
};

/**
 * Notifica a todos los subscriptores sobre cambios en el estado de sincronización
 */
const notifyListeners = () => {
  listeners.forEach((fn) => {
    try {
      fn({ ...syncStatus });
    } catch (e) {
      console.error('Error en listener de offlineSyncService:', e);
    }
  });
};

/**
 * Suscripción al estado de sincronización
 */
export const subscribeSyncStatus = (callback) => {
  listeners.add(callback);
  callback({ ...syncStatus });
  return () => listeners.delete(callback);
};

export const getSyncStatus = () => ({ ...syncStatus });

/**
 * Actualiza el conteo de mutaciones pendientes en el estado
 */
const updatePendingCount = async () => {
  const queue = await getPendingMutations();
  syncStatus.pendingCount = queue.length;
  notifyListeners();
};

/**
 * Guarda una copia completa del mes en el almacenamiento local
 */
export const saveMonthCache = async (month, data) => {
  try {
    const db = await getDB();
    if (db) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MONTHS, 'readwrite');
        const store = tx.objectStore(STORE_MONTHS);
        store.put({ month, data, cachedAt: Date.now() });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } else {
      try {
        localStorage.setItem(`bfit_cache_${month}`, JSON.stringify({ data, cachedAt: Date.now() }));
      } catch (e) {
        console.warn('LocalStorage lleno para cache del mes:', e);
      }
    }
  } catch (err) {
    console.error(`Error al guardar cache local del mes ${month}:`, err);
  }
};

/**
 * Recupera los datos cacheados localmente de un mes
 */
export const getMonthCache = async (month) => {
  try {
    const db = await getDB();
    if (db) {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MONTHS, 'readonly');
        const store = tx.objectStore(STORE_MONTHS);
        const req = store.get(month);
        req.onsuccess = () => resolve(req.result ? req.result.data : null);
        req.onerror = () => reject(req.error);
      });
    } else {
      const raw = localStorage.getItem(`bfit_cache_${month}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed ? parsed.data : null;
    }
  } catch (err) {
    console.error(`Error al leer cache local del mes ${month}:`, err);
    return null;
  }
};

/**
 * Actualiza una fila directamente en el caché local del mes
 */
export const updateRowInMonthCache = async (month, rowId, updatedFields) => {
  try {
    const current = await getMonthCache(month);
    if (!current || !Array.isArray(current)) return;
    const idx = current.findIndex((r) => r.id === rowId);
    if (idx !== -1) {
      current[idx] = { ...current[idx], ...updatedFields };
      await saveMonthCache(month, current);
    }
  } catch (err) {
    console.warn('No se pudo actualizar fila en cache local:', err);
  }
};

/**
 * Agrega una fila nueva al caché local del mes
 */
export const addRowToMonthCache = async (month, newRecord) => {
  try {
    const current = (await getMonthCache(month)) || [];
    current.push(newRecord);
    await saveMonthCache(month, current);
  } catch (err) {
    console.warn('No se pudo agregar fila al cache local:', err);
  }
};

/**
 * Elimina una fila del caché local del mes
 */
export const removeRowFromMonthCache = async (month, rowId) => {
  try {
    const current = await getMonthCache(month);
    if (!current) return;
    const filtered = current.filter((r) => r.id !== rowId);
    await saveMonthCache(month, filtered);
  } catch (err) {
    console.warn('No se pudo remover fila del cache local:', err);
  }
};

/**
 * Encola una mutación en la cola de pendientes offline
 */
export const enqueueMutation = async (mutation) => {
  const item = {
    ...mutation,
    timestamp: Date.now(),
    retries: 0,
  };

  try {
    const db = await getDB();
    if (db) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_QUEUE, 'readwrite');
        const store = tx.objectStore(STORE_QUEUE);
        store.add(item);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } else {
      const raw = localStorage.getItem('bfit_sync_queue') || '[]';
      const queue = JSON.parse(raw);
      item.id = Date.now() + Math.random();
      queue.push(item);
      localStorage.setItem('bfit_sync_queue', JSON.stringify(queue));
    }
  } catch (err) {
    console.error('Error al encolar mutación offline:', err);
  }

  await updatePendingCount();
};

/**
 * Obtiene todas las mutaciones pendientes en orden cronológico
 */
export const getPendingMutations = async () => {
  try {
    const db = await getDB();
    if (db) {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_QUEUE, 'readonly');
        const store = tx.objectStore(STORE_QUEUE);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } else {
      const raw = localStorage.getItem('bfit_sync_queue') || '[]';
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error al obtener mutaciones pendientes:', err);
    return [];
  }
};

/**
 * Elimina una mutación procesada de la cola
 */
export const removeMutation = async (id) => {
  try {
    const db = await getDB();
    if (db) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_QUEUE, 'readwrite');
        const store = tx.objectStore(STORE_QUEUE);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } else {
      const raw = localStorage.getItem('bfit_sync_queue') || '[]';
      const queue = JSON.parse(raw).filter((item) => item.id !== id);
      localStorage.setItem('bfit_sync_queue', JSON.stringify(queue));
    }
  } catch (err) {
    console.error(`Error al remover mutación ${id}:`, err);
  }

  await updatePendingCount();
};

/**
 * Procesa la cola de sincronización enviando los cambios acumulados a Supabase
 */
export const processSyncQueue = async (supabaseClient) => {
  if (!supabaseClient || syncStatus.isSyncing) return;

  const queue = await getPendingMutations();
  if (queue.length === 0) {
    syncStatus.pendingCount = 0;
    syncStatus.isSyncing = false;
    notifyListeners();
    return;
  }

  queue.sort((a, b) => a.timestamp - b.timestamp);

  syncStatus.isSyncing = true;
  syncStatus.pendingCount = queue.length;
  syncStatus.error = null;
  notifyListeners();

  let processed = 0;

  for (const item of queue) {
    try {
      if (item.type === 'UPDATE') {
        const { error } = await supabaseClient
          .from(item.table || 'cobros')
          .update(item.payload)
          .eq('id', item.rowId);
        if (error) throw error;
      } else if (item.type === 'INSERT') {
        const { error } = await supabaseClient
          .from(item.table || 'cobros')
          .insert(item.payload);
        if (error) throw error;
      } else if (item.type === 'DELETE') {
        const { error } = await supabaseClient
          .from(item.table || 'cobros')
          .delete()
          .eq('id', item.rowId);
        if (error) throw error;
      }

      await removeMutation(item.id);
      processed++;
    } catch (err) {
      console.warn(`Fallo al sincronizar mutación id=${item.id}:`, err);
      syncStatus.error = err.message || 'Error de conexión durante sincronización';
      break;
    }
  }

  syncStatus.isSyncing = false;
  syncStatus.lastSyncedAt = new Date();
  await updatePendingCount();
};

/**
 * Inicializa los listeners de conectividad (online / offline)
 */
export const initOfflineSync = (supabaseClient) => {
  if (typeof window === 'undefined') return;

  const handleOnline = () => {
    syncStatus.isOnline = true;
    notifyListeners();
    processSyncQueue(supabaseClient);
  };

  const handleOffline = () => {
    syncStatus.isOnline = false;
    notifyListeners();
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  updatePendingCount();

  if (navigator.onLine) {
    processSyncQueue(supabaseClient);
  }

  const intervalId = setInterval(() => {
    if (navigator.onLine && syncStatus.pendingCount > 0 && !syncStatus.isSyncing) {
      processSyncQueue(supabaseClient);
    }
  }, 8000); // Revisar cada 8 segundos si hay microcortes

  // Si la pestaña vuelve a tener foco o visibilidad, reintentar enviar cola de inmediato
  const handleVisibility = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      processSyncQueue(supabaseClient);
    }
  };
  window.addEventListener('focus', handleOnline);
  document.addEventListener('visibilitychange', handleVisibility);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    window.removeEventListener('focus', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibility);
    clearInterval(intervalId);
  };
};
