// server/src/utils/fcmNotifier.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { pool } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serviceAccountPath = path.join(__dirname, '../../serviceAccountKey.json');

let isFcmInitialized = false;
let firebaseApp = null;

if (fs.existsSync(serviceAccountPath)) {
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    firebaseApp = initializeApp({
      credential: cert(serviceAccount),
    });
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