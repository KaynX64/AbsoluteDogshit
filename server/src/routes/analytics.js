// server/src/routes/analytics.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { decrypt } from '../utils/cryptoVault.js';

const router = express.Router();

router.use(authenticateToken, requireRoles('DOCTOR', 'DENTIST', 'ADMIN'));

// 1. GET /api/analytics/summary
router.get('/summary', async (req, res) => {
  try {
    // 1. Total Consultations
    const [consultations] = await pool.query(
      'SELECT COUNT(*) as total FROM APPOINTMENTS WHERE deleted_at IS NULL'
    );

    // 2. Active Emergencies
    const [emergencies] = await pool.query(
      `SELECT COUNT(*) as active, 
              COALESCE(AVG(response_time_seconds), 0) as avgResponseSeconds 
       FROM EMERGENCY_ALERTS`
    );

    // 3. Top Diagnoses (In-Memory AES-256 Decrypted Aggregation)
    const [allEmrs] = await pool.query(
      `SELECT diagnosis FROM EMR_RECORDS WHERE diagnosis IS NOT NULL AND diagnosis != '' AND deleted_at IS NULL`
    );

    const diagCountMap = {};
    for (const row of allEmrs) {
      const plainDiag = decrypt(row.diagnosis) || 'General Health Check';
      diagCountMap[plainDiag] = (diagCountMap[plainDiag] || 0) + 1;
    }

    const topDiagnoses = Object.entries(diagCountMap)
      .map(([diagnosis, count]) => ({ diagnosis, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // 4. Consultation Volume per Department
    const [deptBreakdown] = await pool.query(
      `SELECT department, COUNT(*) as consultations_count
       FROM (
         SELECT COALESCE(sp.course, fp.department, 'General Walk-in') AS department
         FROM APPOINTMENTS a
         LEFT JOIN STUDENT_PROFILES sp ON a.patient_user_id = sp.user_id
         LEFT JOIN FACULTY_PROFILES fp ON a.patient_user_id = fp.user_id
         WHERE a.status = 'completed' AND a.deleted_at IS NULL
       ) AS dept_sub
       GROUP BY department
       ORDER BY consultations_count DESC
       LIMIT 6`
    );

    // 5. 14-Day Consultation Timeline
    const [dailyTimeline] = await pool.query(
      `SELECT date_key, label, COUNT(*) as count
       FROM (
         SELECT DATE_FORMAT(encounter_date, '%Y-%m-%d') as date_key,
                DATE_FORMAT(encounter_date, '%b %d') as label
         FROM EMR_RECORDS
         WHERE encounter_date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY) AND deleted_at IS NULL
       ) AS timeline_sub
       GROUP BY date_key, label
       ORDER BY date_key ASC`
    );

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

    // 6. Flu / Respiratory Surveillance (Decrypted in-memory calculation)
    const [fluEmrs] = await pool.query(
      `SELECT diagnosis, encounter_date FROM EMR_RECORDS 
       WHERE encounter_date >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND deleted_at IS NULL`
    );

    let cases_past_7_days = 0;
    let cases_prev_7_days = 0;
    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

    for (const emr of fluEmrs) {
      const diagPlain = (decrypt(emr.diagnosis) || '').toLowerCase();
      const isFluLike =
        diagPlain.includes('flu') ||
        diagPlain.includes('respiratory') ||
        diagPlain.includes('fever') ||
        diagPlain.includes('cough');

      if (isFluLike) {
        const encounterTime = new Date(emr.encounter_date).getTime();
        const diff = now - encounterTime;
        if (diff <= sevenDaysMs) {
          cases_past_7_days++;
        } else if (diff <= fourteenDaysMs) {
          cases_prev_7_days++;
        }
      }
    }

    // 7. High-Risk Student Groups (Decrypted in-memory calculation)
    const [riskProfiles] = await pool.query(
      `SELECT chronic_conditions, allergies FROM HEALTH_PROFILES WHERE deleted_at IS NULL`
    );

    let hypertension_count = 0;
    let asthma_count = 0;
    let diabetes_count = 0;
    let severe_allergies_count = 0;

    for (const hp of riskProfiles) {
      const cond = (decrypt(hp.chronic_conditions) || '').toLowerCase();
      const allergy = (decrypt(hp.allergies) || '').toLowerCase();

      if (cond.includes('hypertension') || cond.includes('blood pressure')) hypertension_count++;
      if (cond.includes('asthma')) asthma_count++;
      if (cond.includes('diabetes')) diabetes_count++;
      if (allergy && allergy !== 'none' && allergy !== 'none recorded' && allergy !== 'n/a') {
        severe_allergies_count++;
      }
    }

    // 8. Low Stock & Near Expiry Pharmacy Batches
    const [lowStockMeds] = await pool.query(
      `SELECT b.batch_id, m.name, m.generic_name, b.batch_no, b.quantity_on_hand, m.reorder_level,
              DATE_FORMAT(b.expiry_date, '%Y-%m-%d') as expiry_date,
              DATEDIFF(b.expiry_date, CURDATE()) as days_until_expiry
       FROM MEDICINE_BATCHES b
       JOIN MEDICINES m ON b.medicine_id = m.medicine_id
       WHERE b.deleted_at IS NULL AND (b.quantity_on_hand < 25 OR DATEDIFF(b.expiry_date, CURDATE()) <= 90)
       ORDER BY b.quantity_on_hand ASC
       LIMIT 6`
    );

    res.json({
      totalConsultations: consultations[0].total,
      emergencyMetrics: emergencies[0],
      timeSeries,
      topDiagnoses: topDiagnoses.length > 0 ? topDiagnoses : [{ diagnosis: 'General Health Check', count: 1 }],
      deptBreakdown: deptBreakdown.length > 0 ? deptBreakdown : [{ department: 'BS Information Technology', consultations_count: 1 }],
      fluStats: { cases_past_7_days, cases_prev_7_days },
      highRiskGroups: {
        hypertension_count,
        asthma_count,
        diabetes_count,
        severe_allergies_count,
        total_students_monitored: riskProfiles.length,
      },
      lowStockMeds,
    });
  } catch (error) {
    console.error('[Analytics] Error computing summary:', error);
    res.status(500).json({ error: 'Failed to compute health analytics summary.' });
  }
});

// 2. GET /api/analytics/by-department
router.get('/by-department', async (req, res) => {
  try {
    const [breakdown] = await pool.query(
      `SELECT department, COUNT(*) as consultation_count
       FROM (
         SELECT COALESCE(sp.course, fp.department, 'Other / Walk-in') as department
         FROM APPOINTMENTS a
         LEFT JOIN STUDENT_PROFILES sp ON a.patient_user_id = sp.user_id
         LEFT JOIN FACULTY_PROFILES fp ON a.patient_user_id = fp.user_id
         WHERE a.status = 'completed' AND a.deleted_at IS NULL
       ) as d_sub
       GROUP BY department
       ORDER BY consultation_count DESC`
    );
    res.json(breakdown);
  } catch (error) {
    res.status(500).json({ error: 'Failed to aggregate departmental consultation data.' });
  }
});

// 3. GET /api/analytics/export/csv (Decrypted for Human Readability)
router.get('/export/csv', async (req, res) => {
  try {
    const [allEmrs] = await pool.query(
      `SELECT diagnosis FROM EMR_RECORDS WHERE diagnosis IS NOT NULL AND diagnosis != '' AND deleted_at IS NULL`
    );

    const diagCountMap = {};
    for (const row of allEmrs) {
      const plainDiag = decrypt(row.diagnosis) || 'General Health Check';
      diagCountMap[plainDiag] = (diagCountMap[plainDiag] || 0) + 1;
    }

    const topDiagnoses = Object.entries(diagCountMap)
      .map(([diagnosis, count]) => ({ diagnosis, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const [deptBreakdown] = await pool.query(
      `SELECT department, COUNT(*) as count
       FROM (
         SELECT COALESCE(sp.course, fp.department, 'General Walk-in') as department
         FROM APPOINTMENTS a
         LEFT JOIN STUDENT_PROFILES sp ON a.patient_user_id = sp.user_id
         LEFT JOIN FACULTY_PROFILES fp ON a.patient_user_id = fp.user_id
         WHERE a.status = 'completed' AND a.deleted_at IS NULL
       ) as d_sub
       GROUP BY department 
       ORDER BY count DESC`
    );

    const [inventory] = await pool.query(
      `SELECT m.name, b.batch_no, b.quantity_on_hand, b.expiry_date 
       FROM MEDICINE_BATCHES b 
       JOIN MEDICINES m ON b.medicine_id = m.medicine_id
       WHERE b.deleted_at IS NULL`
    );

    let csv = '\uFEFF';
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