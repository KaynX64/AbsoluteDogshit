import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import express from 'express';
import nodemailer from 'nodemailer';
import { renderAppointmentEmail } from '../src/appointments/emailTemplates.js';

Object.assign(process.env, {
  DB_PASSWORD: 'fixture-password', JWT_SECRET: 'fixture-jwt-secret'.repeat(3),
  SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: '587', SMTP_USER: '', SMTP_PASS: '',
  SMTP_TEST_RECIPIENTS: 'saved@example.invalid, SAVED@example.invalid, invalid',
});

let deliver;
const createTransport = mock.method(nodemailer, 'createTransport', options => {
  assert.equal(options.requireTLS, true);
  return { sendMail: message => deliver(message) };
});
const { default: policyRoutes } = await import('../src/routes/admin/serverPolicy.js');
const { registerBookingCancellation } = await import('../src/routes/appointments/booking/cancellation.js');
const { pool } = await import('../src/db/pool.js');
createTransport.mock.restore();

function handler(router, method, path) {
  return router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
}

function response(onRespond = () => {}) {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; onRespond(); return this; },
  };
}

test('scheduling templates use Philippine wall time, safe HTML and matching plain text', () => {
  const fixture = { dateTime: '2026-11-27 09:30:00', patientName: '<Sample & Patient>', purpose: 'private purpose' };
  for (const [type, title] of Object.entries({
    confirmation: 'Your appointment is confirmed', reminder: 'Your appointment is coming up', cancellation: 'Your appointment was cancelled',
  })) {
    const { html, text, subject } = renderAppointmentEmail({ ...fixture, type });
    assert.match(subject, /^LeoVital \| /);
    assert.ok(html.includes(title) && text.includes(title));
    const clinic = 'Pangasinan State University Lingayen Campus Clinic';
    assert.ok(html.includes(clinic) && text.includes(clinic));
    assert.ok(html.includes('&lt;Sample &amp; Patient&gt;') && !html.includes(fixture.patientName));
    assert.ok(text.includes(fixture.patientName));
    assert.ok(html.includes('Friday, November 27, 2026 at 9:30 AM (Philippine time)'));
    assert.ok(text.includes('Friday, November 27, 2026 at 9:30 AM (Philippine time)'));
    assert.ok(!text.includes(fixture.purpose) && !html.includes(fixture.purpose));
    assert.equal(text.includes('QR Health Pass'), type !== 'cancellation');
  }
  assert.match(renderAppointmentEmail({ ...fixture, type: 'reminder', patientName: '' }).text, /\bHello,/);
});

test('admin test combines unique saved and manual recipients, labels the sample and reports partial failure', async t => {
  const sent = [];
  deliver = async message => {
    sent.push(message);
    if (message.to.address === 'manual@example.invalid') throw Object.assign(new Error('fixture SMTP failure'), { code: 'EENVELOPE' });
    return { accepted: [message.to.address] };
  };
  t.mock.method(console, 'error', () => {});
  t.mock.method(pool, 'query', async () => assert.fail('Test email should not use the database'));
  const get = handler(policyRoutes, 'get', '/email-test');
  const post = handler(policyRoutes, 'post', '/email-test');
  const config = response();
  get({}, config);
  assert.deepEqual(config.body, { smtpConfigured: true, recipients: ['saved@example.invalid'] });
  for (const body of [
    { template: 'unrecognized', recipients: ['saved@example.invalid'] },
    { template: 'reminder', recipients: ['mailbox@example.invalid, second@example.invalid'] },
    { template: 'reminder', recipients: Array.from({ length: 6 }, (_, index) => `mailbox${index}@example.invalid`) },
  ]) {
    const invalid = response();
    await post({ body }, invalid);
    assert.equal(invalid.statusCode, 400);
  }
  assert.equal(sent.length, 0);

  const result = response();
  await post({ body: { template: 'cancellation', recipients: ['saved@example.invalid', ' SAVED@example.invalid ', 'manual@example.invalid'] } }, result);
  assert.deepEqual(result.body, { results: [
    { address: 'saved@example.invalid', accepted: true }, { address: 'manual@example.invalid', accepted: false },
  ] });
  assert.deepEqual(sent.map(message => message.to.address), ['saved@example.invalid', 'manual@example.invalid']);
  for (const message of sent) {
    assert.equal(message.from.name, 'LeoVital');
    assert.equal(message.subject, '[TEST] LeoVital | Appointment cancelled');
    assert.match(message.html, /Test email · Sample appointment/);
    assert.match(message.text, /Hi Sample Patient/);
    assert.match(message.text, /Your appointment was cancelled/);
  }
});

test('cancellation sends after commit and release, skips repeats and leaves SMTP failures out of the response', async t => {
  let status = 'scheduled';
  let rejectCommit = false;
  const actions = [];
  const connection = {
    async beginTransaction() {},
    async commit() {
      if (rejectCommit) throw new Error('fixture commit failure');
      actions.push('commit');
    },
    async rollback() { actions.push('rollback'); },
    release() { actions.push('release'); },
    async query(sql) {
      if (sql.includes('FROM APPOINTMENTS')) return [[{
        patient_user_id: 5, doctor_user_id: 2, status, clinic_date_time: '2026-11-27 09:30:00',
      }]];
      if (sql.includes('FROM AUDIT_CHAIN_STATE')) return [[{ last_entry_hash: '0'.repeat(64) }]];
      if (sql.includes('INSERT INTO AUDIT_LOGS')) return [{ insertId: 1 }];
      return [{}];
    },
  };
  t.mock.method(pool, 'getConnection', async () => connection);
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.match(sql, /SELECT email, first_name, last_name FROM USERS/);
    assert.deepEqual(params, [5]);
    actions.push('lookup');
    return [[{ email: 'patient@example.invalid', first_name: 'Sample', last_name: 'Patient' }]];
  });
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});
  deliver = async message => {
    assert.equal(message.to.address, 'patient@example.invalid');
    assert.equal(message.subject, 'LeoVital | Appointment cancelled');
    actions.push('smtp');
    throw Object.assign(new Error('fixture SMTP failure'), { code: 'ETIMEDOUT' });
  };
  const router = express.Router();
  registerBookingCancellation(router);
  const cancel = handler(router, 'patch', '/:id/cancel');
  const run = async userId => {
    actions.length = 0;
    const res = response(() => actions.push('response'));
    await cancel({ params: { id: '21' }, body: { cancelled_reason: 'private reason' }, user: { user_id: userId }, ip: '127.0.0.1' }, res);
    await setImmediate();
    return res;
  };

  assert.equal((await run(6)).statusCode, 403);
  assert.deepEqual(actions, ['rollback', 'response', 'release']);
  rejectCommit = true;
  assert.equal((await run(5)).statusCode, 400);
  assert.ok(!actions.includes('smtp'));
  rejectCommit = false;
  assert.equal((await run(5)).statusCode, 200);
  assert.deepEqual(actions, ['commit', 'release', 'response', 'lookup', 'smtp']);
  status = 'cancelled';
  assert.equal((await run(5)).statusCode, 200);
  assert.ok(!actions.includes('lookup') && !actions.includes('smtp'));
});
