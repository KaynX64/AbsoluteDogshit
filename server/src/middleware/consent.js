// server/src/middleware/consent.js
import { pool } from '../db.js';

/**
 * R.A. 10173 Mandatory Statutory Consent Gatekeeper
 * Prevents unauthorized processing of Protected Health Information (PHI)
 */
export async function requirePrivacyConsent(req, res, next) {
  const userRoles = req.user?.roles || [];

  // 1. Clinical staff and emergency responders bypass patient consent checks for clinical duties
  const clinicalStaffRoles = ['DOCTOR', 'DENTIST', 'NURSE', 'ADMIN', 'EMERGENCY_RESPONDER'];
  if (userRoles.some((role) => clinicalStaffRoles.includes(role))) {
    return next();
  }

  // 2. Patients (Students/Faculty) must have an active, non-revoked consent record
  try {
    const [rows] = await pool.query(
      `SELECT is_granted FROM CONSENT_RECORDS 
       WHERE user_id = ? 
       ORDER BY consent_id DESC LIMIT 1`,
      [req.user.user_id]
    );

    // Using !Boolean handles both numeric 1/0 and boolean true/false from MySQL
    if (rows.length === 0 || !Boolean(rows[0].is_granted)) {
      return res.status(403).json({
        error: 'PRIVACY_CONSENT_REQUIRED',
        message: 'Access to Protected Health Information is suspended under R.A. 10173 until consent is granted.',
      });
    }

    next();
  } catch (err) {
    console.error('[Consent Middleware Error]:', err);
    res.status(500).json({ error: 'Failed to verify statutory privacy consent.' });
  }
}