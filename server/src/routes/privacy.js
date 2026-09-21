// server/src/routes/privacy.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { logAudit } from '../utils/auditLogger.js';

const router = express.Router();

// =============================================================================
// 1. CONSENT MANAGEMENT (R.A. 10173 Section 12 & 13)
// =============================================================================

// POST /api/privacy/consent - Record user consent under R.A. 10173
router.post('/consent', authenticateToken, async (req, res) => {
  const userId = req.user.user_id;
  const { consent_type } = req.body;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      `INSERT INTO CONSENT_RECORDS (user_id, consent_type, is_granted, ip_address, terms_version)
       VALUES (?, ?, TRUE, ?, '2026.1')`,
      [userId, consent_type || 'PHI_PROCESSING_RA_10173', req.ip]
    );

    await logAudit(connection, {
      userId,
      action: 'CREATE',
      table: 'CONSENT_RECORDS',
      recordId: userId,
      oldValue: null,
      newValue: { consent_type: consent_type || 'PHI_PROCESSING_RA_10173', is_granted: true },
      ipAddress: req.ip,
    });

    await connection.commit();
    res.json({ message: 'Privacy consent successfully recorded under R.A. 10173.' });
  } catch (error) {
    await connection.rollback();
    console.error('[Privacy] Consent error:', error);
    res.status(500).json({ error: 'Failed to record consent.' });
  } finally {
    connection.release();
  }
});

// POST /api/privacy/revoke - Revoke consent under R.A. 10173
router.post('/revoke', authenticateToken, async (req, res) => {
  const userId = req.user.user_id;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      `UPDATE CONSENT_RECORDS 
       SET is_granted = FALSE, revoked_at = CURRENT_TIMESTAMP 
       WHERE user_id = ? AND is_granted = TRUE`,
      [userId]
    );

    await logAudit(connection, {
      userId,
      action: 'UPDATE',
      table: 'CONSENT_RECORDS',
      recordId: userId,
      oldValue: { is_granted: true },
      newValue: { is_granted: false, revoked_at: new Date().toISOString() },
      ipAddress: req.ip,
    });

    await connection.commit();
    res.json({ message: 'Consent successfully revoked. Medical data processing suspended.' });
  } catch (error) {
    await connection.rollback();
    console.error('[Privacy] Revoke error:', error);
    res.status(500).json({ error: 'Failed to revoke consent.' });
  } finally {
    connection.release();
  }
});

// GET /api/privacy/status - Check if user has active consent
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT consent_id, consent_type, is_granted, consented_at, revoked_at, terms_version
       FROM CONSENT_RECORDS 
       WHERE user_id = ? 
       ORDER BY consent_id DESC LIMIT 1`,
      [req.user.user_id]
    );

    res.json({
      hasConsented: rows.length > 0 && rows[0].is_granted === 1,
      details: rows[0] || null,
    });
  } catch (error) {
    console.error('[Privacy] Status check error:', error);
    res.status(500).json({ error: 'Failed to retrieve consent status.' });
  }
});

// =============================================================================
// 2. DATA RETENTION & LIFECYCLE (R.A. 10173 Section 11 - Proportionality)
// Standard: Clinical records retained 5 years from encounter date
// =============================================================================

// GET /api/privacy/retention/status - Retention status report (Admin only)
router.get('/retention/status', authenticateToken, requireRoles('ADMIN'), async (req, res) => {
  try {
    // 5-year retention cutoff for EMR records
    const [expiredEmrs] = await pool.query(
      `SELECT COUNT(*) as eligible_for_purge
       FROM EMR_RECORDS 
       WHERE encounter_date < DATE_SUB(NOW(), INTERVAL 5 YEAR) 
         AND deleted_at IS NULL`
    );

    // 5-year retention cutoff for Appointments
    const [expiredAppointments] = await pool.query(
      `SELECT COUNT(*) as eligible_for_purge
       FROM APPOINTMENTS 
       WHERE date_time < DATE_SUB(NOW(), INTERVAL 5 YEAR) 
         AND deleted_at IS NULL`
    );

    // 5-year retention cutoff for Prescriptions
    const [expiredPrescriptions] = await pool.query(
      `SELECT COUNT(*) as eligible_for_purge
       FROM PRESCRIPTIONS 
       WHERE issued_at < DATE_SUB(NOW(), INTERVAL 5 YEAR) 
         AND deleted_at IS NULL`
    );

    const [activeEmrs] = await pool.query(
      `SELECT COUNT(*) as active_records FROM EMR_RECORDS WHERE deleted_at IS NULL`
    );

    const [consentedUsers] = await pool.query(
      `SELECT COUNT(DISTINCT user_id) as total_consented FROM CONSENT_RECORDS WHERE is_granted = TRUE`
    );

    const totalPurgeEligible =
      (expiredEmrs[0]?.eligible_for_purge || 0) +
      (expiredAppointments[0]?.eligible_for_purge || 0) +
      (expiredPrescriptions[0]?.eligible_for_purge || 0);

    res.json({
      retentionPolicyYears: 5,
      activeMedicalRecords: activeEmrs[0]?.active_records || 0,
      recordsPastRetentionPeriod: totalPurgeEligible,
      breakdown: {
        emrRecords: expiredEmrs[0]?.eligible_for_purge || 0,
        appointments: expiredAppointments[0]?.eligible_for_purge || 0,
        prescriptions: expiredPrescriptions[0]?.eligible_for_purge || 0,
      },
      totalActiveConsents: consentedUsers[0]?.total_consented || 0,
      standard: 'R.A. 10173 & Philippine DOH 5-Year Clinical Document Rule',
    });
  } catch (error) {
    console.error('[Privacy] Retention status error:', error);
    res.status(500).json({ error: 'Failed to compute retention status.' });
  }
});

// POST /api/privacy/retention/sweep - Execute comprehensive retention purge (Admin only)
router.post('/retention/sweep', authenticateToken, requireRoles('ADMIN'), async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Soft-delete EMR encounters older than 5 years
    const [emrResult] = await connection.query(
      `UPDATE EMR_RECORDS 
       SET deleted_at = CURRENT_TIMESTAMP 
       WHERE encounter_date < DATE_SUB(NOW(), INTERVAL 5 YEAR) 
         AND deleted_at IS NULL`
    );

    // 2. Soft-delete appointments older than 5 years
    const [appResult] = await connection.query(
      `UPDATE APPOINTMENTS 
       SET deleted_at = CURRENT_TIMESTAMP 
       WHERE date_time < DATE_SUB(NOW(), INTERVAL 5 YEAR) 
         AND deleted_at IS NULL`
    );

    // 3. Mark prescriptions older than 5 years as expired and soft-deleted
    const [rxResult] = await connection.query(
      `UPDATE PRESCRIPTIONS 
       SET status = 'expired', deleted_at = CURRENT_TIMESTAMP 
       WHERE issued_at < DATE_SUB(NOW(), INTERVAL 5 YEAR) 
         AND deleted_at IS NULL`
    );

    const totalPurged =
      (emrResult.affectedRows || 0) +
      (appResult.affectedRows || 0) +
      (rxResult.affectedRows || 0);

    await logAudit(connection, {
      userId: req.user.user_id,
      action: 'DELETE',
      table: 'EMR_RECORDS',
      recordId: 0,
      oldValue: null,
      newValue: {
        operation: 'STATUTORY_DATA_RETENTION_SWEEP_RA_10173',
        purgedEmrs: emrResult.affectedRows,
        purgedAppointments: appResult.affectedRows,
        purgedPrescriptions: rxResult.affectedRows,
        totalPurged,
      },
      ipAddress: req.ip,
    });

    await connection.commit();

    res.json({
      message: `Data retention sweep complete. ${totalPurged} expired records archived/soft-deleted across clinical tables.`,
      purgedCount: totalPurged,
      breakdown: {
        emrs: emrResult.affectedRows,
        appointments: appResult.affectedRows,
        prescriptions: rxResult.affectedRows,
      },
    });
  } catch (error) {
    await connection.rollback();
    console.error('[Privacy] Retention sweep error:', error);
    res.status(500).json({ error: 'Failed to execute retention sweep.' });
  } finally {
    connection.release();
  }
});

export default router;