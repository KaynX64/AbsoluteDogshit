import { pool } from '../db/pool.js';
import { decrypt } from '../utils/cryptoVault.js';
import { getBmiCategory } from '../utils/bmi.js';
import { stripLegacyOdontogram, readDentalChart } from './clinicalHistory.js';

const rosterStatuses = {
  active: "a.status IN ('checked_in', 'serving')",
  scheduled: "a.status = 'scheduled'",
  history: "a.status IN ('completed', 'cancelled', 'no_show')",
};

function withDecryptedHealth(row) {
  return {
    ...row,
    allergies: decrypt(row.allergies) || 'None reported',
    chronic_conditions: decrypt(row.chronic_conditions) || 'None reported',
  };
}

export async function listRoster({ filter, doctorId, canViewDental }) {
  const statusCondition = Object.hasOwn(rosterStatuses, filter) ? rosterStatuses[filter] : rosterStatuses.active;
  const doctorCondition = doctorId == null ? '' : 'AND a.doctor_user_id = ?';
  const [rows] = await pool.query(
    `SELECT a.appointment_id,
                a.patient_user_id AS patient_id,
                a.doctor_user_id,
                a.date_time,
                DATE_FORMAT(a.date_time, '%h:%i %p') AS time_slot,
                DATE_FORMAT(a.date_time, '%Y-%m-%d') AS date_str,
                a.appointment_type,
                a.status,
                a.notes,
                a.cancelled_reason,
                u.first_name, u.last_name, u.phone,
                COALESCE(sp.student_no, st.license_no, fp.position, 'PSU Member') AS student_no,
                COALESCE(sp.course, st.department, fp.department, 'PSU Lingayen') AS course,
                hp.blood_type, hp.allergies, hp.chronic_conditions,
                hp.sex, hp.date_of_birth, TIMESTAMPDIFF(YEAR, hp.date_of_birth, CURDATE()) AS age,
                hp.height, hp.weight, hp.bmi, hp.updated_at AS health_profile_updated_at,
                CONCAT('Q-', LPAD(q.queue_number, 2, '0')) AS queue_ticket,
                q.status AS queue_status,
                emr.chief_complaint AS past_chief_complaint,
                emr.diagnosis AS past_diagnosis,
                emr.treatment_plan AS past_treatment,
                emr.notes AS past_clinical_notes,
                rx.notes AS past_dietary_notes,
                dc.chart_data AS past_dental_chart
         FROM APPOINTMENTS a
         JOIN USERS u ON a.patient_user_id = u.user_id
         LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
         LEFT JOIN STAFF_PROFILES st ON u.user_id = st.user_id
         LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id
         LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
         LEFT JOIN QUEUE q ON q.queue_id = (
           SELECT q1.queue_id FROM QUEUE q1
           WHERE q1.appointment_id = a.appointment_id AND q1.queue_date = CURDATE()
           ORDER BY q1.queue_id DESC LIMIT 1
         )
         LEFT JOIN EMR_RECORDS emr ON emr.emr_id = (
           SELECT e.emr_id FROM EMR_RECORDS e
           WHERE e.appointment_id = a.appointment_id AND e.deleted_at IS NULL
           ORDER BY e.encounter_date DESC, e.emr_id DESC LIMIT 1
         )
         LEFT JOIN DENTAL_CHARTS dc ON dc.emr_id = emr.emr_id
         LEFT JOIN PRESCRIPTIONS rx ON rx.prescription_id = (
           SELECT p.prescription_id FROM PRESCRIPTIONS p
           WHERE p.emr_id = emr.emr_id AND p.deleted_at IS NULL
           ORDER BY p.issued_at DESC, p.prescription_id DESC LIMIT 1
         )
         WHERE ${statusCondition}
           ${doctorCondition}
           AND a.deleted_at IS NULL
         ORDER BY a.date_time ASC, a.appointment_id ASC`,
    doctorId == null ? [] : [doctorId],
  );
  return rows.map(row => ({
    ...withDecryptedHealth(row),
    bmi_category: getBmiCategory(row.bmi),
    past_chief_complaint: decrypt(row.past_chief_complaint) || '',
    past_diagnosis: decrypt(row.past_diagnosis) || '',
    past_treatment: stripLegacyOdontogram(decrypt(row.past_treatment)),
    past_clinical_notes: decrypt(row.past_clinical_notes) || '',
    past_dietary_notes: decrypt(row.past_dietary_notes) || '',
    past_dental_chart: canViewDental ? readDentalChart(row.past_dental_chart) : null,
  }));
}

export async function listExpectedArrivals() {
  const [rows] = await pool.query(`SELECT a.appointment_id,
                a.patient_user_id AS patient_id,
                a.doctor_user_id,
                a.date_time,
                DATE_FORMAT(a.date_time, '%h:%i %p') AS time_slot,
                DATE_FORMAT(a.date_time, '%Y-%m-%d') AS date_str,
                a.appointment_type,
                a.status,
                a.notes,
                u.first_name, u.last_name, u.phone,
                COALESCE(sp.student_no, st.license_no, fp.position, 'PSU Member') AS student_no,
                COALESCE(sp.course, st.department, fp.department, 'PSU Lingayen') AS course,
                hp.blood_type, hp.allergies, hp.chronic_conditions,
                doc.first_name AS doctor_first_name,
                doc.last_name AS doctor_last_name,
                COALESCE(stp.specialty, 'Campus Physician') AS doctor_specialty
         FROM APPOINTMENTS a
         JOIN USERS u ON a.patient_user_id = u.user_id
         JOIN USERS doc ON a.doctor_user_id = doc.user_id
         LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
         LEFT JOIN STAFF_PROFILES st ON u.user_id = st.user_id
         LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id
         LEFT JOIN STAFF_PROFILES stp ON doc.user_id = stp.user_id
         LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
         WHERE a.status = 'scheduled'
           AND a.date_time < CURDATE() + INTERVAL 1 DAY
           AND a.deleted_at IS NULL
         ORDER BY a.date_time ASC`);
  return rows.map(withDecryptedHealth);
}

export async function countTodaysNoShows() {
  const [[row]] = await pool.query(`SELECT COUNT(*) AS count
         FROM APPOINTMENTS
         WHERE status = 'no_show'
           AND date_time >= CURDATE() AND date_time < CURDATE() + INTERVAL 1 DAY
           AND deleted_at IS NULL`);
  return row?.count || 0;
}

export async function listDailyTickets() {
  const [rows] = await pool.query(`SELECT q.queue_id,
                CONCAT('Q-', LPAD(q.queue_number, 2, '0')) AS ticket_no,
                u.first_name, u.last_name,
                COALESCE(sp.student_no, st.license_no, 'PSU Member') AS student_no,
                COALESCE(a.appointment_type, 'General Walk-in') AS visit_type,
                q.status,
                DATE_FORMAT(q.checked_in_at, '%h:%i %p') AS arrival_time,
                q.queue_number,
                0 AS is_emergency
         FROM QUEUE q
         JOIN USERS u ON q.patient_user_id = u.user_id
         LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
         LEFT JOIN STAFF_PROFILES st ON u.user_id = st.user_id
         LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id
         LEFT JOIN APPOINTMENTS a ON q.appointment_id = a.appointment_id
         WHERE q.queue_date = CURDATE()
           AND q.status IN ('waiting', 'in-consultation')
         ORDER BY q.status = 'in-consultation' DESC, q.queue_number ASC`);
  return rows;
}

export async function getPersonalTicket(userId) {
  const [[ticket]] = await pool.query(`SELECT q.queue_id,
                CONCAT('Q-', LPAD(q.queue_number, 2, '0')) AS ticket_no,
                q.queue_number,
                q.status,
                q.counter_id,
                COALESCE(CONCAT('Dr. ', doc.first_name, ' ', doc.last_name), 'Campus Physician') AS doctor_name,
                COALESCE(sp.department, 'Clinic Room 1') AS clinic_room
         FROM QUEUE q
         LEFT JOIN APPOINTMENTS a ON q.appointment_id = a.appointment_id
         LEFT JOIN USERS doc ON a.doctor_user_id = doc.user_id
         LEFT JOIN STAFF_PROFILES sp ON doc.user_id = sp.user_id
         WHERE q.patient_user_id = ?
           AND q.queue_date = CURDATE()
           AND q.status IN ('waiting', 'in-consultation')
         ORDER BY q.queue_id DESC
         LIMIT 1`, [userId]);
  if (!ticket) return { hasActiveTicket: false };

  const [[row]] = await pool.query(`SELECT COUNT(*) AS ahead
         FROM QUEUE
         WHERE queue_date = CURDATE()
           AND status = 'waiting'
           AND queue_number < ?`, [ticket.queue_number]);
  const patientsAhead = row?.ahead || 0;
  return {
    hasActiveTicket: true,
    ticket: {
      queue_id: ticket.queue_id,
      ticket_no: ticket.ticket_no,
      status: ticket.status,
      doctor_name: ticket.doctor_name,
      clinic_room: ticket.clinic_room,
      patients_ahead: patientsAhead,
      estimated_wait_minutes: patientsAhead * 10,
    },
  };
}
