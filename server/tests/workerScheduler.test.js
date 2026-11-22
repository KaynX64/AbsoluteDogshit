// Tests startup jobs, overlap prevention, failure isolation, and shutdown draining.

import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { test } from 'node:test';
import { getWorkerStats, startScheduler } from '../src/workers/scheduler.js';

// Verify that each job skips its own busy ticks and stopping drains pending work.
test('each job skips its own busy ticks and stopping drains pending work', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { promise, resolve } = Promise.withResolvers();
  // Return pending work so the test can exercise overlapping job ticks.
  const slow = t.mock.fn(() => promise);
  const fast = t.mock.fn();
  const stop = startScheduler([
    { name: 'Slow job', intervalMs: 10, run: slow },
    { name: 'Fast job', intervalMs: 10, run: fast },
  ]);

  assert.equal(slow.mock.callCount(), 0);
  assert.equal(fast.mock.callCount(), 0);
  t.mock.timers.tick(10);
  await setImmediate();
  t.mock.timers.tick(10);
  await setImmediate();
  assert.equal(slow.mock.callCount(), 1);
  assert.equal(fast.mock.callCount(), 2);

  const drained = t.mock.fn();
  const stopping = stop().then(drained);
  t.mock.timers.tick(100);
  await setImmediate();
  assert.equal(drained.mock.callCount(), 0);
  resolve();
  await stopping;
  await stop();
  assert.equal(slow.mock.callCount(), 1);
  assert.equal(fast.mock.callCount(), 2);
});

// Verify that a worker failure is logged and the job runs again on the next tick.
test('a worker failure is logged and the job runs again on the next tick', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  // Capture worker error logs without printing the expected failure.
  const log = t.mock.method(console, 'error', () => {});
  const run = t.mock.fn();
  // Simulate a single failed run before allowing the next scheduled tick.
  run.mock.mockImplementationOnce(() => {
    throw new Error('fixture failure');
  });
  const stop = startScheduler([{ name: 'Retrying job', intervalMs: 10, run }]);

  t.mock.timers.tick(10);
  await setImmediate();
  assert.deepEqual(log.mock.calls.map(/* Extract the recorded console call arguments for the failure assertion. */ call => call.arguments), [
    ['[Retrying job Error]:', 'Error'],
  ]);

  t.mock.timers.tick(10);
  await stop();
  assert.equal(run.mock.callCount(), 2);
  // Find the tested worker's telemetry after it resumes.
  const stats = getWorkerStats().find(job => job.name === 'Retrying job');
  assert.equal(stats.failures, 1);
  assert.equal(stats.outcome, 'success');
  assert.ok(stats.lastSuccessAt);
});

// Verify that only opted-in jobs run at startup and a busy startup run skips the next tick.
test('only opted-in jobs run at startup and a busy startup run skips the next tick', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { promise, resolve } = Promise.withResolvers();
  // Hold the immediate startup run open to check that the next tick skips it.
  const immediate = t.mock.fn(() => promise);
  const deferred = t.mock.fn();
  const stop = startScheduler([
    { name: 'Immediate', intervalMs: 10, run: immediate, runImmediately: true },
    { name: 'Deferred', intervalMs: 10, run: deferred },
  ]);
  await setImmediate();
  assert.equal(immediate.mock.callCount(), 1);
  assert.equal(deferred.mock.callCount(), 0);
  t.mock.timers.tick(10);
  await setImmediate();
  assert.equal(immediate.mock.callCount(), 1);
  assert.equal(deferred.mock.callCount(), 1);
  resolve();
  await stop();
});
