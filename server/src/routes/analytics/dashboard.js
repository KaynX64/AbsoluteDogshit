import {
  listActiveRoles,
  listConsultationsByDepartment,
  listInventoryAlerts,
} from '../../analytics/reportQueries.js';
import { getPharmacyAnalytics } from '../../inventory/pharmacyAnalytics.js';
import { pool } from '../../db/pool.js';
import { decrypt } from '../../utils/cryptoVault.js';
import { getDailyTimelines } from '../../analytics/dailyTimelines.js';
import { getDiagnosisCounts, getRiskCounts } from '../../analytics/analyticsStats.js';

export function registerAnalyticsDashboard(router) {
  // 1. GET /api/analytics/summary
  router.get('/summary', async (req, res) => {
    try {
      // 1. All-time appointment records (legacy totalConsultations field).
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
              COALESCE(AVG(response_time_seconds), 0) AS avgResponseSeconds,
              COUNT(response_time_seconds) AS timedClosures
       FROM EMERGENCY_ALERTS`
      );

      // 4. Role Distribution (Headcount per role)
      const roleDistribution = (await listActiveRoles()).map(({ code, name, count }) => ({ role_code: code, role_name: name, count }));

      const { timeSeries, emergencyTimeSeries } = await getDailyTimelines();

      const topDiagnoses = await getDiagnosisCounts();

      // 8. Consultation Volume per Department
      const deptBreakdown = (await listConsultationsByDepartment({ limit: 6 }))
        .map(({ department, count }) => ({ department, consultations_count: count }));

      // 9. Flu / Respiratory Surveillance
      const [fluEmrs] = await pool.query(
        `SELECT diagnosis, encounter_date FROM EMR_RECORDS 
       WHERE encounter_date >= DATE_SUB(NOW(), INTERVAL 14 DAY) AND encounter_date <= NOW() AND deleted_at IS NULL`
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
      const [lowStockMeds, { pharmacy, topPrescribedMedicines }] = await Promise.all([
        listInventoryAlerts(6),
        getPharmacyAnalytics(),
      ]);

      res.json({
        totalConsultations: consultations[0]?.total || 0,
        totalStudents: studentCount[0]?.total_students || 0,
        emergencyMetrics: emergencies[0] || { active: 0, avgResponseSeconds: 0, timedClosures: 0 },
        roleDistribution,
        timeSeries,
        emergencyTimeSeries,
        topDiagnoses,
        deptBreakdown,
        fluStats: { cases_past_7_days, cases_prev_7_days },
        highRiskGroups: {
          hypertension_count,
          asthma_count,
          diabetes_count,
          severe_allergies_count,
          total_students_monitored: riskProfileTotal,
        },
        lowStockMeds,
        pharmacy,
        topPrescribedMedicines,
      });
    } catch (error) {
      console.error('[Analytics] Error computing summary:', error);
      res.status(500).json({ error: 'Failed to compute health analytics summary.' });
    }
  });

  // 2. GET /api/analytics/by-department
  router.get('/by-department', async (req, res) => {
    try {
      const breakdown = (await listConsultationsByDepartment({ fallback: 'Other / Walk-in' }))
        .map(({ department, count }) => ({ department, consultation_count: count }));
      res.json(breakdown);
    } catch (error) {
      res.status(500).json({ error: 'Failed to aggregate departmental consultation data.' });
    }
  });
}
