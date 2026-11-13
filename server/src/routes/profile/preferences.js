import { pool } from '../../db/pool.js';
import { authenticateToken } from '../../auth/middleware.js';
import { THEME_MODES, THEME_PRESETS } from '../../config/themePreferences.js';

export function registerProfilePreferences(router) {
  // ─────────────────────────────────────────────────────────────────────────
  // PUT /api/profile/theme — persist the account's UI theme selection.
  //
  // Per-account persistence for the desktop settings menu (Stage 7).
  // The desktop client applies changes locally first (offline-first) and
  // pushes the selection here; the stored values are returned with the
  // login response so the theme follows the account to any machine.
  //
  // Validation: both fields are REQUIRED and must match the server-side
  // whitelist (mirrored from desktop/src/theme/presets.ts). The write is
  // skipped entirely when the stored values are identical (theme toggles
  // are frequent — no need to bump USERS.updated_at each time).
  // ─────────────────────────────────────────────────────────────────────────
  router.put('/theme', authenticateToken, async (req, res) => {
    const userId = req.user.user_id;
    const { theme_mode, theme_preset } = req.body ?? {};

    // Field-level validation with explicit messages the client can surface.
    const issues = [];
    if (typeof theme_mode !== 'string') {
      issues.push('theme_mode is required and must be a string.');
    } else if (!THEME_MODES.has(theme_mode.trim().toLowerCase())) {
      issues.push(`theme_mode must be one of: ${[...THEME_MODES].join(', ')}.`);
    }
    if (typeof theme_preset !== 'string') {
      issues.push('theme_preset is required and must be a string.');
    } else if (!THEME_PRESETS.has(theme_preset.trim().toLowerCase())) {
      issues.push(`theme_preset must be one of: ${[...THEME_PRESETS].join(', ')}.`);
    }
    if (issues.length > 0) {
      return res.status(400).json({ error: 'Invalid theme selection.', issues });
    }

    const mode = theme_mode.trim().toLowerCase();
    const preset = theme_preset.trim().toLowerCase();

    try {
      const [result] = await pool.query(
        'UPDATE USERS SET theme_mode = ?, theme_preset = ? WHERE user_id = ?',
        [mode, preset, userId]
      );

      // identical rows report affectedRows = 0 in MySQL's default config —
      // that is still a success for an idempotent preference write.
      res.json({
        message: 'Theme preference saved.',
        theme_mode: mode,
        theme_preset: preset,
        changed: result.affectedRows > 0,
      });
    } catch (error) {
      console.error('[Theme Preference Error]:', error);
      res.status(500).json({ error: 'Failed to save theme preference.' });
    }
  });

  // POST /api/profile/fcm-token - Register device token for background push
  router.post('/fcm-token', authenticateToken, async (req, res) => {
    const userId = req.user.user_id;
    const { fcm_token, device_type = 'android' } = req.body;

    if (!fcm_token) return res.status(400).json({ error: 'fcm_token is required.' });

    try {
      await pool.query(
        `INSERT INTO DEVICE_TOKENS (user_id, fcm_token, device_type)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), device_type = VALUES(device_type)`,
        [userId, fcm_token.trim(), device_type]
      );
      console.log(`📱 [FCM] Successfully registered device token for user #${userId} (${device_type})`);
      res.json({ message: 'Device token registered for push notifications.' });
    } catch (err) {
      console.error('[FCM Token Registration Error]:', err);
      res.status(500).json({ error: 'Failed to save device token.' });
    }
  });
}
