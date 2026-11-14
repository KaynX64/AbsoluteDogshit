// Verifies live session grouping, account details, and filtering of expired sockets.

import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DB_PASSWORD ||= 'fixture';
const { listConnectedSessions, disconnectSessionSockets } = await import('../src/realtime/presence.js');
const now = Date.parse('2026-11-14T08:00:00Z');

function makeSocket(userId, jti, age, expiresIn = 60) {
  return {
    user: { user_id: userId, jti, iat: now / 1000 - 180, exp: now / 1000 + expiresIn },
    data: { connectedAt: now - age * 1000 }, connected: true,
    disconnect() { this.connected = false; },
  };
}

test('presence groups windows per session, uses live roles, and excludes disconnected or expired sessions', async () => {
  const first = makeSocket(7, 'first', 120);
  const second = makeSocket(7, 'first', 30);
  const other = makeSocket(7, 'other', 5);
  const expired = makeSocket(8, 'expired', 900, -1);
  const inactive = makeSocket(9, 'inactive', 10);
  const io = { of: () => ({ sockets: new Map([first, second, other, expired, inactive].map((socket, i) => [i, socket])) }) };
  const database = { async query(_sql, [ids]) {
    assert.deepEqual(ids, [7, 9]);
    return [[{ user_id: 7, first_name: 'Fixture', last_name: 'User', email: 'fixture@example.test', role_codes: 'DOCTOR,NURSE' }]];
  } };
  const rows = await listConnectedSessions(io, now, database);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    userId: 7, name: 'Fixture User', email: 'fixture@example.test', roles: ['DOCTOR', 'NURSE'],
    loggedInAt: '2026-11-14T07:57:00.000Z', connectedSince: '2026-11-14T07:58:00.000Z', connections: 2,
  });
  disconnectSessionSockets(io, first.user);
  assert.equal(second.connected, false);
  assert.equal(other.connected, true);
  assert.equal((await listConnectedSessions(io, now, database)).length, 1);
});
