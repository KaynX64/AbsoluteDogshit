// server/src/routes/analytics.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';

const router = express.Router();

// Accessible by DOCTOR, DENTIST, and ADMIN
router.use(authenticateToken, requireRoles('DOCTOR', 'DENTIST', 'ADMIN'));

// 1. GET /api/analytics/summary - Full aggregation (Strict SQL Mode Compliant)
router.get('/summary', async (req, res) => {
  try {
    // 1. Total Consultations
    const [consultations] = await pool.query('SELECT COUNT(*) as total FROM APPOINTMENTS');

    // 2. Total Active SOS Emergencies
    const [emergencies] = await pool.query(
      `SELECT COUNT(*) as active, 
              COALESCE(AVG(response_time_seconds), 0) as avgResponseSeconds 
       FROM EMERGENCY_ALERTS`
    );

    // 3. Top 5 Illness Diagnoses (Derived subquery fixes ONLY_FULL_GROUP_BY)
    const [topDiagnoses] = await pool.query(
      `SELECT diagnosis, COUNT(*) as count 
       FROM (
         SELECT COALESCE(diagnosis, 'General Evaluation') AS diagnosis
         FROM EMR_RECORDS 
         WHERE diagnosis IS NOT NULL AND diagnosis != ''
       ) AS diag_sub
       GROUP BY diagnosis 
       ORDER BY count DESC 
       LIMIT 5`
    );

    // 4. Consultation Volume per Department (Derived subquery fixes ONLY_FULL_GROUP_BY)
    const [deptBreakdown] = await pool.query(
      `SELECT department, COUNT(*) as consultations_count
       FROM (
         SELECT COALESCE(sp.course, fp.department, 'General Walk-in') AS department
         FROM APPOINTMENTS a
         LEFT JOIN STUDENT_PROFILES sp ON a.patient_user_id = sp.user_id
         LEFT JOIN FACULTY_PROFILES fp ON a.patient_user_id = fp.user_id
         WHERE a.status = 'completed'
       ) AS dept_sub
       GROUP BY department
       ORDER BY consultations_count DESC
       LIMIT 6`
    );

    // 5. 14-Day Consultation Timeline (Derived subquery fixes ONLY_FULL_GROUP_BY)
    const [dailyTimeline] = await pool.query(
      `SELECT date_key, label, COUNT(*) as count
       FROM (
         SELECT DATE_FORMAT(encounter_date, '%Y-%m-%d') as date_key,
                DATE_FORMAT(encounter_date, '%b %d') as label
         FROM EMR_RECORDS
         WHERE encounter_date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
       ) AS timeline_sub
       GROUP BY date_key, label
       ORDER BY date_key ASC`
    );

    // Fill missing days in the 14-day timeline with 0 so the line chart is smooth
    const timelineMap = new Map(dailyTimeline.map((item) => [item.date_key, item.count]));
    const timeSeries = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      timeSeries.push({
        date: dateKey,
        label,
        count: timelineMap.get(dateKey) || 0,
      });
    }

    // 6. Flu / Respiratory Surveillance (Past 7 days vs previous 7 days)
    const [fluQuery] = await pool.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN encounter_date >= DATE_SUB(NOW(), INTERVAL 7 DAY) 
                   AND (diagnosis LIKE '%flu%' OR diagnosis LIKE '%respiratory%' OR diagnosis LIKE '%fever%' OR diagnosis LIKE '%cough%') 
                  THEN 1 ELSE 0 END), 0) as cases_past_7_days,
         COALESCE(SUM(CASE WHEN encounter_date >= DATE_SUB(NOW(), INTERVAL 14 DAY) 
                   AND encounter_date < DATE_SUB(NOW(), INTERVAL 7 DAY) 
                   AND (diagnosis LIKE '%flu%' OR diagnosis LIKE '%respiratory%' OR diagnosis LIKE '%fever%' OR diagnosis LIKE '%cough%') 
                  THEN 1 ELSE 0 END), 0) as cases_prev_7_days
       FROM EMR_RECORDS`
    );

    // 7. High-Risk Student Groups Watchlist
    const [riskQuery] = await pool.query(
      `SELECT 
         COALESCE(SUM(CASE WHEN chronic_conditions LIKE '%hypertension%' OR chronic_conditions LIKE '%blood pressure%' THEN 1 ELSE 0 END), 0) as hypertension_count,
         COALESCE(SUM(CASE WHEN chronic_conditions LIKE '%asthma%' THEN 1 ELSE 0 END), 0) as asthma_count,
         COALESCE(SUM(CASE WHEN chronic_conditions LIKE '%diabetes%' THEN 1 ELSE 0 END), 0) as diabetes_count,
         COALESCE(SUM(CASE WHEN allergies IS NOT NULL AND allergies != '' AND allergies != 'None' AND allergies != 'None recorded' THEN 1 ELSE 0 END), 0) as severe_allergies_count,
         COUNT(*) as total_students_monitored
       FROM HEALTH_PROFILES`
    );

    // 8. Low Stock & Near Expiry Pharmacy Batches
    const [lowStockMeds] = await pool.query(
      `SELECT b.batch_id, m.name, m.generic_name, b.batch_no, b.quantity_on_hand, m.reorder_level,
              DATE_FORMAT(b.expiry_date, '%Y-%m-%d') as expiry_date,
              DATEDIFF(b.expiry_date, CURDATE()) as days_until_expiry
       FROM MEDICINE_BATCHES b
       JOIN MEDICINES m ON b.medicine_id = m.medicine_id
       WHERE b.quantity_on_hand < 25 OR DATEDIFF(b.expiry_date, CURDATE()) <= 90
       ORDER BY b.quantity_on_hand ASC
       LIMIT 6`
    );

    res.json({
      totalConsultations: consultations[0].total,
      emergencyMetrics: emergencies[0],
      timeSeries,
      topDiagnoses: topDiagnoses.length > 0 ? topDiagnoses : [{ diagnosis: 'General Health Check', count: 1 }],
      deptBreakdown: deptBreakdown.length > 0 ? deptBreakdown : [{ department: 'BS Information Technology', consultations_count: 1 }],
      fluStats: fluQuery[0] || { cases_past_7_days: 0, cases_prev_7_days: 0 },
      highRiskGroups: riskQuery[0] || { hypertension_count: 0, asthma_count: 0, diabetes_count: 0, severe_allergies_count: 0, total_students_monitored: 0 },
      lowStockMeds,
    });
  } catch (error) {
    console.error('[Analytics] Error computing summary:', error);
    res.status(500).json({ error: 'Failed to compute health analytics summary.' });
  }
});

// 2. GET /api/analytics/by-department - Consultation volume per academic department/course
router.get('/by-department', async (req, res) => {
  try {
    const [breakdown] = await pool.query(
      `SELECT department, COUNT(*) as consultation_count
       FROM (
         SELECT COALESCE(sp.course, fp.department, 'Other / Walk-in') as department
         FROM APPOINTMENTS a
         LEFT JOIN STUDENT_PROFILES sp ON a.patient_user_id = sp.user_id
         LEFT JOIN FACULTY_PROFILES fp ON a.patient_user_id = fp.user_id
         WHERE a.status = 'completed'
       ) as d_sub
       GROUP BY department
       ORDER BY consultation_count DESC`
    );
    res.json(breakdown);
  } catch (error) {
    res.status(500).json({ error: 'Failed to aggregate departmental consultation data.' });
  }
});

// 3. GET /api/analytics/export/csv - Excel-ready CSV Export
router.get('/export/csv', async (req, res) => {
  try {
    const [topDiagnoses] = await pool.query(
      `SELECT diagnosis, COUNT(*) as count 
       FROM EMR_RECORDS 
       WHERE diagnosis IS NOT NULL AND diagnosis != ''
       GROUP BY diagnosis 
       ORDER BY count DESC 
       LIMIT 10`
    );

    const [deptBreakdown] = await pool.query(
      `SELECT department, COUNT(*) as count
       FROM (
         SELECT COALESCE(sp.course, fp.department, 'General Walk-in') as department
         FROM APPOINTMENTS a
         LEFT JOIN STUDENT_PROFILES sp ON a.patient_user_id = sp.user_id
         LEFT JOIN FACULTY_PROFILES fp ON a.patient_user_id = fp.user_id
         WHERE a.status = 'completed'
       ) as d_sub
       GROUP BY department 
       ORDER BY count DESC`
    );

    const [inventory] = await pool.query(
      `SELECT m.name, b.batch_no, b.quantity_on_hand, b.expiry_date 
       FROM MEDICINE_BATCHES b 
       JOIN MEDICINES m ON b.medicine_id = m.medicine_id`
    );

    let csv = '\uFEFF'; // Byte Order Mark for Excel UTF-8 auto-detection

    csv += 'PANGASINAN STATE UNIVERSITY - INFIRMARY HEALTH ANALYTICS REPORT\n';
    csv += `Exported On,${new Date().toLocaleString()}\n\n`;

    csv += 'SECTION 1: TOP CLINICAL DIAGNOSES\n';
    csv += 'Diagnosis,Cases Recorded\n';
    topDiagnoses.forEach((d) => {
      csv += `"${d.diagnosis}",${d.count}\n`;
    });
    csv += '\n';

    csv += 'SECTION 2: CONSULTATION VOLUME BY DEPARTMENT / COURSE\n';
    csv += 'Department / Course,Completed Consultations\n';
    deptBreakdown.forEach((d) => {
      csv += `"${d.department}",${d.count}\n`;
    });
    csv += '\n';

    csv += 'SECTION 3: PHARMACY INVENTORY & EXPIRY STATUS\n';
    csv += 'Medicine Name,Batch Number,Stock on Hand,Expiry Date\n';
    inventory.forEach((i) => {
      csv += `"${i.name}","${i.batch_no}",${i.quantity_on_hand},"${new Date(i.expiry_date).toISOString().split('T')[0]}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="PSU_Health_Report_${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('[Analytics] CSV Export error:', error);
    res.status(500).json({ error: 'Failed to export CSV report.' });
  }
});

export default router;