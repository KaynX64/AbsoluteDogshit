import express from 'express';
import pool from '../db.js';
import { authenticateToken, requireRoles } from '../middleware/auth.js';

const router = express.Router();

// GET /api/analytics/summary
// Pinapayagan ang Doctor, Admin, at University Admin
router.get(
  '/summary',
  authenticateToken,
  requireRoles(['Doctor', 'Admin', 'University Admin', 'System Admin']),
  async (req, res) => {
    try {
      // 1. Top 5 Diagnoses / Common Illnesses
      const [topDiagnoses] = await pool.query(`
        SELECT diagnosis, COUNT(*) as count 
        FROM CONSULTATIONS 
        WHERE diagnosis IS NOT NULL AND diagnosis != ''
        GROUP BY diagnosis 
        ORDER BY count DESC 
        LIMIT 5
      `);

      // 2. Consultation Volume per Department / College
      const [deptBreakdown] = await pool.query(`
        SELECT COALESCE(u.department, 'Undeclared') as department, COUNT(c.consultation_id) as consultations_count
        FROM CONSULTATIONS c
        JOIN USERS u ON c.patient_id = u.user_id
        GROUP BY u.department
        ORDER BY consultations_count DESC
      `);

      // 3. Seasonal Flu / URTI Outbreak Spike Monitor (Last 14 days vs Previous 14 days)
      const [fluStats] = await pool.query(`
        SELECT 
          COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as cases_past_7_days,
          COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 END) as cases_prev_7_days
        FROM CONSULTATIONS
        WHERE LOWER(diagnosis) LIKE '%flu%' 
           OR LOWER(diagnosis) LIKE '%influenza%'
           OR LOWER(diagnosis) LIKE '%urti%'
           OR LOWER(diagnosis) LIKE '%fever%'
           OR LOWER(diagnosis) LIKE '%cough%'
      `);

      // 4. High-Risk Student Groups (Pre-existing Chronic Conditions / Allergies)
      const [highRiskGroups] = await pool.query(`
        SELECT 
          SUM(CASE WHEN LOWER(medical_history) LIKE '%hypertension%' OR LOWER(medical_history) LIKE '%bp%' THEN 1 ELSE 0 END) as hypertension_count,
          SUM(CASE WHEN LOWER(medical_history) LIKE '%asthma%' THEN 1 ELSE 0 END) as asthma_count,
          SUM(CASE WHEN LOWER(medical_history) LIKE '%diabetes%' THEN 1 ELSE 0 END) as diabetes_count,
          SUM(CASE WHEN allergies IS NOT NULL AND allergies != 'None' AND allergies != '' THEN 1 ELSE 0 END) as severe_allergies_count,
          COUNT(*) as total_students_monitored
        FROM STUDENTS
      `);

      // 5. Critical Inventory Watchlist (FEFO / Low Stocks)
      const [lowStockMeds] = await pool.query(`
        SELECT 
          batch_id, 
          name, 
          generic_name, 
          batch_no, 
          quantity_on_hand, 
          reorder_level,
          expiry_date,
          DATEDIFF(expiry_date, CURDATE()) as days_until_expiry
        FROM MEDICINE_BATCHES 
        WHERE quantity_on_hand <= reorder_level 
           OR expiry_date <= DATE_ADD(CURDATE(), INTERVAL 60 DAY)
        ORDER BY expiry_date ASC
        LIMIT 10
      `);

      res.json({
        topDiagnoses: topDiagnoses || [],
        deptBreakdown: deptBreakdown || [],
        fluStats: fluStats[0] || { cases_past_7_days: 0, cases_prev_7_days: 0 },
        highRiskGroups: highRiskGroups[0] || { hypertension_count: 0, asthma_count: 0, diabetes_count: 0, severe_allergies_count: 0, total_students_monitored: 0 },
        lowStockMeds: lowStockMeds || []
      });
    } catch (err) {
      console.error('Feature 10 Analytics Summary Error:', err);
      res.status(500).json({ error: 'Failed to aggregate health analytics.' });
    }
  }
);

// GET /api/analytics/export/csv
router.get(
  '/export/csv',
  authenticateToken,
  requireRoles(['Doctor', 'Admin', 'University Admin', 'System Admin']),
  async (req, res) => {
    try {
      const [consultations] = await pool.query(`
        SELECT 
          c.consultation_id,
          c.created_at as visit_date,
          u.full_name as patient_name,
          COALESCE(u.department, 'N/A') as department,
          u.role as patient_type,
          c.diagnosis,
          c.treatment_plan
        FROM CONSULTATIONS c
        JOIN USERS u ON c.patient_id = u.user_id
        ORDER BY c.created_at DESC
      `);

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="Campus_Health_Analytics_Report_${Date.now()}.csv"`);

      let csv = 'Consultation ID,Visit Date,Patient Name,Department,Role,Diagnosis,Treatment Plan\n';
      consultations.forEach((row) => {
        csv += `"${row.consultation_id}","${new Date(row.visit_date).toLocaleDateString()}","${row.patient_name || ''}","${row.department || ''}","${row.patient_type || ''}","${(row.diagnosis || '').replace(/"/g, '""')}","${(row.treatment_plan || '').replace(/"/g, '""')}"\n`;
      });

      res.send(csv);
    } catch (err) {
      console.error('Feature 10 Export Error:', err);
      res.status(500).send('Failed to export data');
    }
  }
);

export default router;