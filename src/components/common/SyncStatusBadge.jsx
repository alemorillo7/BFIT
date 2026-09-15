import React, { useEffect, useState } from 'react';
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle 
} from 'lucide-react';
import { 
  subscribeSyncStatus, 
  processSyncQueue 
} from '../../services/offlineSyncService';
import { supabaseCobros } from '../../lib/supabaseCobrosClient';
import './SyncStatusBadge.css';

export default function SyncStatusBadge({ compact = false }) {
  const [status, setStatus] = useState({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    pendingCount: 0,
    lastSyncedAt: null,
    error: null,
  });

  useEffect(() => {
    const unsubscribe = subscribeSyncStatus((newStatus) => {
      setStatus(newStatus);
    });
    return unsubscribe;
  }, []);

  const handleManualSync = (e) => {
    e.stopPropagation();
    if (!status.isSyncing) {
      processSyncQueue(supabaseCobros);
    }
  };

  // 1. Sincronizando actualmente
  if (status.isSyncing) {
    return (
      <div 
        className={`sync-badge sync-badge--syncing ${compact ? 'sync-badge--compact' : ''}`}
        title={`Sincronizando ${status.pendingCount} cambio(s) con la base de datos...`}
      >
        <RefreshCw size={compact ? 12 : 14} className="spinner" />
        <span>{compact ? `${status.pendingCount}` : `Sincronizando (${status.pendingCount})...`}</span>
      </div>
    );
  }

  // 2. Sin conexión a internet
  if (!status.isOnline) {
    return (
      <div 
        className={`sync-badge sync-badge--offline ${compact ? 'sync-badge--compact' : ''}`}
        title="Sin conexión a internet. Los cambios se guardan localmente y se subirán solos al volver el WiFi."
      >
        <WifiOff size={compact ? 12 : 14} />
        <span>
          {compact 
            ? `Offline ${status.pendingCount > 0 ? `(${status.pendingCount})` : ''}`
            : status.pendingCount > 0 
              ? `Sin conexión (${status.pendingCount} guardado${status.pendingCount > 1 ? 's' : ''})` 
              : 'Modo sin conexión'}
        </span>
      </div>
    );
  }

  // 3. Con conexión pero con cambios en cola (ej. reconectando o error temporal)
  if (status.pendingCount > 0) {
    return (
      <button 
        type="button"
        className={`sync-badge sync-badge--pending ${compact ? 'sync-badge--compact' : ''}`}
        onClick={handleManualSync}
        title={`${status.pendingCount} cambio(s) guardados en el navegador. Haz clic para forzar sincronización con Supabase.`}
      >
        <AlertTriangle size={compact ? 12 : 14} />
        <span>{compact ? `${status.pendingCount} pend.` : `${status.pendingCount} pendiente${status.pendingCount > 1 ? 's' : ''} (Sincronizar)`}</span>
      </button>
    );
  }

  // 4. Conectado y todo sincronizado
  return (
    <div 
      className={`sync-badge sync-badge--synced ${compact ? 'sync-badge--compact' : ''}`}
      title="Conectado y todo sincronizado con Supabase"
    >
      <CheckCircle2 size={compact ? 12 : 14} />
      <span>{compact ? 'OK' : 'Sincronizado'}</span>
    </div>
  );
}
