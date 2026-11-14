// Assembles the dashboard sections the caller can access and loads their aggregate metrics.

import { pool } from '../db/pool.js';
import { decrypt } from '../utils/cryptoVault.js';
import { getPharmacyAnalytics } from '../inventory/pharmacyAnalytics.js';
import { getDiagnosisCounts, getRiskCounts } from './analyticsStats.js';
import { getDailyTimelines } from './dailyTimelines.js';
import { listActiveRoles, listConsultationsByDepartment, listInventoryAlerts } from './reportQueries.js';

async function operationsSummary() {
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
  const timelines = await getDailyTimelines();
  const deptBreakdown = (await listConsultationsByDepartment({ limit: 6 }))
    .map(({ department, count }) => ({ department, consultations_count: count }));
  return {
    totalConsultations: consultations[0].total,
    totalStudents: studentCount[0].total_students,
    emergencyMetrics: emergencies[0],
    ...timelines,
    deptBreakdown,
  };
}

export async function loadSurveillance() {
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

  const {
    hypertension_count,
    asthma_count,
    diabetes_count,
    severe_allergies_count,
    total: riskProfileTotal,
  } = await getRiskCounts();
  return {
    fluStats: { cases_past_7_days, cases_prev_7_days },
    highRiskGroups: { hypertension_count, asthma_count, diabetes_count, severe_allergies_count, total_students_monitored: riskProfileTotal },
  };
}

export async function analyticsSummary(scopes) {
  const canViewInventory = scopes.has('ANALYTICS_PHARMACY');
  const canViewDispensing = scopes.has('ANALYTICS_DISPENSING');
  const [operations, topDiagnoses, surveillance, pharmacy, lowStockMeds, headcount] = await Promise.all([
    scopes.has('ANALYTICS_OPERATIONS') ? operationsSummary() : null,
    scopes.has('ANALYTICS_CLINICAL') ? getDiagnosisCounts() : null,
    scopes.has('ANALYTICS_SURVEILLANCE') ? loadSurveillance() : null,
    canViewDispensing || canViewInventory ? getPharmacyAnalytics({ includeDispensing: canViewDispensing, includeReorder: canViewInventory }) : null,
    canViewInventory ? listInventoryAlerts(6) : null,
    scopes.has('ANALYTICS_HEADCOUNT') ? listActiveRoles() : null,
  ]);
  return {
    scopes: [...scopes],
    operations,
    clinical: topDiagnoses || surveillance ? { topDiagnoses, surveillance } : null,
    pharmacy: pharmacy && {
      windowDays: pharmacy.windowDays,
      dispensing: pharmacy.dispensing,
      inventory: canViewInventory ? { reorderPriorities: pharmacy.reorderPriorities, lowStockMeds } : null,
    },
    headcount: headcount && { roleDistribution: headcount.map(({ code, name, count }) => ({ role_code: code, role_name: name, count })) },
  };
}
