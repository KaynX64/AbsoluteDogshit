// Checks responder eligibility, alert payload redaction, and flag validation.
// server/tests/responderAccess.test.js
// Run with: node --test server/tests/responderAccess.test.js
// Pure functions only — no MySQL, no Redis (the existing tests inject
// throwaway env values; responderAccess.js imports db/pool.js via pool
// creation, which never connects until a query is issued).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

process.env.ENCRYPTION_KEY ||= 'x'.repeat(40);
process.env.ENCRYPTION_SALT ||= 'responder-test-salt-0123456789';
process.env.DB_PASSWORD ||= 'responder-test-db-password';
process.env.JWT_SECRET ||= 'responder-test-jwt-secret'.repeat(3);

const {
  resolveResponderTier,
  tierFromRow,
  redactForTier,
  roleLabelFor,
  parseQualifiedResponderBody,
  LEGACY_RESPONDER_ROLES,
  CLINICAL_ROLES,
  canUpdateIncidentStatus,
  requireClinicalResponder,
} = await import('../src/emergency/responderAccess.js');
const { groupSosDevices, sosPushForMode } = await import('../src/emergency/deviceDelivery.js');

test('community actions are acknowledgment-only; staff roles retain their permissions', () => {
  const statuses = ['triggered', 'acknowledged', 'dispatched', 'resolved', 'false_alarm', 'invalid'];
  for (const [tier, expected] of [
    ['community', ['acknowledged']],
    ['clinical', ['acknowledged', 'dispatched', 'resolved', 'false_alarm']],
    [null, []], ['unknown', []],
  ]) {
    assert.deepEqual(statuses.filter(status => canUpdateIncidentStatus(tier, status)), expected);
  }
  for (const role of CLINICAL_ROLES) {
    for (const flagged of [true, false]) {
      const tier = resolveResponderTier({ isQualifiedResponder: flagged, appointmentLevel: 'staff', roles: ['STUDENT', role] });
      assert.equal(tier, flagged ? 'clinical' : null);
      for (const status of ['acknowledged', 'dispatched', 'resolved', 'false_alarm']) {
        assert.equal(canUpdateIncidentStatus(tier, status), flagged);
      }
    }
  }
  let passed = false;
  requireClinicalResponder({ responderTier: 'clinical' }, {}, () => { passed = true; });
  assert.equal(passed, true);
});

test('live route guards deny forbidden actions without transactions or broadcasts and keep acknowledgment active', async t => {
  const { pool } = await import('../src/db/pool.js');
  const keyPath = fileURLToPath(new URL('../serviceAccountKey.json', import.meta.url));
  const existsSync = fs.existsSync;
  const hideKey = t.mock.method(fs, 'existsSync', path => path !== keyPath && existsSync(path));
  let emergencyRoutes;
  try {
    ({ default: emergencyRoutes } = await import('../src/routes/emergency/index.js'));
  } finally {
    hideKey.mock.restore();
  }
  const events = [];
  const io = { to() { return this; }, emit(...args) { events.push(args); } };
  const router = emergencyRoutes(io);
  let roles = ['STUDENT'], flagged = true, active = 1;
  t.mock.method(pool, 'query', async sql => {
    if (sql.includes('RESPONDER_QUALIFICATION_SETTINGS')) return [[{enforced:1}]];
    if (sql.includes('RESPONDER_APPOINTMENTS')) {
      const appointment={appointment_id:1,status:'active',starts_at:new Date(Date.now()-1000),expires_at:new Date(Date.now()+86400000),level:roles.includes('NURSE')?'staff':'community'};
      if(sql.includes('GROUP BY'))return [[{...appointment,user_id:42,role_codes:roles.join(',')}]];
      return [flagged || roles.includes('NURSE') ? [appointment]:[]];
    }
    if (sql.includes('FROM USER_ROLES')) return [roles.map(code => ({ code }))];
    assert.ok(sql.includes('FROM USERS'), 'Only live access queries should reach the pool');
    return [[{ is_active: active, deleted_at: null, is_qualified_responder: flagged }]];
  });
  let currentStatus = 'triggered';
  const mutations = [];
  const connection = {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async query(sql, params) {
      if (sql.includes('UPDATE EMERGENCY_ALERTS')) {
        if (!params.at(-1).includes(currentStatus)) return [{ affectedRows: 0 }];
        currentStatus = params[0];
        mutations.push(currentStatus);
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT status')) return [[{ status: currentStatus }]];
      if (sql.includes('SELECT resolved_at')) return [[{ resolved_at: new Date('2026-11-21T00:00:00Z') }]];
      if (sql.includes('FROM USERS FORCE INDEX (PRIMARY)') || sql.includes('UPDATE AUDIT_CHAIN_STATE')) return [[]];
      if (sql.includes('FROM AUDIT_CHAIN_STATE')) return [[{ last_entry_hash: '0'.repeat(64) }]];
      assert.ok(sql.includes('INSERT INTO AUDIT_LOGS'));
      mutations.push('audit');
      return [{ insertId: 1 }];
    },
  };
  const acquire = t.mock.method(pool, 'getConnection', async () => connection);

  // Invoke the real route chain after authentication, including its live access lookup.
  const request = (path, method = 'get', status) => new Promise((resolve, reject) => {
    const route = router.stack.find(({ route }) => route?.path === path && route.methods[method]).route;
    const req = { user: { user_id: 42, roles: ['ADMIN'] }, params: { alertId: '9' }, query: {}, body: { status }, get() {} };
    let code = 200, index = 1;
    const res = { status(value) { code = value; return this; }, set() {}, json(body) { resolve({ status: code, body }); } };
    const next = () => {
      try { Promise.resolve(route.stack[index++].handle(req, res, next)).catch(reject); } catch (error) { reject(error); }
    };
    next();
  });
  for (const status of ['dispatched', 'resolved', 'false_alarm']) {
    const result = await request('/:alertId/status', 'patch', status);
    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'RESPONDER_ACTION_FORBIDDEN');
  }
  for (const [path, method] of [
    ['/incident-reports/pending', 'get'],
    ['/:alertId/incident-report', 'get'],
    ['/:alertId/incident-report', 'post'],
    ['/history', 'get'], ['/history/:alertId', 'get'], ['/report-summary', 'get'],
    ['/report-worklist', 'get'], ['/reports', 'get'], ['/reports/:reportId', 'get'],
    ['/:alertId/incident-report-draft', 'get'], ['/:alertId/incident-report-draft', 'put'],
  ]) {
    const result = await request(path, method);
    assert.equal(result.status, 403);
    assert.equal(result.body.code, 'RESPONDER_ACTION_FORBIDDEN');
  }
  assert.equal(acquire.mock.callCount(), 0);
  assert.deepEqual(mutations, []);
  assert.deepEqual(events, []);

  assert.equal((await request('/:alertId/status', 'patch', 'acknowledged')).status, 200);
  assert.equal(currentStatus, 'acknowledged');
  assert.deepEqual(mutations, ['acknowledged', 'audit']);
  assert.equal(events.some(([name]) => name === 'emergency:incident_report_required'), false);
  assert.equal(events.find(([name]) => name === 'emergency:status_change')[1].status, 'acknowledged');
  assert.equal((await request('/:alertId/status', 'patch', 'acknowledged')).status, 409);

  // Role grants are read live; the stale ADMIN claim above never grants access.
  roles = ['NURSE']; flagged = false;
  assert.equal((await request('/:alertId/status', 'patch', 'dispatched')).status, 200);
  assert.equal((await request('/:alertId/status', 'patch', 'resolved')).status, 200);
  assert.equal(currentStatus, 'resolved');
  assert.equal((await request('/:alertId/status', 'patch', 'false_alarm')).status, 409);
  const beforeDenied = acquire.mock.callCount();
  roles = ['STUDENT'];
  assert.equal((await request('/:alertId/status', 'patch', 'acknowledged')).status, 403);
  flagged = true; active = 0;
  assert.equal((await request('/:alertId/status', 'patch', 'acknowledged')).status, 403);
  assert.equal(acquire.mock.callCount(), beforeDenied);
});

// Verify that SOS push groups separate legacy, audible, quiet and off-duty registrations.
test('SOS push groups separate legacy, audible, quiet and off-duty registrations', () => {
  // Create a push registration with a specific installation, device type, and SOS mode.
  const device = (fcm_token, installation_id, sos_mode, device_type = 'android') => ({
    fcm_token, installation_id, sos_mode, device_type,
  });
  assert.deepEqual(groupSosDevices([
    device('legacy', null, 'on_duty'),
    device('phone-1', 'one', 'on_duty'),
    device('phone-2', 'two', 'quiet'),
    device('phone-3', 'three', 'off_duty'),
    device('older-ios', null, 'on_duty', 'ios'),
  ]), {
    legacy: ['legacy', 'older-ios'], on_duty: ['phone-1'], quiet: ['phone-2'],
  });
  const incident = { alertId: 7, latitude: 16.1, longitude: 120.2 };
  const silent = sosPushForMode('quiet', incident);
  assert.deepEqual(silent.data, { type: 'EMERGENCY_SOS', alertId: 7 });
  assert.equal(silent.androidNotification.channelId, 'responder_sos_quiet_v1');
  assert.equal(sosPushForMode('on_duty', incident).androidNotification.channelId, 'responder_sos_audible_v1');
  const legacy = sosPushForMode('legacy', incident);
  assert.equal(legacy.androidNotification.channelId, 'emergency_sos_channel_v4');
  assert.equal(legacy.data.latitude, 16.1);
  assert.equal(legacy.title, silent.title);
});

// Verify that the self capability reflects live access while the alert list still rejects a denied user.
test('the self capability reflects live access while the alert list still rejects a denied user', async (t) => {
  const { pool } = await import('../src/db/pool.js');
  const keyPath = fileURLToPath(new URL('../serviceAccountKey.json', import.meta.url));
  const existsSync = fs.existsSync;
  // Hide the local Firebase credential from the responder route test.
  const hideKey = t.mock.method(fs, 'existsSync', (path) => path !== keyPath && existsSync(path));
  const { default: emergencyRoutes } = await import('../src/routes/emergency/index.js');
  hideKey.mock.restore();

  const router = emergencyRoutes();
  // Get a responder route by path for a direct handler test.
  const getRoute = (path) => router.stack.find(/* Match the router entry that owns the requested path. */ ({ route }) => route?.path === path).route;
  const capability = getRoute('/responder-access').stack.at(-1).handle;
  const requireActiveAccess = getRoute('/active').stack[1].handle;
  const req = { user: { user_id: 42 }, query: { userId: 99 } };
  let flagged = false;
  let role = 'DENTIST';
  // Simulate live responder roles and qualification for the fixture account.
  t.mock.method(pool,'query',async(sql,params)=>{
    if(sql.includes('RESPONDER_QUALIFICATION_SETTINGS'))return [[{enforced:1}]];
    assert.deepEqual(params,[42]);
    if(sql.includes('RESPONDER_APPOINTMENTS'))return [flagged || role==='DOCTOR' ? [{appointment_id:1,status:'active',level:'staff',starts_at:new Date(Date.now()-1000),expires_at:new Date(Date.now()+86400000)}]:[]];
    if(sql.includes('FROM USER_ROLES'))return [[{code:role}]];
    return [[{is_active:1,deleted_at:null,is_qualified_responder:flagged}]];
  });
  // Call the eligibility handler and capture its headers and JSON body.
  const check = async (authorized, tier = null) => {
    const headers = {};
    let body;
    await capability(req, {
      // Save the header set by the eligibility handler.
      set(name, value) { headers[name] = value; },
      // Capture the responder capability payload.
      json(value) { body = value; },
    });
    assert.equal(body.authorized,authorized); assert.equal(body.tier,tier); assert.equal(body.isQualifiedResponder,authorized);
    assert.equal(headers['Cache-Control'], 'no-store');
  };

  await check(false);
  // Run the active alert guard and wait for its denial response.
  const denied = await new Promise((resolve, reject) => {
    // Fail the test if the denied caller reaches the next handler.
    requireActiveAccess(req, {
      // Assert that a denied caller receives HTTP 403.
      status(code) {
        assert.equal(code, 403);
        return this;
      },
      // Resolve with the body returned by the alert authorization guard.
      json(body) { resolve(body); },
    }, () => reject(new Error('Unflagged dentist passed the alert-list guard')));
  });
  assert.equal(denied.code, 'RESPONDER_ACCESS_DENIED');
  flagged = true;
  await check(true, 'clinical');
  flagged = false;
  await check(false);
  role = 'DOCTOR';
  await check(true, 'clinical');
});

test('tier helpers require approval and explicitly granted staff level',()=>{
 assert.equal(resolveResponderTier({roles:['NURSE']}),null);
 assert.equal(resolveResponderTier({roles:['ADMIN'],isQualifiedResponder:true}), 'community');
 assert.equal(resolveResponderTier({roles:['DOCTOR'],isQualifiedResponder:true,appointmentLevel:'staff'}),'clinical');
 assert.equal(resolveResponderTier({roles:['DOCTOR'],isQualifiedResponder:true,appointmentLevel:'community'}),'community');
 assert.equal(tierFromRow({hasClinicalRole:true}),null);
 assert.equal(tierFromRow({isQualifiedResponder:true,hasClinicalRole:true,appointmentLevel:'staff'}),'clinical');
 assert.ok(CLINICAL_ROLES.includes('DENTIST'));
 assert.ok(!CLINICAL_ROLES.includes('ADMIN'));
 assert.ok(!LEGACY_RESPONDER_ROLES.includes('DENTIST'));
});

// ── Payload redaction ──────────────────────────────────────────────────────
// Build a complete fixture alert with clinical, contact, and location fields.
const fullPayload = () => ({
  alertId: 7,
  patientName: 'Daniella Movida',
  phone: '09211234571',
  role: 'STUDENT',
  roleLabel: 'Student',
  studentNo: '22-LN-0123',
  course: 'BS Information Technology',
  bloodType: 'O+',
  allergies: 'Penicillin',
  chronicConditions: 'Mild Asthma',
  emergencyContact: 'Maria Movida (09299876543)',
  latitude: 16.0298,
  longitude: 120.2285,
  formattedAddress: 'PSU Lingayen',
  googleMapsUrl: 'https://www.google.com/maps?q=16.0298,120.2285',
});

// Check that the community response strips protected medical fields.
test('redaction: community tier loses every medical detail', () => {
  const out = redactForTier(fullPayload(), 'community');
  assert.equal(out.medicalDetailsRedacted, true);
  assert.equal(out.bloodType, undefined);
  assert.equal(out.allergies, undefined);
  assert.equal(out.chronicConditions, undefined);
  assert.equal(out.emergencyContact, undefined);
});

// Check which identity, contact, and location fields remain visible to community responders.
test('redaction: identity, contact and location survive the community tier', () => {
  const out = redactForTier(fullPayload(), 'community');
  assert.equal(out.patientName, 'Daniella Movida');
  assert.equal(out.phone, '09211234571');
  assert.equal(out.studentNo, '22-LN-0123');
  assert.equal(out.formattedAddress, 'PSU Lingayen');
  assert.equal(out.googleMapsUrl, 'https://www.google.com/maps?q=16.0298,120.2285');
});

// Compare the original field values with the clinical recipient's payload.
test('redaction: clinical tier keeps everything and is marked unredacted', () => {
  const inP = fullPayload();
  const out = redactForTier(inP, 'clinical');
  assert.equal(out.medicalDetailsRedacted, false);
  assert.equal(out.bloodType, 'O+');
  assert.equal(out.allergies, 'Penicillin');
  assert.equal(out.emergencyContact, 'Maria Movida (09299876543)');
});

// Check that the community filter also removes SQL-style field names in active alert rows.
test('redaction: snake_case keys (/active rows) are stripped for community too', () => {
  const out = redactForTier({ alert_id: 9, blood_type: 'O+', allergies: 'Dust' }, 'community');
  assert.equal(out.blood_type, undefined);
  assert.equal(out.allergies, undefined);
  assert.equal(out.medicalDetailsRedacted, true);
});

// Verify that redaction never mutates the caller payload.
test('redaction never mutates the caller payload', () => {
  const inP = fullPayload();
  redactForTier(inP, 'community');
  assert.equal(inP.bloodType, 'O+');
});

// ── roleLabel ──────────────────────────────────────────────────────────────
// Check the shared labels for student and non-teaching accounts.
test('roleLabelFor covers STUDENT and NON_TEACHING (old map missed them)', () => {
  assert.equal(roleLabelFor('STUDENT'), 'Student');
  assert.equal(roleLabelFor('NON_TEACHING'), 'Non-Teaching Staff');
  assert.equal(roleLabelFor('DENTIST'), 'Campus Dentist');
  assert.equal(roleLabelFor(null), 'Student');
});

// ── PUT /users/:id/qualified-responder input validation ────────────────────
// Reject a responder qualification flag with a non-boolean value.
test('flag endpoint body: boolean required', () => {
  assert.equal(parseQualifiedResponderBody({}).ok, false);
  assert.equal(parseQualifiedResponderBody({ is_qualified_responder: 'yes' }).ok, false);
  assert.equal(parseQualifiedResponderBody({ is_qualified_responder: 1 }).ok, false);
  assert.equal(parseQualifiedResponderBody({ is_qualified_responder: true }).ok, true);
  assert.equal(parseQualifiedResponderBody({ is_qualified_responder: false }).ok, true);
});

// Check that notes are trimmed and that oversized notes fail validation.
test('flag endpoint body: note trimmed and length-checked', () => {
  const long = 'x'.repeat(151);
  assert.equal(parseQualifiedResponderBody({ is_qualified_responder: true, note: long }).ok, false);
  const okNote = parseQualifiedResponderBody({ is_qualified_responder: true, note: '  First-aid certified  ' });
  assert.equal(okNote.value.note, 'First-aid certified');
  const noNote = parseQualifiedResponderBody({ is_qualified_responder: true });
  assert.equal(noNote.value.note, null);
});
