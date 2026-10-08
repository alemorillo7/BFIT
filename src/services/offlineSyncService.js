/**
 * offlineSyncService.js
 *
 * Patrón OUTBOX (bandeja de salida) para que NINGÚN cambio se pierda:
 *
 *  1. Cada cambio se escribe PRIMERO en localStorage de forma SINCRÓNICA
 *     (queda en disco aunque se cierre la pestaña en el mismo milisegundo)
 *     y además en IndexedDB como respaldo.
 *  2. Recién después se intenta enviar a Supabase, siempre en orden y de a uno.
 *  3. El cambio se borra de la bandeja SOLO cuando Supabase confirma que
 *     actualizó la fila (se verifica con .select('id')).
 *  4. Si la red falla, se cuelga (timeout 15s) o hay microcortes, el cambio
 *     queda en la bandeja y se reintenta solo cada 8s, al volver el WiFi,
 *     al volver el foco a la ventana y antes de recargar el sistema.
 *  5. Varios cambios de la misma fila se fusionan en uno solo (el más nuevo
 *     gana) para que un envío viejo nunca pise uno nuevo.
 */

const DB_NAME = 'bfit_offline_db';
const DB_VERSION = 1;
const STORE_MONTHS = 'month_cache';
const STORE_QUEUE = 'sync_queue';

const LS_OUTBOX_KEY = 'bfit_outbox_v2';
const LS_LEGACY_QUEUE_KEY = 'bfit_sync_queue';
const LS_FAILED_KEY = 'bfit_failed_mutations';
const REQUEST_TIMEOUT_MS = 15000;
const RETRY_INTERVAL_MS = 8000;

let dbInstance = null;
const listeners = new Set();

let syncStatus = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSyncing: false,
  pendingCount: 0,
  lastSyncedAt: null,
  error: null,
};

let currentSyncPromise = null;
let rerunRequested = false;

const makeUid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/* ------------------------------------------------------------------ */
/* IndexedDB                                                          */
/* ------------------------------------------------------------------ */

const getDB = () => {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }

    try {
      // Pedir al navegador que NO borre nunca los datos locales de B-FIT
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
        console.warn('IndexedDB no disponible, se usará solo localStorage:', e);
        resolve(null);
      };
    } catch (err) {
      console.warn('Error al inicializar IndexedDB:', err);
      resolve(null);
    }
  });
};

const idbRequest = (storeName, mode, fn) =>
  getDB().then((db) => {
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let result;
      const req = fn(store);
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  });

/* ------------------------------------------------------------------ */
/* Estado / listeners                                                 */
/* ------------------------------------------------------------------ */

const notifyListeners = () => {
  listeners.forEach((fn) => {
    try {
      fn({ ...syncStatus });
    } catch (e) {
      console.error('Error en listener de offlineSyncService:', e);
    }
  });
};

export const subscribeSyncStatus = (callback) => {
  listeners.add(callback);
  callback({ ...syncStatus });
  return () => listeners.delete(callback);
};

export const getSyncStatus = () => ({ ...syncStatus });

/* ------------------------------------------------------------------ */
/* Bandeja de salida en localStorage (sincrónica)                     */
/* ------------------------------------------------------------------ */

const readLocalOutbox = () => {
  try {
    const raw = localStorage.getItem(LS_OUTBOX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
};

const writeLocalOutbox = (items) => {
  try {
    localStorage.setItem(LS_OUTBOX_KEY, JSON.stringify(items));
    return true;
  } catch (e) {
    console.warn('No se pudo escribir la bandeja local (localStorage lleno?):', e);
    return false;
  }
};

/** Cantidad de cambios pendientes leída de forma sincrónica (para beforeunload). */
export const getPendingCountSync = () => readLocalOutbox().length;

/* ------------------------------------------------------------------ */
/* Caché de meses (solo para abrir la planilla sin internet)          */
/* ------------------------------------------------------------------ */

export const saveMonthCache = async (month, data) => {
  try {
    const db = await getDB();
    if (db) {
      await idbRequest(STORE_MONTHS, 'readwrite', (store) => store.put({ month, data, cachedAt: Date.now() }));
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

export const getMonthCache = async (month) => {
  try {
    const db = await getDB();
    if (db) {
      const res = await idbRequest(STORE_MONTHS, 'readonly', (store) => store.get(month));
      return res ? res.data : null;
    }
    const raw = localStorage.getItem(`bfit_cache_${month}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed ? parsed.data : null;
  } catch (err) {
    console.error(`Error al leer cache local del mes ${month}:`, err);
    return null;
  }
};

// Serializa las escrituras al caché para que dos cambios simultáneos no se pisen
let cacheChain = Promise.resolve();
const withCacheLock = (fn) => {
  const next = cacheChain.then(fn, fn);
  cacheChain = next.catch(() => {});
  return next;
};

export const updateRowInMonthCache = (month, rowId, updatedFields) =>
  withCacheLock(async () => {
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
  });

export const addRowToMonthCache = (month, newRecord) =>
  withCacheLock(async () => {
    try {
      const current = (await getMonthCache(month)) || [];
      current.push(newRecord);
      await saveMonthCache(month, current);
    } catch (err) {
      console.warn('No se pudo agregar fila al cache local:', err);
    }
  });

export const removeRowFromMonthCache = (month, rowId) =>
  withCacheLock(async () => {
    try {
      const current = await getMonthCache(month);
      if (!current) return;
      await saveMonthCache(month, current.filter((r) => r.id !== rowId));
    } catch (err) {
      console.warn('No se pudo remover fila del cache local:', err);
    }
  });

/* ------------------------------------------------------------------ */
/* Cola de cambios (outbox)                                           */
/* ------------------------------------------------------------------ */

const updatePendingCount = async () => {
  const queue = await getPendingMutations();
  syncStatus.pendingCount = queue.length;
  notifyListeners();
};

/**
 * Encola un cambio. La escritura en localStorage es SINCRÓNICA y ocurre
 * antes de cualquier await: aunque se cierre la pestaña, el cambio ya quedó en disco.
 */
export const enqueueMutation = (mutation) => {
  const item = {
    ...mutation,
    uid: makeUid(),
    timestamp: Date.now(),
    retries: 0,
  };

  // 1) Escritura sincrónica inmediata
  const outbox = readLocalOutbox();
  outbox.push(item);
  const savedInLocalStorage = writeLocalOutbox(outbox);

  // 2) Respaldo en IndexedDB (async)
  const idbWrite = idbRequest(STORE_QUEUE, 'readwrite', (store) => store.add({ ...item }))
    .catch((err) => {
      console.error('Error al guardar cambio en IndexedDB:', err);
      if (!savedInLocalStorage) {
        syncStatus.error = 'No se pudo guardar el cambio en el navegador';
      }
    });

  syncStatus.pendingCount = Math.max(syncStatus.pendingCount, outbox.length);
  notifyListeners();

  return idbWrite.then(() => {
    updatePendingCount();
    return item.uid;
  });
};

/** Une la bandeja de localStorage + IndexedDB (+ cola vieja) sin duplicados, en orden cronológico. */
export const getPendingMutations = async () => {
  const byUid = new Map();

  readLocalOutbox().forEach((item) => {
    if (item && item.uid) byUid.set(item.uid, item);
  });

  try {
    const idbItems = (await idbRequest(STORE_QUEUE, 'readonly', (store) => store.getAll())) || [];
    idbItems.forEach((item) => {
      const uid = item.uid || `idb-${item.id}`;
      if (!byUid.has(uid)) byUid.set(uid, { ...item, uid });
    });
  } catch (err) {
    console.error('Error al leer cola de IndexedDB:', err);
  }

  // Compatibilidad con la cola de versiones anteriores
  try {
    const legacy = JSON.parse(localStorage.getItem(LS_LEGACY_QUEUE_KEY) || '[]');
    if (Array.isArray(legacy)) {
      legacy.forEach((item) => {
        const uid = item.uid || `legacy-${item.id}`;
        if (!byUid.has(uid)) byUid.set(uid, { ...item, uid });
      });
    }
  } catch (e) { /* ignore */ }

  return Array.from(byUid.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
};

/** Borra cambios ya confirmados por el servidor (de todas las fuentes). */
const removeMutationsByUid = async (uids) => {
  if (!uids || uids.length === 0) return;
  const uidSet = new Set(uids);

  writeLocalOutbox(readLocalOutbox().filter((item) => !uidSet.has(item.uid)));

  try {
    const legacy = JSON.parse(localStorage.getItem(LS_LEGACY_QUEUE_KEY) || '[]');
    if (Array.isArray(legacy) && legacy.length > 0) {
      localStorage.setItem(
        LS_LEGACY_QUEUE_KEY,
        JSON.stringify(legacy.filter((item) => !uidSet.has(item.uid || `legacy-${item.id}`)))
      );
    }
  } catch (e) { /* ignore */ }

  try {
    const idbItems = (await idbRequest(STORE_QUEUE, 'readonly', (store) => store.getAll())) || [];
    const toDelete = idbItems.filter((item) => uidSet.has(item.uid || `idb-${item.id}`)).map((i) => i.id);
    if (toDelete.length > 0) {
      await idbRequest(STORE_QUEUE, 'readwrite', (store) => {
        toDelete.forEach((id) => store.delete(id));
        return null;
      });
    }
  } catch (err) {
    console.error('Error al borrar cambios confirmados de IndexedDB:', err);
  }
};

/** Mantiene compatibilidad con el export anterior. */
export const removeMutation = async (id) => {
  await removeMutationsByUid([id, `idb-${id}`, `legacy-${id}`]);
  await updatePendingCount();
};

/**
 * Cuando se inserta una fila que se cre estando offline con un tempId,
 * reasigna el ID real del servidor a todas las mutaciones que estaban en espera
 * para esa misma fila, y tambin en la cach del mes.
 */
export const remapTempIdInMemoryAndStorage = async (tempId, realId, month) => {
  if (!tempId || !realId) return;

  // 1) En localStorage outbox
  const outbox = readLocalOutbox();
  let modifiedOutbox = false;
  outbox.forEach((m) => {
    if (m.rowId === tempId) {
      m.rowId = realId;
      modifiedOutbox = true;
    }
  });
  if (modifiedOutbox) writeLocalOutbox(outbox);

  // 2) En IndexedDB STORE_QUEUE
  try {
    const idbItems = (await idbRequest(STORE_QUEUE, 'readonly', (store) => store.getAll())) || [];
    for (const m of idbItems) {
      if (m.rowId === tempId) {
        m.rowId = realId;
        await idbRequest(STORE_QUEUE, 'readwrite', (store) => store.put(m));
      }
    }
  } catch (e) {
    console.warn('Error al remapear tempId en IndexedDB:', e);
  }

  // 3) En cach del mes
  if (month) {
    try {
      const current = await getMonthCache(month);
      if (current && Array.isArray(current)) {
        const idx = current.findIndex((r) => r.id === tempId);
        if (idx !== -1) {
          current[idx] = { ...current[idx], id: realId };
          await saveMonthCache(month, current);
        }
      }
    } catch (e) {
      console.warn('Error al remapear tempId en cach de mes:', e);
    }
  }
};

/** Guarda en un listado aparte los cambios que el servidor rechazó, para poder recuperarlos a mano. */
const archiveFailed = (items, reason) => {
  try {
    const failed = JSON.parse(localStorage.getItem(LS_FAILED_KEY) || '[]');
    items.forEach((item) => failed.push({ ...item, failedAt: new Date().toISOString(), reason }));
    localStorage.setItem(LS_FAILED_KEY, JSON.stringify(failed.slice(-500)));
  } catch (e) {
    console.error('No se pudo archivar cambio fallido:', e);
  }
};

const withTimeout = (builder) => {
  if (typeof AbortController === 'undefined' || !builder || typeof builder.abortSignal !== 'function') {
    return builder;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return Promise.resolve(builder.abortSignal(controller.signal)).finally(() => clearTimeout(timer));
};

const isNetworkError = (err) => {
  const msg = String((err && (err.message || err.details)) || err || '').toLowerCase();
  return (
    (err && err.name === 'AbortError') ||
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('abort') ||
    msg.includes('timeout') ||
    msg.includes('failed to') ||
    msg.includes('load failed')
  );
};

const runSyncLoop = async (supabaseClient) => {
  do {
    rerunRequested = false;
    const queue = await getPendingMutations();
    syncStatus.pendingCount = queue.length;
    notifyListeners();
    if (queue.length === 0) break;

    const handled = new Set();
    let stop = false;

    for (const item of queue) {
      if (stop) break;
      if (handled.has(item.uid)) continue;

      const table = item.table || 'cobros';
      let group = [item];
      let payload = item.payload;

      // Fusionar TODOS los UPDATE pendientes de la misma fila (el más nuevo gana)
      if (item.type === 'UPDATE') {
        group = queue.filter(
          (q) => q.type === 'UPDATE' && (q.table || 'cobros') === table && q.rowId === item.rowId && !handled.has(q.uid)
        );
        payload = group.reduce((acc, q) => ({ ...acc, ...(q.payload || {}) }), {});
      }

      try {
        if (item.type === 'UPDATE') {
          const { data, error } = await withTimeout(
            supabaseClient.from(table).update(payload).eq('id', item.rowId).select('id')
          );
          if (error) throw error;
          if (!data || data.length === 0) {
            // La fila no existe en el servidor: no tiene sentido reintentar,
            // pero NO lo tiramos: queda archivado para recuperación manual.
            archiveFailed(group, 'La fila no existe en el servidor (0 filas actualizadas)');
          }
        } else if (item.type === 'INSERT') {
          const { data, error } = await withTimeout(
            supabaseClient.from(table).insert(item.payload).select('id')
          );
          if (error) throw error;
          if (data && data[0] && item.tempId) {
            await remapTempIdInMemoryAndStorage(item.tempId, data[0].id, item.month);
          }
        } else if (item.type === 'DELETE') {
          const { error } = await withTimeout(supabaseClient.from(table).delete().eq('id', item.rowId));
          if (error) throw error;
        }

        group.forEach((g) => handled.add(g.uid));
        await removeMutationsByUid(group.map((g) => g.uid));
        syncStatus.error = null;
      } catch (err) {
        console.warn(`Fallo al sincronizar cambio (${item.type} fila ${item.rowId}):`, err);
        syncStatus.error = (err && err.message) || 'Error de conexión durante sincronización';
        if (isNetworkError(err)) {
          // Sin red: cortar y reintentar más tarde en el mismo orden
          stop = true;
        } else {
          // Error de datos (lo rechazó el servidor): archivar para no bloquear la cola
          archiveFailed(group, syncStatus.error);
          group.forEach((g) => handled.add(g.uid));
          await removeMutationsByUid(group.map((g) => g.uid));
        }
      }
    }

    if (stop) break;
  } while (rerunRequested);
};

/**
 * Envía la bandeja a Supabase. Si ya hay un envío en curso, se agenda otra
 * vuelta al terminar (así ningún cambio nuevo queda esperando).
 */
export const processSyncQueue = (supabaseClient) => {
  if (!supabaseClient) return Promise.resolve();

  if (currentSyncPromise) {
    rerunRequested = true;
    return currentSyncPromise;
  }

  syncStatus.isSyncing = true;
  notifyListeners();

  currentSyncPromise = runSyncLoop(supabaseClient)
    .catch((err) => {
      console.error('Error inesperado en sincronización:', err);
      syncStatus.error = (err && err.message) || 'Error inesperado';
    })
    .finally(async () => {
      currentSyncPromise = null;
      syncStatus.isSyncing = false;
      syncStatus.lastSyncedAt = new Date();
      await updatePendingCount();
    });

  return currentSyncPromise;
};

/**
 * Forma recomendada de guardar: primero a disco local, después al servidor.
 */
export const saveMutation = async (supabaseClient, mutation) => {
  await enqueueMutation(mutation);
  if (typeof navigator === 'undefined' || navigator.onLine) {
    await processSyncQueue(supabaseClient);
  }
};

/* ------------------------------------------------------------------ */
/* Inicialización                                                     */
/* ------------------------------------------------------------------ */

export const initOfflineSync = (supabaseClient) => {
  if (typeof window === 'undefined') return undefined;

  const trySync = () => {
    if (navigator.onLine) processSyncQueue(supabaseClient);
  };

  const handleOnline = () => {
    syncStatus.isOnline = true;
    notifyListeners();
    processSyncQueue(supabaseClient);
  };

  const handleOffline = () => {
    syncStatus.isOnline = false;
    notifyListeners();
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') trySync();
  };

  // Antes de cerrar/recargar: forzar el guardado de la celda que se está editando
  // y avisar si todavía quedan cambios sin confirmar por el servidor.
  const handleBeforeUnload = (e) => {
    try {
      const active = document.activeElement;
      if (active && typeof active.blur === 'function' && active.tagName === 'INPUT') {
        active.blur();
      }
    } catch (err) { /* ignore */ }

    if (getPendingCountSync() > 0) {
      e.preventDefault();
      e.returnValue = 'Hay cambios que todavía se están enviando al servidor.';
      return e.returnValue;
    }
    return undefined;
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  window.addEventListener('focus', trySync);
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('beforeunload', handleBeforeUnload);

  updatePendingCount();
  trySync();

  const intervalId = setInterval(() => {
    if (navigator.onLine && !currentSyncPromise && getPendingCountSync() + syncStatus.pendingCount > 0) {
      processSyncQueue(supabaseClient);
    }
  }, RETRY_INTERVAL_MS);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    window.removeEventListener('focus', trySync);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('beforeunload', handleBeforeUnload);
    clearInterval(intervalId);
  };
};
