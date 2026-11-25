import { monitorEventLoopDelay } from 'node:perf_hooks';

const eventLoop = monitorEventLoopDelay({ resolution: 20 });
eventLoop.enable();
const timings = new Map();
let transactionRetries = 0;

export function recordLoadTiming(name, milliseconds) {
  const sample = timings.get(name) ?? { count: 0, totalMs: 0, maxMs: 0 };
  sample.count++;
  sample.totalMs += milliseconds;
  sample.maxMs = Math.max(sample.maxMs, milliseconds);
  timings.set(name, sample);
}

export function recordTransactionRetry() { transactionRetries++; }

export function loadMetrics() {
  return {
    transactionRetries,
    eventLoopP99Ms: Math.round(eventLoop.percentile(99) / 1e6),
    timing: Object.fromEntries([...timings].map(([name, sample]) => [name, {
      count: sample.count, meanMs: sample.totalMs / sample.count, maxMs: sample.maxMs,
    }])),
  };
}
