import { API_BASE_URL } from '../../config/api';

export interface OfflineMutation {
  client_mutation_id: string;
  table_name: string;
  record_uuid: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: Record<string, unknown>;
  created_at: string;
  user_id: number;
  device_id: string;
  local_version: number;
}

const LEGACY_QUEUE = 'valetudo_offline_mutations_queue';
const DEVICE_ID = 'CLINIC-DESKTOP-ELECTRON';
const BATCH_SIZE = 25;
const storageUnavailable = 'Encrypted offline storage is unavailable. Your changes remain in the form.';
let session: { userId: number; token: string; canClaimLegacy: boolean; initialized: Promise<void>; controller: AbortController } | undefined;
let replay: { active: NonNullable<typeof session>; promise: Promise<ReplayOutcome> } | undefined;

type ReplayOutcome = { synced: number; remaining: number; failed: number };
type ReplayResult = { client_mutation_id: string; status: string; serverRecordId?: number; error?: string };

function changed() {
  window.dispatchEvent(new Event('offline-queue-changed'));
}

async function migrateMirror(api: ElectronAPI) {
  const raw = localStorage.getItem(LEGACY_QUEUE);
  if (raw === null) return;
  await api.offlineImportLegacy(JSON.parse(raw));
  // If interrupted, the main process uses mutation IDs to make re-import safe.
  localStorage.removeItem(LEGACY_QUEUE);
}

export function setOfflineAccount(userId: number | null, token = '', canClaimLegacy = false) {
  session?.controller.abort();
  session = undefined;
  const api = window.electronAPI;
  if (userId === null) {
    void api?.offlineSetAccount(null).catch(() => {});
    changed();
    return;
  }
  const initialized = api ? api.offlineSetAccount(userId).then(() => migrateMirror(api)) : Promise.resolve();
  session = { userId, token, canClaimLegacy, initialized, controller: new AbortController() };
  void initialized.then(changed, changed);
}

export function waitForOfflineAccount() {
  return session?.initialized;
}

export async function offlineQueueStatus() {
  const active = session;
  const empty = { pending: 0, needsReview: 0, unassigned: 0 };
  if (!active || !window.electronAPI) return empty;
  await active.initialized;
  if (session !== active) return empty;
  const counts = await window.electronAPI.offlinePendingCount();
  return session === active ? counts : empty;
}

export async function queueOfflineMutation(mutation: Pick<OfflineMutation, 'table_name' | 'record_uuid' | 'action' | 'payload'>) {
  const api = window.electronAPI;
  const active = session;
  if (!api || !active) throw new Error(storageUnavailable);
  const id = crypto.randomUUID();
  try {
    await active.initialized;
    if (session !== active) throw new Error('Account changed.');
    const result = await api.offlineQueueMutation({
      ...mutation,
      client_mutation_id: id,
      created_at: new Date().toISOString(),
      device_id: DEVICE_ID,
      user_id: active.userId,
      local_version: 1,
    });
    if (!result.success) throw new Error('Offline storage did not acknowledge the save.');
  } catch {
    throw new Error(storageUnavailable);
  }
  changed();
  return id;
}

async function postSync<T>(active: NonNullable<typeof session>, endpoint: string, body: object): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/sync/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${active.token}` },
    signal: AbortSignal.any([active.controller.signal, AbortSignal.timeout(20_000)]),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('The server could not sync the queued changes.');
  return response.json();
}

async function claimLegacy(api: ElectronAPI, active: NonNullable<typeof session>) {
  if (!active.canClaimLegacy) return;
  const ids = await api.offlineUnassignedAppointments();
  if (!ids.length) return;
  for (let offset = 0; offset < ids.length; offset += 100) {
    const requested = ids.slice(offset, offset + 100);
    const { appointmentIds } = await postSync<{ appointmentIds: number[] }>(active, 'legacy-ownership', { appointmentIds: requested });
    if (session !== active) return;
    await api.offlineAssignLegacy({ userId: active.userId, ids: appointmentIds.filter(id => requested.includes(id)) });
  }
  changed();
}

async function sendBatch(active: NonNullable<typeof session>, queue: OfflineMutation[]): Promise<ReplayResult[]> {
  // Respect Express's default JSON body limit even when edits vary widely in size.
  const body = { mutations: queue, device_id: DEVICE_ID };
  if (queue.length > 1 && new TextEncoder().encode(JSON.stringify(body)).length >= 90_000) {
    const middle = Math.ceil(queue.length / 2);
    const first = await sendBatch(active, queue.slice(0, middle));
    const second = await sendBatch(active, queue.slice(middle));
    return [...first, ...second];
  }
  const { results } = await postSync<{ results: ReplayResult[] }>(active, 'replay', body);
  if (!Array.isArray(results)) throw new Error('The server returned an invalid sync result.');
  return results;
}

export function replayOfflineQueue(): Promise<ReplayOutcome> {
  const active = session;
  const api = window.electronAPI;
  if (!active || !api) return Promise.resolve({ synced: 0, remaining: 0, failed: 0 });
  if (replay?.active === active) return replay.promise;

  const promise = (async () => {
    await active.initialized;
    if (session !== active) return { synced: 0, remaining: 0, failed: 0 };
    await claimLegacy(api, active);
    let synced = 0;
    const failures: ReplayResult[] = [];
    while (session === active) {
      const queue: OfflineMutation[] = await api.offlineGetPendingMutations(BATCH_SIZE);
      if (!queue.length || session !== active) break;
      const results = await sendBatch(active, queue);
      if (session !== active) break;
      const requested = new Set(queue.map(row => row.client_mutation_id));
      let acknowledged = 0;
      for (const result of results) {
        if (!requested.delete(result.client_mutation_id)) continue;
        const params = { client_mutation_id: result.client_mutation_id, user_id: active.userId };
        if (result.status === 'synced' || result.status === 'already_synced') {
          const stored = await api.offlineMarkSynced({ ...params, server_record_id: result.serverRecordId });
          if (stored.success) { synced++; acknowledged++; }
        } else if (result.status === 'conflict' || result.status === 'error') {
          const stored = await api.offlineMarkFailed({ ...params, sync_status: result.status });
          if (stored.success) { failures.push(result); acknowledged++; }
        }
      }
      if (acknowledged !== queue.length) break;
    }
    if (session === active && failures.length) {
      window.dispatchEvent(new CustomEvent('offline-sync-conflict', { detail: failures }));
    }
    return session === active
      ? { synced, remaining: (await offlineQueueStatus()).pending, failed: failures.length }
      : { synced: 0, remaining: 0, failed: 0 };
  })().finally(() => {
    if (replay?.promise === promise) replay = undefined;
    changed();
  });
  replay = { active, promise };
  return promise;
}
