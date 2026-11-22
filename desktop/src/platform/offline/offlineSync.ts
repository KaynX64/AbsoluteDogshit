import { API_BASE_URL } from '../../config/api';
import { waitForOfflineAccount } from './offlineQueue';
import { saveBootstrapPages } from './offlineBootstrap';

const SYNC_TIME_KEY = 'valetudo_last_sync_time';
const PAGED_SYNC_TIME_KEY = 'valetudo_last_sync_time_v2';
let cacheBootstrap: { token: string; promise: Promise<void> } | undefined;

/* ── Bootstrap: preload patient + EMR cache after login ────────── */
export function bootstrapOfflineCache(): Promise<void> {
  const token = localStorage.getItem('valetudo_token');
  if (!token || !window.electronAPI?.offlineCacheBootstrap) return Promise.resolve();
  if (cacheBootstrap?.token === token) return cacheBootstrap.promise;

  const promise = writeOfflineCache(token).finally(() => {
    if (cacheBootstrap?.promise === promise) cacheBootstrap = undefined;
  });
  cacheBootstrap = { token, promise };
  return promise;
}

async function writeOfflineCache(token: string): Promise<void> {
  try {
    await waitForOfflineAccount();
    const checkpoint = localStorage.getItem(PAGED_SYNC_TIME_KEY);
    const legacyCheckpoint = localStorage.getItem(SYNC_TIME_KEY);
    const isCurrentSession = () => localStorage.getItem('valetudo_token') === token;

    const result = await saveBootstrapPages(
      cursor => {
        const params = new URLSearchParams({ paging: '1' });
        if (cursor) params.set('cursor', cursor);
        else {
          if (checkpoint && Number.isFinite(Date.parse(checkpoint))) params.set('checkpoint', checkpoint);
          if (legacyCheckpoint) params.set('lastSyncedAt', legacyCheckpoint);
        }
        return fetch(`${API_BASE_URL}/api/sync/bootstrap?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      },
      async page => {
        if (!isCurrentSession()) return false;
        const saved = await window.electronAPI?.offlineCacheBootstrap(page);
        if (saved?.success !== true) console.warn('[Offline] SQLite cache write failed. The previous sync checkpoint was kept.');
        return saved?.success === true && isCurrentSession();
      },
    );
    if (!result || !isCurrentSession()) return;

    localStorage.setItem(result.paged ? PAGED_SYNC_TIME_KEY : SYNC_TIME_KEY, result.checkpoint);

    if (import.meta.env.DEV) {
      console.debug(`[Offline] Patient roster refreshed: ${result.patientCount} records.`);
      console.debug(`[Offline] EMR updates saved: ${result.encounterCount} records.`);
    }
  } catch (err) {
    console.warn('[Offline] Bootstrap failed (non-fatal):', err);
  }
}
