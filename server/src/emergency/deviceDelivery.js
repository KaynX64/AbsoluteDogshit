// Maintains one FCM registration per upgraded installation.
import { inTransaction } from '../db/transaction.js';
import { pool } from '../db/pool.js';

export const isInstallationId = value => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
export const sosModes = ['on_duty', 'quiet', 'off_duty'];

export async function registerPushDevice(userId, { fcm_token: token, device_type: type, installation_id: id, sos_mode: mode }) {
  if (!id) {
    await pool.query(
      `INSERT INTO DEVICE_TOKENS (user_id, fcm_token, device_type) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         installation_id = IF(user_id = VALUES(user_id), installation_id, NULL),
         sos_mode = IF(user_id = VALUES(user_id), sos_mode, 'on_duty'),
         user_id = VALUES(user_id), device_type = VALUES(device_type)`,
      [userId, token, type],
    );
    return;
  }

  await inTransaction(async connection => {
    // The incoming token can already have a legacy registration on upgrade.
    await connection.query(
      'DELETE FROM DEVICE_TOKENS WHERE fcm_token = ? AND NOT (installation_id <=> ?)',
      [token, id],
    );
    await connection.query(
      `INSERT INTO DEVICE_TOKENS (user_id, fcm_token, device_type, installation_id, sos_mode)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         fcm_token = VALUES(fcm_token), user_id = VALUES(user_id),
         device_type = VALUES(device_type), sos_mode = VALUES(sos_mode)`,
      [userId, token, type, id, mode],
    );
  });
}

export async function removePushDevice(connection, userId, { fcm_token: rawToken, installation_id: id }) {
  const token = typeof rawToken === 'string' ? rawToken.trim() : '';
  if (isInstallationId(id)) {
    await connection.query('DELETE FROM DEVICE_TOKENS WHERE user_id = ? AND (installation_id = ? OR (installation_id IS NULL AND fcm_token = CAST(? AS BINARY)))', [userId, id, token]);
  } else if (token) {
    await connection.query('DELETE FROM DEVICE_TOKENS WHERE user_id = ? AND fcm_token = CAST(? AS BINARY)', [userId, token]);
  }
}

export function groupSosDevices(rows) {
  const groups = { legacy: [], on_duty: [], quiet: [] };
  for (const row of rows) {
    if (!row.installation_id || row.device_type !== 'android') groups.legacy.push(row.fcm_token);
    else if (row.sos_mode === 'on_duty' || row.sos_mode === 'quiet') groups[row.sos_mode].push(row.fcm_token);
  }
  return groups;
}

export function sosPushForMode(mode, { alertId, latitude, longitude }) {
  const channelId = mode === 'legacy' ? 'emergency_sos_channel_v4'
    : mode === 'quiet' ? 'responder_sos_quiet_v1' : 'responder_sos_audible_v1';
  const data = { type: 'EMERGENCY_SOS', alertId };
  if (mode === 'legacy') Object.assign(data, { latitude, longitude });
  return {
    title: 'Campus emergency SOS',
    body: 'Open LeoVital to view the incident.',
    data,
    androidNotification: { channelId, tag: `responder-sos-${alertId}`, visibility: 'private' },
  };
}
