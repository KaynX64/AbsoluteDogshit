import express from 'express';
import { pool } from '../../db.js';
import { resolveAdminPermissions } from '../../middleware/rbac.js';
import { getServerPolicy, makeServerPolicy, serverPolicyDefaults, serverPolicyFields, validatePolicyOverrides } from '../../config/serverPolicy.js';
import { readServerPolicy, saveServerPolicy } from '../../utils/serverPolicyStore.js';

const router = express.Router();

// Mounted below the admin authentication gate. Check the actual admin grant
// even if this account also holds a clinical role.
router.use(async (req, res, next) => {
  try {
    const { isSuper } = await resolveAdminPermissions(req.user.user_id);
    if (!isSuper) return res.status(403).json({ error: 'Server Policy requires Super Admin access.' });
    res.setHeader('Cache-Control', 'no-store');
    next();
  } catch {
    res.status(500).json({ error: 'Could not verify Super Admin access.' });
  }
});

function response({ version, values, overrides }) {
  return { version, values, overrides, defaults: serverPolicyDefaults, fields: serverPolicyFields };
}

function validateUpdate(req, res, next) {
  const { version, overrides } = req.body ?? {};
  const { values, errors } = validatePolicyOverrides(overrides);
  if (!Number.isInteger(version) || version < 0 || version >= 0xffffffff) errors.version = 'Supply the current policy version.';
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Correct the policy settings.', fields: errors });
  res.locals.policyUpdate = { version, overrides: values };
  next();
}

const stalePolicy = (res) => res.status(409).json({ error: 'The policy has changed. Reload it before saving.', code: 'POLICY_CHANGED' });

router.get('/', (req, res) => res.json(response(getServerPolicy())));

router.post('/preview', validateUpdate, async (req, res) => {
  const { version, overrides } = res.locals.policyUpdate;
  try {
    const current = await readServerPolicy(pool);
    if (current.version !== version) return stalePolicy(res);
    const { clinic, limits } = makeServerPolicy(version, overrides);
    const { openTime, closeTime, lunchStart, lunchEnd, slotMinutes } = clinic;
    const grace = limits.noShow.graceMinutes;
    const previousGrace = current.limits.noShow.graceMinutes;
    const [[impact]] = await pool.query(
      `SELECT
         COUNT(CASE WHEN date_time >= NOW() AND status IN ('scheduled', 'checked_in', 'serving') AND (
           TIME(date_time) < ? OR TIME(date_time) >= ? OR (TIME(date_time) >= ? AND TIME(date_time) < ?) OR
           MOD(TIME_TO_SEC(TIME(date_time)) - TIME_TO_SEC(?), ?) <> 0
         ) THEN 1 END) AS outsideSchedule,
         COUNT(CASE WHEN status = 'scheduled' AND date_time < DATE_SUB(NOW(), INTERVAL ? MINUTE)
           AND date_time >= DATE_SUB(NOW(), INTERVAL ? MINUTE) THEN 1 END) AS earlierNoShows
       FROM APPOINTMENTS WHERE deleted_at IS NULL AND date_time > DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
      [openTime, closeTime, lunchStart, lunchEnd, openTime, slotMinutes * 60, grace, previousGrace],
    );
    res.json(impact);
  } catch {
    res.status(500).json({ error: 'Could not preview the policy changes.' });
  }
});

router.put('/', validateUpdate, async (req, res) => {
  const { version, overrides } = res.locals.policyUpdate;
  try {
    const policy = await saveServerPolicy(version, overrides, req.user.user_id, req.ip);
    if (!policy) return stalePolicy(res);
    res.json(response(policy));
  } catch {
    res.status(500).json({ error: 'Could not save the server policy.' });
  }
});

export default router;
