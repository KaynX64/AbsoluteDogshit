// server/src/routes/analytics.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';

const router = express.Router();

// Accessible by DOCTOR, DENTIST, and ADMIN
router.use(authenticateToken, requireRoles('DOCTOR', 'DENTIST', 'ADMIN'));

// 1. GET /api/analytics/summary - High-level metrics
router.get('/summary', async (req, res) => {
  try {
    // Total Consultations
    const [consultations] = await pool.query('SELECT COUNT(*) as total FROM APPOINTMENTS');
    
    // Total Active SOS Emergencies
    const [emergencies] = await pool.query(
      `SELECT COUNT(*) as active, 
              COALESCE(AVG(response_time_seconds), 0) as avgResponseSeconds 
       FROM EMERGENCY_ALERTS`
    );

    // Low stock medicine count (< 20 pcs)
    const [lowStock] = await pool.query(
      'SELECT COUNT(*) as lowStockCount FROM MEDICINE_BATCHES WHERE quantity_on_hand < 20'
    );

    // Top 5 Illness Diagnoses
    const [topIllnesses] = await pool.query(
      `SELECT diagnosis, COUNT(*) as count 
       FROM EMR_RECORDS 
       GROUP BY diagnosis 
       ORDER BY count DESC 
       LIMIT 5`
    );

    res.json({
      totalConsultations: consultations[0].total,
      emergencyMetrics: emergencies[0],
      lowStockBatches: lowStock[0].lowStockCount,
      topIllnesses,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to compute health analytics summary.' });
  }
});

// 2. GET /api/analytics/by-department - Consultation volume per academic department/course
router.get('/by-department', async (req, res) => {
  try {
    const [breakdown] = await pool.query(
      `SELECT COALESCE(sp.course, fp.department, 'Other / Walk-in') as department, 
              COUNT(a.appointment_id) as consultation_count
       FROM APPOINTMENTS a
       LEFT JOIN STUDENT_PROFILES sp ON a.patient_user_id = sp.user_id
       LEFT JOIN FACULTY_PROFILES fp ON a.patient_user_id = fp.user_id
       WHERE a.status = 'completed'
       GROUP BY department
       ORDER BY consultation_count DESC`
    );
    res.json(breakdown);
  } catch (error) {
    res.status(500).json({ error: 'Failed to aggregate departmental consultation data.' });
  }
});

export default router;