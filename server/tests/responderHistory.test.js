import test from 'node:test';
import assert from 'node:assert/strict';
process.env.ENCRYPTION_KEY ||= 'history-fixture-key'.repeat(3);
process.env.ENCRYPTION_SALT ||= 'history-fixture-salt-1234';
process.env.JWT_SECRET ||= 'history-fixture-token'.repeat(3);
process.env.DB_PASSWORD ||= 'fixture';
const { historyOptions, pageResult, likeTerm } = await import('../src/emergency/historyQuery.js');
const { saveDraft, readDraft, deleteDraft } = await import('../src/emergency/reportDrafts.js');
const { pool } = await import('../src/db/pool.js');
const { canReadFiledReports, requireDesktopReportClient } = await import('../src/emergency/historyAccess.js');
const { readHistoryPage, readAlertHistory } = await import('../src/emergency/historyRead.js');

test('history filters validate Manila date bounds and scope stable pagination cursors', () => {
  const options = historyOptions({ period: 'custom', from: '2026-11-01', to: '2026-11-22', limit: '1' }, 'history');
  assert.equal(new Date(options.start * 1000).toISOString(), '2026-10-31T16:00:00.000Z');
  assert.equal(new Date(options.end * 1000).toISOString(), '2026-11-22T16:00:00.000Z');
  const page = pageResult([{ sortAt: 9, sortId: 2 }, { sortAt: 9, sortId: 1 }], options);
  assert.equal(page.records.length, 1);
  assert.deepEqual(historyOptions({ period: 'custom', from: '2026-11-01', to: '2026-11-22', before: page.nextCursor }, 'history').cursor, { scope: options.scope, at: 9, id: 2 });
  assert.throws(() => historyOptions({ before: page.nextCursor, search: 'different' }, 'history'));
  for (const query of [{ limit: '0' }, { limit: '101' }, { status: 'dispatched' }, { period: 'custom', from: '2026-02-30', to: '2026-03-01' }]) assert.throws(() => historyOptions(query, 'history'));
  assert.equal(historyOptions({}, 'pending').start, null, 'Pending tasks never expire from the default view');
  assert.equal(likeTerm('10%_!'), '%10!%!_!!%');
});

test('encrypted drafts are private, revision guarded and never audit narrative text', async t => {
  const rows = new Map(), audits = [];
  let filed = false, status = 'resolved', connections = 0;
  const query = async (sql, params = []) => {
    const key = `${params.at(-2)}:${params.at(-1)}`;
    if (sql.includes('SELECT alert_id, status')) return [[{ alert_id: 9, status }]];
    if (sql.includes('SELECT report_id FROM INCIDENT_REPORTS')) return [filed ? [{ report_id: 7 }] : []];
    if (sql.includes('SELECT revision FROM INCIDENT_REPORT_DRAFTS') || sql.includes('SELECT payload, revision')) return [rows.has(`${params[0]}:${params[1]}`) ? [rows.get(`${params[0]}:${params[1]}`)] : []];
    if (sql.includes('INSERT INTO INCIDENT_REPORT_DRAFTS')) {
      rows.set(`${params[0]}:${params[1]}`, { payload: params[2], revision: params[3], updated_at: new Date(), deferred_at: params[4] ? new Date() : null }); return [{ affectedRows: 1 }];
    }
    if (sql.includes('UPDATE INCIDENT_REPORT_DRAFTS')) {
      const row = rows.get(key); Object.assign(row, { payload: params[0], revision: params[1] }); if (params[2]) row.deferred_at = new Date(); return [{ affectedRows: 1 }];
    }
    if (sql.includes('DELETE FROM INCIDENT_REPORT_DRAFTS')) {
      const key = `${params[0]}:${params[1]}`, row = rows.get(key);
      if (row?.revision !== params[2]) return [{ affectedRows: 0 }]; rows.delete(key); return [{ affectedRows: 1 }];
    }
    if (sql.includes('FROM USERS FORCE INDEX (PRIMARY)') || sql.includes('UPDATE AUDIT_CHAIN_STATE')) return [[]];
    if (sql.includes('FROM AUDIT_CHAIN_STATE')) return [[{ last_entry_hash: '0'.repeat(64) }]];
    if (sql.includes('INSERT INTO AUDIT_LOGS')) { audits.push(JSON.parse(params[5])); return [{ insertId: 1 }]; }
    assert.fail('Unexpected draft query');
  };
  t.mock.method(pool, 'query', query);
  t.mock.method(pool, 'getConnection', async () => { connections++; return { query, async beginTransaction() {}, async commit() {}, async rollback() {}, release() {} }; });
  const body = { revision: 0, incidentDetails: 'Private fixture narrative', treatmentNotes: 'Private fixture handover', resolvedAt: '2026-11-22T00:00:00Z', defer: true };
  assert.deepEqual(await saveDraft({ alertId: 9, authorId: 42, body }), { revision: 1 });
  assert.match(rows.get('9:42').payload, /^enc:v2:/);
  assert.equal(rows.get('9:42').payload.includes('Private fixture'), false);
  const mine = await readDraft(9, 42);
  assert.equal(mine.incidentDetails, body.incidentDetails);
  assert.ok(mine.deferredAt);
  assert.equal((await readDraft(9, 43)).incidentDetails, '');
  await assert.rejects(saveDraft({ alertId: 9, authorId: 42, body }), { code: 'DRAFT_REVISION_CONFLICT' });
  assert.deepEqual(await saveDraft({ alertId: 9, authorId: 42, body: { ...body, revision: 1, incidentDetails: 'Next saved version' } }), { revision: 2 });
  await assert.rejects(deleteDraft({ alertId: 9, authorId: 43, revision: 2 }), { code: 'DRAFT_REVISION_CONFLICT' });
  assert.equal((await readDraft(9, 42)).revision, 2);
  assert.equal(JSON.stringify(audits).includes('Private fixture'), false);
  assert.equal(JSON.stringify(audits).includes('Next saved'), false);
  const beforeInvalid = connections;
  await assert.rejects(saveDraft({ alertId: 9, authorId: 42, body: { ...body, incidentDetails: 'x'.repeat(4001) } }));
  assert.equal(connections, beforeInvalid);
  filed = true;
  await assert.rejects(saveDraft({ alertId: 9, authorId: 42, body: { ...body, revision: 2 } }), { code: 'REPORT_ALREADY_FILED' });
  filed = false; status = 'false_alarm';
  await assert.rejects(readDraft(9, 42), { code: 'ALERT_NOT_RESOLVED' });
});

test('Limited Admin archive grants apply from live roles, including mixed-role accounts', async t => {
  let roles = ['NURSE'], codes = ['USERS_MANAGE'];
  t.mock.method(pool, 'query', async sql => [sql.includes('USER_ROLES') ? roles.map(code => ({ code })) : codes.map(code => ({ code }))]);
  assert.equal(await canReadFiledReports(42), true);
  roles = ['ADMIN', 'NURSE'];
  assert.equal(await canReadFiledReports(42), false);
  codes.push('INCIDENT_RECORDS_VIEW');
  assert.equal(await canReadFiledReports(42), true);
  codes = [];
  assert.equal(await canReadFiledReports(42), true);
});

test('report write requests require the supported desktop identifier separately from staff authorization', () => {
  let denied, allowed = false;
  requireDesktopReportClient({ get() {} }, { status(value) { assert.equal(value, 403); return this; }, json(body) { denied = body.code; } }, () => assert.fail());
  assert.equal(denied, 'DESKTOP_REPORT_REQUIRED');
  requireDesktopReportClient({ get: () => 'fdb4b48e-1985-48ca-85ea-168d48ed047a' }, {}, () => { allowed = true; });
  assert.equal(allowed, true);
});

test('history queries use bounded keyset pages and report timelines never invent dispatch events', async t => {
  let pageSql;
  t.mock.method(pool, 'query', async (sql, params) => {
    if (sql.includes('FROM AUDIT_LOGS')) return [[]];
    pageSql = sql;
    assert.equal(params[0], 42);
    return [[{ alert_id: 9, user_id: 5, status: 'resolved', patient_name: 'Fixture', created_seconds: 100, acknowledged_seconds: 110, resolved_seconds: 200, sort_seconds: 100, sort_id: 9 }]];
  });
  const page = await readHistoryPage(42, 'pending', historyOptions({ search: 'SOS-9' }, 'pending'));
  assert.equal(page.records[0].needsReport, true);
  assert.match(pageSql, /LIMIT \?/);
  assert.match(pageSql, /a.resolved_at ASC, a.alert_id ASC/);
  assert.doesNotMatch(pageSql, /INTERVAL 24 HOUR/);
  const detail = await readAlertHistory(42, 9);
  assert.deepEqual(detail.timeline.map(event => event.status), ['triggered', 'acknowledged', 'resolved']);
  assert.equal(detail.timeline.every(event => event.actor === null), true);
});
