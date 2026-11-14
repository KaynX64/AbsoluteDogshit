// Loads roster and encounter cache snapshots using bounded, paginated database reads.

import { pool } from '../db/pool.js';
import { decrypt } from '../utils/cryptoVault.js';

const patientSelect = `SELECT u.user_id, u.first_name, u.last_name, u.email, u.phone,
                COALESCE(sp.student_no, st.license_no, fp.position, 'PSU Member') AS student_no,
                COALESCE(sp.course, st.department, fp.department, 'PSU Lingayen') AS course,
                sp.year_level, hp.blood_type, hp.allergies, hp.chronic_conditions,
                hp.sex, hp.date_of_birth
         FROM USERS u
         LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
         LEFT JOIN STAFF_PROFILES st ON u.user_id = st.user_id
         LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id
         LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
         WHERE u.is_active = TRUE AND u.deleted_at IS NULL`;
const encounterSelect = `
        SELECT e.emr_id, e.patient_user_id, e.doctor_user_id, e.encounter_date,
               e.chief_complaint, e.diagnosis, e.treatment_plan, e.notes, e.version,
               CONCAT('Dr. ', d.first_name, ' ', d.last_name) AS doctor_name
        FROM EMR_RECORDS e
        JOIN USERS d ON e.doctor_user_id = d.user_id
        WHERE e.deleted_at IS NULL
      `;
const pageSize = 500;

const decryptPatient = row => ({
  ...row,
  allergies: decrypt(row.allergies) || 'None reported',
  chronic_conditions: decrypt(row.chronic_conditions) || 'None reported',
});

const decryptEncounter = row => ({
  ...row,
  chief_complaint: decrypt(row.chief_complaint) || '',
  diagnosis: decrypt(row.diagnosis) || '',
  treatment_plan: decrypt(row.treatment_plan) || '',
  notes: decrypt(row.notes) || '',
});

export async function readLegacyBootstrap(lastSyncedAt) {
  const [patients] = await pool.query(patientSelect + ' LIMIT 500');
  let emrQuery = encounterSelect;
  const queryParams = [];
  if (lastSyncedAt && !isNaN(lastSyncedAt.getTime())) {
    emrQuery += ` AND (e.encounter_date >= ? OR e.updated_at >= ?) `;
    queryParams.push(lastSyncedAt, lastSyncedAt);
  } else {
    // Fallback to 90 days if no timestamp provided (initial sync)
    emrQuery += ` AND e.encounter_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY) `;
  }

  emrQuery += ` ORDER BY e.encounter_date DESC LIMIT 500`;

  const [emrs] = await pool.query(emrQuery, queryParams);
  return {
    patients: patients.map(decryptPatient),
    emrRecords: emrs.map(decryptEncounter),
    serverTime: new Date().toISOString(),
  };
}

export async function startBootstrapScan(since) {
  const [[row]] = await pool.query(
    'SELECT UNIX_TIMESTAMP() AS upperTime, COALESCE(MAX(user_id), 0) AS upperPatientId FROM USERS',
  );
  const upperTime = Number(row.upperTime);
  return {
    since: since != null && since <= upperTime ? since : null,
    upperTime,
    upperPatientId: Number(row.upperPatientId),
    afterPatientId: 0,
    afterEmrId: 0,
  };
}

export async function readBootstrapPage(scan) {
  const patients = [];
  const emrRecords = [];
  let afterPatientId = scan.afterPatientId;
  let afterEmrId = scan.afterEmrId;

  if (afterPatientId !== null) {
    const [rows] = await pool.query(
      patientSelect + ' AND u.user_id > ? AND u.user_id <= ? ORDER BY u.user_id LIMIT ?',
      [afterPatientId, scan.upperPatientId, pageSize + 1],
    );
    patients.push(...rows.slice(0, pageSize).map(decryptPatient));
    afterPatientId = rows.length > pageSize ? Number(rows[pageSize - 1].user_id) : null;
  }

  if (afterEmrId !== null) {
    const lowerBound = scan.since === null
      ? ' AND e.encounter_date >= DATE(FROM_UNIXTIME(?)) - INTERVAL 90 DAY'
      : ' AND e.updated_at >= FROM_UNIXTIME(?)';
    const [rows] = await pool.query(
      encounterSelect + lowerBound +
        ' AND e.updated_at < FROM_UNIXTIME(?) AND e.emr_id > ? ORDER BY e.emr_id LIMIT ?',
      [scan.since ?? scan.upperTime, scan.upperTime, afterEmrId, pageSize + 1],
    );
    emrRecords.push(...rows.slice(0, pageSize).map(decryptEncounter));
    afterEmrId = rows.length > pageSize ? Number(rows[pageSize - 1].emr_id) : null;
  }
  return {
    patients,
    emrRecords,
    serverTime: new Date(scan.upperTime * 1000).toISOString(),
    nextScan: afterPatientId === null && afterEmrId === null ? null : { ...scan, afterPatientId, afterEmrId },
  };
}
