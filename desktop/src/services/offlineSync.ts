// desktop/src/services/offlineSync.ts

export interface OfflineMutation {
  client_mutation_id: string;
  table_name: string;
  record_uuid: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: any;
  created_at: string;
}

const STORAGE_KEY = 'valetudo_offline_mutations_queue';

export function getOfflineQueue(): OfflineMutation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function queueOfflineMutation(mutation: Omit<OfflineMutation, 'client_mutation_id' | 'created_at'>): string {
  const id = crypto.randomUUID();
  const queue = getOfflineQueue();
  const item: OfflineMutation = {
    ...mutation,
    client_mutation_id: id,
    created_at: new Date().toISOString(),
  };

  queue.push(item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  window.dispatchEvent(new Event('offline-queue-changed'));
  return id;
}

export async function replayOfflineQueue(): Promise<{ synced: number; remaining: number }> {
  const queue = getOfflineQueue();
  if (queue.length === 0) return { synced: 0, remaining: 0 };

  const token = localStorage.getItem('valetudo_token');
  if (!token) return { synced: 0, remaining: queue.length };

  try {
    const res = await fetch('https://localhost:5000/api/sync/replay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        mutations: queue,
        device_id: 'CLINIC-DESKTOP-ELECTRON',
      }),
    });

    if (res.ok) {
      const data = await res.json();
      localStorage.removeItem(STORAGE_KEY);
      window.dispatchEvent(new Event('offline-queue-changed'));
      return { synced: data.syncedCount || queue.length, remaining: 0 };
    }
  } catch (err) {
    console.warn('[Offline Sync] Server unreachable during replay attempt.');
  }

  return { synced: 0, remaining: queue.length };
}

// Auto-trigger replay whenever device regains internet connectivity
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('🌐 [Network] Connectivity restored. Replaying offline mutations...');
    replayOfflineQueue();
  });
}