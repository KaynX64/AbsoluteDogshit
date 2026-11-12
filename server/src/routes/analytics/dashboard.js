import { pool } from '../../db/pool.js';
import { decrypt } from '../../utils/cryptoVault.js';
import { getDiagnosisCounts, getRiskCounts } from '../../utils/analyticsStats.js';

export function registerAnalyticsDashboard(router) {
  // 1. GET /api/analytics/summary
  router.get('/summary', async (req, res) => {
    try {
      // 1. Total Consultations
      const [consultations] = await pool.query(
        'SELECT COUNT(*) as total FROM APPOINTMENTS WHERE deleted_at IS NULL'
      );

      // 2. Total Enrolled Students
      const [studentCount] = await pool.query(
        `SELECT COUNT(DISTINCT sp.user_id) as total_students
       FROM STUDENT_PROFILES sp
       JOIN USERS u ON sp.user_id = u.user_id
       WHERE u.is_active = TRUE AND u.deleted_at IS NULL`
      );

      // 3. Active Emergencies & Average Response Time
      const [emergencies] = await pool.query(
        `SELECT COUNT(CASE WHEN status IN ('triggered', 'acknowledged', 'dispatched') THEN 1 END) as active,
              COALESCE(AVG(response_time_seconds), 0) as avgResponseSeconds 
       FROM EMERGENCY_ALERTS`
      );

      // 4. Role Distribution (Headcount per role)
      const [roleDistribution] = await pool.query(
        `SELECT r.code AS role_code, 
              r.name AS role_name, 
              COUNT(u.user_id) AS count
       FROM ROLES r
       LEFT JOIN USER_ROLES ur ON r.role_id = ur.role_id
       LEFT JOIN USERS u ON ur.user_id = u.user_id AND u.is_active = TRUE AND u.deleted_at IS NULL
       GROUP BY r.role_id, r.code, r.name
       ORDER BY count DESC`
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

      // 6. 14-Day Emergency SOS Incidents Timeline
      const [dailyEmergencyTimeline] = await pool.query(
        `SELECT date_key, label, COUNT(*) as count
       FROM (
         SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as date_key,
                DATE_FORMAT(created_at, '%b %d') as label
         FROM EMERGENCY_ALERTS
         WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
       ) AS em_sub
       GROUP BY date_key, label
       ORDER BY date_key ASC`
      );

      const emergencyTimelineMap = new Map(dailyEmergencyTimeline.map((item) => [item.date_key, item.count]));
      const emergencyTimeSeries = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateKey = d.toISOString().split('T')[0];
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        emergencyTimeSeries.push({
          date: dateKey,
          label,
          count: emergencyTimelineMap.get(dateKey) || 0,
        });
      }

      // 7. Top Diagnoses (In-Memory AES-256 Decrypted Aggregation)
      // Full distinct list — the desktop bar chart renders every diagnosis in
      // the database (countDiagnoses itself caps the output at MAX_DISTINCT=500
      // and the result is cached). Exports keep their own tighter slices.
      const topDiagnoses = await getDiagnosisCounts();

      // 8. Consultation Volume per Department
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

      // 9. Flu / Respiratory Surveillance
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

      // 10. High-Risk Student Groups
      const {
        hypertension_count,
        asthma_count,
        diabetes_count,
        severe_allergies_count,
        total: riskProfileTotal,
      } = await getRiskCounts();

    
      // 11. Low Stock & Near Expiry Pharmacy Batches
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
        totalConsultations: consultations[0]?.total || 0,
        totalStudents: studentCount[0]?.total_students || 0,
        emergencyMetrics: emergencies[0] || { active: 0, avgResponseSeconds: 0 },
        roleDistribution,
        timeSeries,
        emergencyTimeSeries,
        topDiagnoses: topDiagnoses.length > 0 ? topDiagnoses : [{ diagnosis: 'General Health Check', count: 1 }],
        deptBreakdown: deptBreakdown.length > 0 ? deptBreakdown : [{ department: 'BS Information Technology', consultations_count: 1 }],
        fluStats: { cases_past_7_days, cases_prev_7_days },
        highRiskGroups: {
          hypertension_count,
          asthma_count,
          diabetes_count,
          severe_allergies_count,
          total_students_monitored: riskProfileTotal,
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
}
