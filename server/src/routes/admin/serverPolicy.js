// Lets Super Admins read, preview, and save versioned runtime policy.

import express from 'express';
import { pool } from '../../db/pool.js';
import { resolveAdminPermissions } from '../../middleware/rbac.js';
import { getServerPolicy, makeServerPolicy, serverPolicyDefaults, serverPolicyFields, validatePolicyOverrides } from '../../config/serverPolicy.js';
import { readServerPolicy, saveServerPolicy } from '../../utils/serverPolicyStore.js';
import { appointmentEmailTypes } from '../../appointments/emailTemplates.js';
import { isAppointmentSmtpConfigured, sendAppointmentEmail } from '../../utils/mailer.js';

const router = express.Router();

// Mounted below the admin authentication gate. Check the actual admin grant
// even if this account also holds a clinical role.
// Resolve live administrator grants and require Super Admin access.
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

// Shape a policy snapshot for the editor with current values, defaults, and field definitions.
function response({ version, values, overrides }) {
  return { version, values, overrides, defaults: serverPolicyDefaults, fields: serverPolicyFields };
}

// Validate the base revision and submitted override values.
function validateUpdate(req, res, next) {
  const { version, overrides } = req.body ?? {};
  const { values, errors } = validatePolicyOverrides(overrides);
  if (!Number.isInteger(version) || version < 0 || version >= 0xffffffff) errors.version = 'Supply the current policy version.';
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Correct the policy settings.', fields: errors });
  res.locals.policyUpdate = { version, overrides: values };
  next();
}

// Return a conflict when the policy revision has changed.
const stalePolicy = (res) => res.status(409).json({ error: 'The policy has changed. Reload it before saving.', code: 'POLICY_CHANGED' });

// Return the active server policy to the editor.
router.get('/', (req, res) => res.json(response(getServerPolicy())));

// Use literal mailbox addresses, rather than Nodemailer's address-list syntax.
const isMailbox = address => typeof address === 'string' && address.length <= 254 &&
  /^[A-Z0-9_+%-]+(?:\.[A-Z0-9_+%-]+)*@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i.test(address);
const uniqueMailboxes = addresses => [...new Set(addresses.map(address => address.trim().toLowerCase()))];

router.get('/email-test', (req, res) => {
  const configured = (process.env.SMTP_TEST_RECIPIENTS ?? '').split(',').map(address => address.trim());
  res.json({ smtpConfigured: isAppointmentSmtpConfigured(), recipients: uniqueMailboxes(configured.filter(isMailbox)) });
});

router.post('/email-test', async (req, res) => {
  const { template, recipients } = req.body ?? {};
  if (!appointmentEmailTypes.includes(template)) return res.status(400).json({ error: 'Choose an appointment email template.' });
  if (!Array.isArray(recipients) || recipients.length < 1 ||
      !recipients.every(address => typeof address === 'string' && isMailbox(address.trim()))) {
    return res.status(400).json({ error: 'Enter valid email addresses for the test.' });
  }
  const addresses = uniqueMailboxes(recipients);
  if (addresses.length > 5) return res.status(400).json({ error: 'Select up to five different recipients.' });
  if (!isAppointmentSmtpConfigured()) return res.status(503).json({ error: 'SMTP is unavailable. Check the server email configuration.' });

  const results = await Promise.all(addresses.map(async address => ({
    address,
    accepted: await sendAppointmentEmail({
      toEmail: address, type: template, patientName: 'Sample Patient', dateTime: '2027-06-15 09:30:00', test: true,
    }),
  })));
  res.json({ results });
});

// Validate and preview proposed overrides against the current revision.
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

// Save an audited policy revision when the submitted version still matches.
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
