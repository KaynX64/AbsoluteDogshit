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
} = await import('../src/utils/responderAccess.js');

test('the self capability reflects live access while the alert list still rejects a denied user', async (t) => {
  const { pool } = await import('../src/db/pool.js');
  const keyPath = fileURLToPath(new URL('../serviceAccountKey.json', import.meta.url));
  const existsSync = fs.existsSync;
  const hideKey = t.mock.method(fs, 'existsSync', (path) => path !== keyPath && existsSync(path));
  const { default: emergencyRoutes } = await import('../src/routes/emergency/index.js');
  hideKey.mock.restore();

  const router = emergencyRoutes();
  const getRoute = (path) => router.stack.find(({ route }) => route?.path === path).route;
  const capability = getRoute('/responder-access').stack.at(-1).handle;
  const requireActiveAccess = getRoute('/active').stack[1].handle;
  const req = { user: { user_id: 42 }, query: { userId: 99 } };
  let flagged = false;
  let role = 'DENTIST';
  t.mock.method(pool, 'query', async (sql, params) => {
    assert.deepEqual(params, [42]);
    return sql.includes('is_qualified_responder')
      ? [[{ is_active: 1, deleted_at: null, is_qualified_responder: flagged }]]
      : [[{ code: role }]];
  });
  const check = async (expected) => {
    const headers = {};
    let body;
    await capability(req, {
      set(name, value) { headers[name] = value; },
      json(value) { body = value; },
    });
    assert.deepEqual(body, { authorized: expected });
    assert.equal(headers['Cache-Control'], 'no-store');
  };

  await check(false);
  const denied = await new Promise((resolve, reject) => {
    requireActiveAccess(req, {
      status(code) {
        assert.equal(code, 403);
        return this;
      },
      json(body) { resolve(body); },
    }, () => reject(new Error('Unflagged dentist passed the alert-list guard')));
  });
  assert.equal(denied.code, 'RESPONDER_ACCESS_DENIED');
  flagged = true;
  await check(true);
  flagged = false;
  await check(false);
  role = 'DOCTOR';
  await check(true);
});

// ── Tier resolution ────────────────────────────────────────────────────────
test('tier: clinical role wins even without the flag', () => {
  assert.equal(resolveResponderTier({ isQualifiedResponder: false, roles: ['NURSE'] }), 'clinical');
  assert.equal(resolveResponderTier({ isQualifiedResponder: false, roles: ['DENTIST'] }), 'clinical');
});

test('tier: flagged non-clinical account is community', () => {
  assert.equal(resolveResponderTier({ isQualifiedResponder: true, roles: ['STUDENT'] }), 'community');
  assert.equal(resolveResponderTier({ isQualifiedResponder: true, roles: ['FACULTY'] }), 'community');
  assert.equal(resolveResponderTier({ isQualifiedResponder: true, roles: ['NON_TEACHING'] }), 'community');
});

test('tier: unflagged non-clinical account is null (no SOS access)', () => {
  assert.equal(resolveResponderTier({ isQualifiedResponder: false, roles: ['STUDENT'] }), null);
  assert.equal(resolveResponderTier({ isQualifiedResponder: false, roles: [] }), null);
});

test('tier: flag on a clinical account stays clinical (flag is additive)', () => {
  assert.equal(resolveResponderTier({ isQualifiedResponder: true, roles: ['DOCTOR'] }), 'clinical');
});

test('tierFromRow mirrors resolveResponderTier', () => {
  assert.equal(tierFromRow({ isQualifiedResponder: true, hasClinicalRole: false }), 'community');
  assert.equal(tierFromRow({ isQualifiedResponder: false, hasClinicalRole: true }), 'clinical');
  assert.equal(tierFromRow({ isQualifiedResponder: false, hasClinicalRole: false }), null);
});

test('role lists: DENTIST is clinical but not a legacy recipient', () => {
  assert.ok(CLINICAL_ROLES.includes('DENTIST'));
  assert.ok(!LEGACY_RESPONDER_ROLES.includes('DENTIST')); // unflagged dentists never received SOS
});

// ── Payload redaction ──────────────────────────────────────────────────────
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

test('redaction: community tier loses every medical detail', () => {
  const out = redactForTier(fullPayload(), 'community');
  assert.equal(out.medicalDetailsRedacted, true);
  assert.equal(out.bloodType, undefined);
  assert.equal(out.allergies, undefined);
  assert.equal(out.chronicConditions, undefined);
  assert.equal(out.emergencyContact, undefined);
});

test('redaction: identity, contact and location survive the community tier', () => {
  const out = redactForTier(fullPayload(), 'community');
  assert.equal(out.patientName, 'Daniella Movida');
  assert.equal(out.phone, '09211234571');
  assert.equal(out.studentNo, '22-LN-0123');
  assert.equal(out.formattedAddress, 'PSU Lingayen');
  assert.equal(out.googleMapsUrl, 'https://www.google.com/maps?q=16.0298,120.2285');
});

test('redaction: clinical tier keeps everything and is marked unredacted', () => {
  const inP = fullPayload();
  const out = redactForTier(inP, 'clinical');
  assert.equal(out.medicalDetailsRedacted, false);
  assert.equal(out.bloodType, 'O+');
  assert.equal(out.allergies, 'Penicillin');
  assert.equal(out.emergencyContact, 'Maria Movida (09299876543)');
});

test('redaction: snake_case keys (/active rows) are stripped for community too', () => {
  const out = redactForTier({ alert_id: 9, blood_type: 'O+', allergies: 'Dust' }, 'community');
  assert.equal(out.blood_type, undefined);
  assert.equal(out.allergies, undefined);
  assert.equal(out.medicalDetailsRedacted, true);
});

test('redaction never mutates the caller payload', () => {
  const inP = fullPayload();
  redactForTier(inP, 'community');
  assert.equal(inP.bloodType, 'O+');
});

// ── roleLabel ──────────────────────────────────────────────────────────────
test('roleLabelFor covers STUDENT and NON_TEACHING (old map missed them)', () => {
  assert.equal(roleLabelFor('STUDENT'), 'Student');
  assert.equal(roleLabelFor('NON_TEACHING'), 'Non-Teaching Staff');
  assert.equal(roleLabelFor('DENTIST'), 'Campus Dentist');
  assert.equal(roleLabelFor(null), 'Student');
});

// ── PUT /users/:id/qualified-responder input validation ────────────────────
test('flag endpoint body: boolean required', () => {
  assert.equal(parseQualifiedResponderBody({}).ok, false);
  assert.equal(parseQualifiedResponderBody({ is_qualified_responder: 'yes' }).ok, false);
  assert.equal(parseQualifiedResponderBody({ is_qualified_responder: 1 }).ok, false);
  assert.equal(parseQualifiedResponderBody({ is_qualified_responder: true }).ok, true);
  assert.equal(parseQualifiedResponderBody({ is_qualified_responder: false }).ok, true);
});

test('flag endpoint body: note trimmed and length-checked', () => {
  const long = 'x'.repeat(151);
  assert.equal(parseQualifiedResponderBody({ is_qualified_responder: true, note: long }).ok, false);
  const okNote = parseQualifiedResponderBody({ is_qualified_responder: true, note: '  First-aid certified  ' });
  assert.equal(okNote.value.note, 'First-aid certified');
  const noNote = parseQualifiedResponderBody({ is_qualified_responder: true });
  assert.equal(noNote.value.note, null);
});
