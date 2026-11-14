import { recordOperation } from '../bootstrap/operationEvents.js';
import { performance } from 'node:perf_hooks';

const workerStats = new Map();

export function getWorkerStats() {
  return Array.from(workerStats.values(), state => ({ ...state }));
}

export function startScheduler(jobs) {
  let stopped = false;
  const timers = jobs.map(({ name, intervalMs, run, runImmediately = false }) => {
    let inFlight;
    const state = { name, running: false, skippedTicks: 0, runs: 0, failures: 0,
      lastStartedAt: null, lastFinishedAt: null, lastSuccessAt: null, durationMs: null, outcome: null, metrics: null };
    workerStats.set(name, state);
    const tick = () => {
      if (stopped) return;
      if (inFlight) {
        state.skippedTicks++;
        return;
      }
      const started = performance.now();
      state.running = true;
      state.runs++;
      state.lastStartedAt = new Date().toISOString();

      inFlight = Promise.resolve()
        .then(run)
        .then(result => {
          state.metrics = result?.metrics ?? state.metrics;
          state.outcome = result?.skipped ? 'skipped' : result?.degraded ? 'degraded' : 'success';
          if (result?.degraded) {
            state.failures++;
            recordOperation(name + ' completed with errors.');
          }
          if (state.outcome === 'success') state.lastSuccessAt = new Date().toISOString();
        })
        .catch(error => {
          state.failures++;
          state.outcome = 'failed';
          recordOperation(name + ' failed.');
          console.error(`[${name} Error]:`, error?.code ?? error?.name ?? 'Error');
        })
        .finally(() => {
          state.running = false;
          state.lastFinishedAt = new Date().toISOString();
          state.durationMs = Math.round(performance.now() - started);
          inFlight = undefined;
        });
    };
    const timer = setInterval(tick, intervalMs);
    if (runImmediately) tick();
    return { timer, pending: () => inFlight };
  });

  return async function stop() {
    stopped = true;
    for (const { timer } of timers) clearInterval(timer);
    await Promise.all(timers.map(({ pending }) => pending()));
  };
}
