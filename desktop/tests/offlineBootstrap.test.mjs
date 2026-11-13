import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saveBootstrapPages } from '../src/services/offlineBootstrap.ts';

const serverTime = '2026-11-12T10:00:00.000Z';
const page = (nextCursor, id = 1) => Response.json({
  serverTime, nextCursor, patients: [{ user_id: id }], emrRecords: [{ emr_id: id }],
});

test('publishes a checkpoint only after saving every page', async () => {
  const saved = [];
  const result = await saveBootstrapPages(
    async cursor => cursor ? page(null, 2) : page('second'),
    async data => {
      saved.push(data.emrRecords[0].emr_id);
      return true;
    },
  );
  assert.deepEqual(saved, [1, 2]);
  assert.deepEqual(result, { checkpoint: serverTime, paged: true, patientCount: 2, encounterCount: 2 });
});

test('an interrupted SQLite write leaves the checkpoint unavailable', async () => {
  let attempts = 0;
  const result = await saveBootstrapPages(
    async cursor => cursor ? page(null, 2) : page('second'),
    async () => ++attempts === 1,
  );
  assert.equal(attempts, 2);
  assert.equal(result, null);
});

test('legacy responses use the legacy checkpoint and repeated cursors fail', async () => {
  assert.equal((await saveBootstrapPages(async () => page(undefined), async () => true)).paged, false);
  await assert.rejects(
    saveBootstrapPages(async () => page('repeated'), async () => true),
    /Invalid offline bootstrap page/,
  );
});
