// desktop/src/services/offlineSync.ts
//
// Offline mutation queue & bootstrap cache.
//
// Transport priority:
//   1. Electron IPC → embedded SQLite (production desktop)
//   2. localStorage fallback (Vite dev in a browser, web preview)
//
// The localStorage store is always kept as a mirror so the sidebar
// badge can read the count synchronously without async churn.
import { API_BASE_URL } from '../config/api';

export interface OfflineMutation {
  client_mutation_id: string;
  table_name: string;
  record_uuid: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: any;
  created_at: string;
  user_id?: number;
  device_id?: string;
  local_version?: number;
}

const STORAGE_KEY = 'valetudo_offline_mutations_queue';
const SYNC_TIME_KEY = 'valetudo_last_sync_time';
const DEVICE_ID = 'CLINIC-DESKTOP-ELECTRON';

function hasBridge(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!(window as any).electronAPI?.offlineQueueMutation
  );
}

/* ── localStorage mirror (sync accessors + web fallback) ────────── */
function readMirror(): OfflineMutation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as OfflineMutation[]) : [];
  } catch {
    return [];
  }
}

function writeMirror(queue: OfflineMutation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    /* quota exceeded — non-fatal */
  }
}

/* ── Public: sync count for UI badges ───────────────────────────── */
export function getOfflineQueue(): OfflineMutation[] {
  return readMirror();
}

/* ── Public: async refresh from the SQLite backend ──────────────── */
export async function refreshOfflineQueueFromBackend(): Promise<number> {
  if (hasBridge()) {
    try {
      const rows = await (window as any).electronAPI.offlineGetPendingMutations();
      const queue: OfflineMutation[] = Array.isArray(rows) ? rows : [];
      writeMirror(queue);
      window.dispatchEvent(new Event('offline-queue-changed'));
      return queue.length;
    } catch {
      /* fall through */
    }
  }
  return readMirror().length;
}

/* ── Public: enqueue a new mutation ─────────────────────────────── */
export async function queueOfflineMutation(
  mutation: Omit<OfflineMutation, 'client_mutation_id' | 'created_at'>
): Promise<string> {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const item: OfflineMutation = {
    ...mutation,
    client_mutation_id: id,
    created_at: new Date().toISOString(),
    device_id: DEVICE_ID,
    user_id: 0,
    local_version: 1,
  };

  // Always update the localStorage mirror so the badge stays live.
  const mirror = readMirror();
  mirror.push(item);
  writeMirror(mirror);

  // Prefer the SQLite backend when running inside Electron.
  if (hasBridge()) {
    try {
      await (window as any).electronAPI.offlineQueueMutation(item);
    } catch (err) {
      console.warn('[offlineSync] SQLite enqueue failed, mirror retained:', err);
    }
  }

  window.dispatchEvent(new Event('offline-queue-changed'));
  return id;
}

/* ── Public: replay pending mutations against the server ────────── */
export async function replayOfflineQueue(): Promise<{
  synced: number;
  remaining: number;
}> {
  // Always ask the backend for the freshest pending set.
  const queue = await (async () => {
    if (hasBridge()) {
      try {
        const rows = await (window as any).electronAPI.offlineGetPendingMutations();
        if (Array.isArray(rows) && rows.length > 0) {
          writeMirror(rows);
          return rows as OfflineMutation[];
        }
      } catch {
        /* fall through */
      }
    }
    return readMirror();
  })();

  if (queue.length === 0) return { synced: 0, remaining: 0 };

  const token = localStorage.getItem('valetudo_token');
  if (!token) return { synced: 0, remaining: queue.length };

  try {
    const res = await fetch(`${API_BASE_URL}/api/sync/replay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ mutations: queue, device_id: DEVICE_ID }),
    });

    if (!res.ok) {
      return { synced: 0, remaining: queue.length };
    }

    const data = await res.json();
    const results: any[] = Array.isArray(data.results) ? data.results : [];
    
    // Track conflicts to notify the UI
    const conflicts: any[] = [];

    // Process each replayed mutation
    for (const r of results) {
      const ok = r.status === 'synced' || r.status === 'already_synced';
      
      if (ok) {
        if (hasBridge()) {
          try {
            await (window as any).electronAPI.offlineMarkSynced({
              client_mutation_id: r.client_mutation_id,
              server_record_id: r.serverRecordId ?? null,
            });
          } catch {
            /* non-fatal */
          }
        }
      } else if (r.status === 'conflict' || r.status === 'error') {
        conflicts.push(r);
        
        // Mark as failed in SQLite so it's excluded from future 'pending' fetches
        // This prevents infinite retry loops for logically broken mutations
        if (hasBridge()) {
          try {
            await (window as any).electronAPI.offlineMarkFailed({
              client_mutation_id: r.client_mutation_id,
              sync_status: r.status,
              error_message: r.error || 'Sync failed or conflict detected',
            });
          } catch {
            /* non-fatal */
          }
        }
      }
    }

    // For the localStorage fallback path, drop everything we just processed
    if (!hasBridge()) {
      const stillFailing = queue.filter((m) => {
        const r = results.find((x) => x.client_mutation_id === m.client_mutation_id);
        return !r || (r.status !== 'synced' && r.status !== 'already_synced' && r.status !== 'conflict' && r.status !== 'error');
      });
      writeMirror(stillFailing);
    }

    // Notify the UI about conflicts so the doctor can manually review them
    if (conflicts.length > 0) {
      console.warn('[OfflineSync] Conflicts detected:', conflicts);
      window.dispatchEvent(
        new CustomEvent('offline-sync-conflict', { detail: conflicts })
      );
    }

    window.dispatchEvent(new Event('offline-queue-changed'));
    const remaining = await refreshOfflineQueueFromBackend();
    
    return { synced: data.syncedCount || 0, remaining };
  } catch (err) {
    console.warn('[offlineSync] Replay failed:', err);
    return { synced: 0, remaining: queue.length };
  }
}

/* ── Bootstrap: preload patient + EMR cache after login ────────── */
export async function bootstrapOfflineCache(): Promise<void> {
  const token = localStorage.getItem('valetudo_token');
  if (!token || !hasBridge()) return; // web preview: nothing to seed

  // Delta Sync: Retrieve the last known server time to only fetch changes
  const lastSync = localStorage.getItem(SYNC_TIME_KEY);
  const queryParams = lastSync ? `?lastSyncedAt=${encodeURIComponent(lastSync)}` : '';

  try {
    const res = await fetch(`${API_BASE_URL}/api/sync/bootstrap${queryParams}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    if (!res.ok) return;
    
    const data = await res.json();
    
    await (window as any).electronAPI.offlineCacheBootstrap({
      patients: data.patients || [],
      emrRecords: data.emrRecords || [],
    });

    // Save the server time for the next delta sync
    if (data.serverTime) {
      localStorage.setItem(SYNC_TIME_KEY, data.serverTime);
    }

    console.log(
      `📦 [Offline] Delta synced ${data.patients?.length || 0} patients, ${
        data.emrRecords?.length || 0
      } EMR records into SQLite`
    );
  } catch (err) {
    console.warn('[Offline] Bootstrap failed (non-fatal):', err);
  }
}

/* ── Auto-replay on reconnect ───────────────────────────────────── */
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('🌐 [Network] Connectivity restored. Replaying offline mutations…');
    replayOfflineQueue();
  });
}