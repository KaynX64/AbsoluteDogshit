import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { recordLoadTiming } from '../bootstrap/loadMetrics.js';

export const snapshotMaxAgeMs = 5_000;
const refreshIntervalMs = 2_000;
const refreshBudgetMs = 2_400;

let worker;
let terminating;
let inFlight;
let timer;
let snapshot;
let lastRequestAt = -Infinity;
let lastStart = -Infinity;
let active = true;

function retireWorker() {
  const current = worker;
  worker = undefined;
  if (current) {
    terminating = current.terminate().catch(() => {}).finally(() => { terminating = undefined; });
  }
  return terminating;
}

function schedule() {
  clearTimeout(timer);
  if (!active || performance.now() - lastRequestAt >= 60_000) return;
  const wait = Math.max(0, lastStart + refreshIntervalMs - performance.now());
  timer = setTimeout(() => { void refresh(); }, wait).unref();
}

function refresh() {
  if (inFlight || !active) return inFlight;
  lastStart = performance.now();
  inFlight = (async () => {
    await terminating;
    if (!active) return;
    if (!worker) {
      worker = new Worker(new URL('./snapshotWorker.js', import.meta.url));
      worker.on('error', error => console.warn('[Analytics worker]', error.code ?? error.name));
      worker.unref();
    }
    const current = worker;
    const result = await new Promise(resolve => {
      function settle(result) {
        clearTimeout(deadline);
        current.off('message', settle);
        current.off('error', failed);
        current.off('exit', failed);
        resolve(result);
      }
      function failed() { settle({ error: 'WORKER_EXIT' }); }
      const deadline = setTimeout(() => settle({ error: 'REFRESH_TIMEOUT' }), refreshBudgetMs).unref();
      current.once('message', settle);
      current.once('error', failed);
      current.once('exit', failed);
      current.postMessage('refresh');
    });
    if (result?.data) snapshot = result;
    else if (active && result?.error) {
      console.warn('[Analytics refresh]', result.error);
      await retireWorker();
    }
  })().catch(error => {
    console.warn('[Analytics refresh]', error.code ?? error.name);
    return retireWorker();
  }).finally(() => {
    inFlight = undefined;
    schedule();
  });
  return inFlight;
}

function freshSnapshot() {
  if (!snapshot) return null;
  const age = Date.now() - snapshot.asOf;
  return age >= 0 && age <= snapshotMaxAgeMs ? snapshot : null;
}

export async function getDashboardSnapshot() {
  lastRequestAt = performance.now();
  const current = freshSnapshot();
  if (current) {
    if (!inFlight) schedule();
    return current;
  }
  let deadline;
  try {
    await Promise.race([refresh(), new Promise(resolve => { deadline = setTimeout(resolve, refreshBudgetMs).unref(); })]);
  } finally { clearTimeout(deadline); }
  return freshSnapshot();
}

export async function stopDashboardSnapshots() {
  active = false;
  clearTimeout(timer);
  await retireWorker();
  await inFlight;
}

export function recordSnapshotAge(asOf) { recordLoadTiming('snapshotAge', Date.now() - asOf); }
