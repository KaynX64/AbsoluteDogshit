// Schedules background jobs, skips overlapping runs, reports metrics, and drains active work.

import { recordOperation } from '../bootstrap/operationEvents.js';
import { performance } from 'node:perf_hooks';

const workerStats = new Map();

// Return snapshots of the current background worker telemetry.
export function getWorkerStats() {
  // Copy a worker's telemetry record before returning it to callers.
  return Array.from(workerStats.values(), state => ({ ...state }));
}

// Schedule the supplied jobs and return a function that stops and drains them.
export function startScheduler(jobs) {
  let stopped = false;
  // Set up the interval and telemetry state for one background job.
  const timers = jobs.map(({ name, intervalMs, run, runImmediately = false }) => {
    let inFlight;
    const state = { name, running: false, skippedTicks: 0, runs: 0, failures: 0,
      lastStartedAt: null, lastFinishedAt: null, lastSuccessAt: null, durationMs: null, outcome: null, metrics: null };
    workerStats.set(name, state);
    // Run a job when idle and record a skipped tick when a previous run is still active.
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
        // Record the completed run's outcome and metrics for telemetry.
        .then(result => {
          state.metrics = result?.metrics ?? state.metrics;
          state.outcome = result?.skipped ? 'skipped' : result?.degraded ? 'degraded' : 'success';
          if (result?.degraded) {
            state.failures++;
            recordOperation(name + ' completed with errors.');
          }
          if (state.outcome === 'success') state.lastSuccessAt = new Date().toISOString();
        })
        // Count and report a failed background run.
        .catch(error => {
          state.failures++;
          state.outcome = 'failed';
          recordOperation(name + ' failed.');
          console.error(`[${name} Error]:`, error?.code ?? error?.name ?? 'Error');
        })
        // Clear the running flag and record when the job settled.
        .finally(() => {
          state.running = false;
          state.lastFinishedAt = new Date().toISOString();
          state.durationMs = Math.round(performance.now() - started);
          inFlight = undefined;
        });
    };
    const timer = setInterval(tick, intervalMs);
    if (runImmediately) tick();
    return { timer, /* Expose the active job promise to the shutdown path. */ pending: () => inFlight };
  });

  // Stop scheduling ticks and wait for all in-flight jobs.
  return async function stop() {
    stopped = true;
    for (const { timer } of timers) clearInterval(timer);
    // Collect work promises from the scheduled jobs for draining.
    await Promise.all(timers.map(({ pending }) => pending()));
  };
}
