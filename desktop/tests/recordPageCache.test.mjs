import assert from 'node:assert/strict';
import test from 'node:test';
import { RecordPageCache } from '../src/features/emergency/RecordPageCache.ts';

test('tab reads reuse recent results, including empty lists, and share pending requests', async () => {
  const cache = new RecordPageCache();
  let calls = 0, release;
  const loader = async () => { calls++; await new Promise(resolve => { release = resolve; }); return []; };
  const first = cache.read('drafts', loader);
  assert.equal(cache.read('drafts', loader), first);
  await Promise.resolve(); release();
  assert.deepEqual(await first, []);
  assert.deepEqual(await cache.read('drafts', loader), []);
  assert.equal(calls, 1);
});

test('invalidation keeps snapshots visible but forces the next read to revalidate', async () => {
  const cache = new RecordPageCache();
  cache.put('pending', ['old']);
  cache.invalidate();
  assert.deepEqual(cache.peek('pending'), ['old']);
  assert.deepEqual(await cache.read('pending', async () => ['new']), ['new']);
  assert.deepEqual(cache.peek('pending'), ['new']);
});

test('freshness expires without extending the lifetime on cached reads', async t => {
  let now = 0, calls = 0;
  t.mock.method(Date, 'now', () => now);
  const cache = new RecordPageCache();
  const load = async () => ++calls;
  assert.equal(await cache.read('pending', load), 1);
  now = 14000;
  assert.equal(await cache.read('pending', load), 1);
  now = 16000;
  assert.equal(await cache.read('pending', load), 2);
});

test('a failed refresh keeps its snapshot and can be retried', async () => {
  const cache = new RecordPageCache();
  cache.put('filed', ['saved']);
  await assert.rejects(cache.read('filed', async () => { throw Error('offline'); }, true), /offline/);
  assert.deepEqual(cache.peek('filed'), ['saved']);
  assert.deepEqual(await cache.read('filed', async () => ['retried'], true), ['retried']);
});

test('access loss cancels in-flight results and prevents repopulation after clear', async () => {
  const cache = new RecordPageCache();
  let release, signal;
  cache.put('filed', ['private']);
  const read = cache.read('filed', async value => { signal = value; await new Promise(resolve => { release = resolve; }); return ['late']; }, true);
  await Promise.resolve();
  cache.clear();
  assert.equal(signal.aborted, true);
  assert.equal(cache.peek('filed'), undefined);
  release();
  await assert.rejects(read, { name: 'AbortError' });
  assert.equal(cache.peek('filed'), undefined);
});

test('search cancellation and a bounded cache discard obsolete data', async () => {
  const cache = new RecordPageCache();
  let release;
  const read = cache.read('search', async () => { await new Promise(resolve => { release = resolve; }); return ['obsolete']; });
  await Promise.resolve(); cache.cancel('search'); release();
  await assert.rejects(read, { name: 'AbortError' });
  for (let i = 0; i < 9; i++) cache.put(String(i), i);
  assert.equal(cache.peek('0'), undefined);
  assert.equal(cache.peek('8'), 8);
});
