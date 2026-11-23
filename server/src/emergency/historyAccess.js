import { pool } from '../db/pool.js';
import { resolveAdminPermissions } from '../middleware/rbac.js';

// Run after live responder and clinical-tier guards. Never trust JWT role claims
// to decide whether an account's Limited Admin archive restrictions apply.
export async function canReadFiledReports(userId) {
  const [roles] = await pool.query(`SELECT r.code FROM USER_ROLES ur
    JOIN ROLES r ON r.role_id = ur.role_id WHERE ur.user_id = ?`, [userId]);
  if (!roles.some(row => row.code === 'ADMIN')) return true;
  const { isSuper, codes } = await resolveAdminPermissions(userId);
  return isSuper || codes.includes('INCIDENT_RECORDS_VIEW');
}

export async function requireFiledReportAccess(req, res, next) {
  try {
    if (!await canReadFiledReports(req.user.user_id)) {
      return res.status(403).json({ error: 'Incident archive permission is required.', code: 'ADMIN_PERMISSION_DENIED' });
    }
    next();
  } catch { res.status(500).json({ error: 'Incident archive access lookup failed.' }); }
}

// This identifies supported desktop report requests, not a device-attestation
// boundary. Live staff authorization is required independently on every write.
export function requireDesktopReportClient(req, res, next) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.get('X-Client-Instance-Id') || '')) {
    return res.status(403).json({ error: 'Complete incident reports in the desktop app.', code: 'DESKTOP_REPORT_REQUIRED' });
  }
  next();
}
