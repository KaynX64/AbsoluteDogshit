// server/src/utils/fcmNotifier.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { pool } from '../db/pool.js';
import { createFcmAppOptions } from './fcmCredential.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');

let isFcmInitialized = false;
let firebaseApp = null;

if (fs.existsSync(serviceAccountPath)) {
  try {
    const accountJson = fs.readFileSync(serviceAccountPath, 'utf8');
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(accountJson);
    } catch {
      throw new Error('Firebase service-account file contains invalid JSON.');
    }
    firebaseApp = initializeApp(createFcmAppOptions(serviceAccount));
    isFcmInitialized = true;
    console.log('🔥 [FCM Push] Firebase Admin SDK initialized successfully.');
  } catch (err) {
    console.warn('⚠️ [FCM Push] Failed to initialize Firebase Admin SDK:', err.message);
  }
} else {
  console.warn('⚠️ [FCM Push] server/serviceAccountKey.json not found. Push notifications will run in simulation mode.');
}

/**
 * Send push notification to all devices registered to a specific user
 */
export async function sendPushToUser(userId, { title, body, data = {} }) {
  try {
    const [rows] = await pool.query(
      'SELECT fcm_token FROM DEVICE_TOKENS WHERE user_id = ?',
      [userId]
    );

    if (rows.length === 0) return;
    const tokens = rows.map((r) => r.fcm_token);
    await sendMulticastNotification(tokens, { title, body, data });
  } catch (err) {
    console.error('[FCM] Error sending push to user:', err.message);
  }
}

/**
 * Send push notification to all users matching specific roles (e.g., EMERGENCY_RESPONDER)
 */
export async function sendPushToRoles(roleCodes = [], { title, body, data = {} }) {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT dt.fcm_token
       FROM DEVICE_TOKENS dt
       JOIN USER_ROLES ur ON dt.user_id = ur.user_id
       JOIN ROLES r ON ur.role_id = r.role_id
       WHERE r.code IN (?)`,
      [roleCodes]
    );

    if (rows.length === 0) return;
    const tokens = rows.map((r) => r.fcm_token);
    await sendMulticastNotification(tokens, { title, body, data });
  } catch (err) {
    console.error('[FCM] Error sending push to roles:', err.message);
  }
}

/**
 * Send push notification to a list of concrete user ids — the delivery path
 * for the qualified-responder SOS audience (flag OR legacy role, resolved
 * live at dispatch time). Tokens are chunked in batches of 500: that is the
 * FCM sendEachForMulticast ceiling, and unchunked lists would silently drop
 * every token past the 500th.
 */
export async function sendPushToUsers(userIds = [], { title, body, data = {} }) {
  try {
    if (!Array.isArray(userIds) || userIds.length === 0) return;
    const [rows] = await pool.query(
      'SELECT fcm_token FROM DEVICE_TOKENS WHERE user_id IN (?)',
      [userIds]
    );

    if (rows.length === 0) return;
    const tokens = rows.map((r) => r.fcm_token);

    const FCM_MULTICAST_LIMIT = 500;
    for (let i = 0; i < tokens.length; i += FCM_MULTICAST_LIMIT) {
      await sendMulticastNotification(tokens.slice(i, i + FCM_MULTICAST_LIMIT), { title, body, data });
    }
  } catch (err) {
    console.error('[FCM] Error sending push to users:', err.message);
  }
}

async function sendMulticastNotification(tokens, { title, body, data }) {
  if (!isFcmInitialized || !firebaseApp) {
    console.log(`📡 [FCM Simulation] To ${tokens.length} devices | Title: "${title}" | Body: "${body}"`);
    return;
  }

  const message = {
    notification: { title, body },
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    tokens,
    android: {
      priority: 'high',
      notification: {
        sound: 'default',
        channelId: 'emergency_sos_channel_v4',
      },
    },
  };

  try {
    const messaging = getMessaging(firebaseApp);
    const response = await messaging.sendEachForMulticast(message);
    
    // Clean up invalid or uninstalled tokens automatically
    if (response.failureCount > 0) {
      response.responses.forEach(async (resp, idx) => {
        if (!resp.success) {
          const badToken = tokens[idx];
          await pool.query('DELETE FROM DEVICE_TOKENS WHERE fcm_token = ?', [badToken]).catch(() => {});
        }
      });
    }
  } catch (err) {
    console.error('[FCM Multicast Error]:', err.message);
  }
}
