import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';

const router = express.Router();

// =============================================================================
// 1. GET /api/analytics/summary
// =============================================================================
router.get('/summary', authenticateToken, requireRoles('ADMIN', 'DOCTOR', 'NURSE'), async (req, res) => {
  try {
    const [consultationStats] = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM APPOINTMENTS 
      GROUP BY status
    `);

    const [topDiagnoses] = await pool.query(`
      SELECT diagnosis, COUNT(*) as count 
      FROM EMR_RECORDS 
      WHERE diagnosis IS NOT NULL AND diagnosis != '' 
      GROUP BY diagnosis 
      ORDER BY count DESC 
      LIMIT 5
    `);

    const [emergencyStats] = await pool.query(`
      SELECT status, COUNT(*) as count 
      FROM EMERGENCY_ALERTS 
      GROUP BY status
    `);

    const [lowStockMeds] = await pool.query(`
      SELECT 
        b.batch_id,
        m.name,
        m.generic_name,
        b.batch_no,
        b.quantity_on_hand,
        m.reorder_level,
        DATE_FORMAT(b.expiry_date, '%Y-%m-%d') as expiry_date,
        DATEDIFF(b.expiry_date, CURDATE()) as days_until_expiry
      FROM MEDICINE_BATCHES b
      JOIN MEDICINES m ON b.medicine_id = m.medicine_id
      WHERE b.deleted_at IS NULL 
        AND (b.quantity_on_hand <= m.reorder_level OR DATEDIFF(b.expiry_date, CURDATE()) <= 90)
      ORDER BY b.quantity_on_hand ASC, b.expiry_date ASC
    `);

    const [encountersCount] = await pool.query(`SELECT COUNT(*) as total FROM EMR_RECORDS WHERE deleted_at IS NULL`);
    const [avgResponse] = await pool.query(`
      SELECT COALESCE(AVG(response_time_seconds), 0) as avg_resp 
      FROM EMERGENCY_ALERTS 
      WHERE response_time_seconds IS NOT NULL
    `);

    res.json({
      consultations: consultationStats,
      topDiagnoses,
      emergencies: emergencyStats,
      lowStockMeds,
      totalEncounters: encountersCount[0]?.total || 0,
      averageResponseTimeSeconds: Math.round(avgResponse[0]?.avg_resp || 0)
    });
  } catch (err) {
    console.error('[Analytics] Aggregation error:', err);
    res.status(500).json({ error: 'Failed to aggregate health analytics data.' });
  }
});

// =============================================================================
// 2. GET /api/analytics/export/csv
// =============================================================================
router.get('/export/csv', authenticateToken, requireRoles('ADMIN', 'DOCTOR'), async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        e.emr_id,
        u.first_name,
        u.last_name,
        sp.student_no,
        e.chief_complaint,
        e.diagnosis,
        e.treatment_plan,
        DATE_FORMAT(e.encounter_date, '%Y-%m-%d %H:%i') as encounter_date
      FROM EMR_RECORDS e
      JOIN USERS u ON e.patient_user_id = u.user_id
      LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
      WHERE e.deleted_at IS NULL
      ORDER BY e.encounter_date DESC
    `);

    let csvContent = 'EMR ID,Student No,Patient Name,Chief Complaint,Diagnosis,Treatment Plan,Encounter Date\n';
    rows.forEach(r => {
      const name = `"${(r.first_name || '')} ${(r.last_name || '')}"`;
      const studentNo = r.student_no || 'N/A';
      const complaint = `"${(r.chief_complaint || '').replace(/"/g, '""')}"`;
      const diag = `"${(r.diagnosis || '').replace(/"/g, '""')}"`;
      const plan = `"${(r.treatment_plan || '').replace(/"/g, '""')}"`;
      const date = r.encounter_date;
      csvContent += `${r.emr_id},${studentNo},${name},${complaint},${diag},${plan},${date}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=PSU_Infirmary_Health_Report_${Date.now()}.csv`);
    res.status(200).send(csvContent);
  } catch (err) {
    console.error('[Analytics] CSV Export error:', err);
    res.status(500).json({ error: 'CSV export generation failed.' });
  }
});

export default router;