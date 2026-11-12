import { encrypt } from '../utils/cryptoVault.js';
import { validateDentalChart } from '../utils/dentalValidator.js';
import { assertAppointmentInQueue } from '../documents/signing/signatory.js';
import { validateVitals, VITAL_RULES } from '../appointments/vitals.js';
import { readEncounterText } from '../appointments/encounterText.js';
import { COMPLETED_APPOINTMENT_CONFLICT, isCompletedAppointment } from './conflicts.js';

// Only a doctor or dentist may author or edit EMR records.
function assertClinicalAuthor(user) {
  const roles = (user && user.roles) || [];
  if (!roles.some((r) => ['DOCTOR', 'DENTIST'].includes(r))) {
    throw new Error('Only a doctor or dentist may create or edit EMR records.');
  }
}

export async function createEncounter(connection, { payload, local_version }, user) {
  const userId = user.user_id;
  const {
    patient_user_id,
    appointment_id,
    vitals: submittedVitals,
    dental_chart,
  } = payload;

  const userRoles = user.roles || [];
  if (
    submittedVitals !== undefined &&
    !userRoles.includes('ADMIN') &&
    (userRoles.includes('DOCTOR') || userRoles.includes('DENTIST'))
  ) {
    throw new Error('Doctors and dentists cannot record patient vitals.');
  }
  const { values: vitals, errors } = validateVitals(submittedVitals);
  const vitalError = Object.values(errors)[0];
  if (vitalError) throw new Error(vitalError);
  const { chief_complaint, diagnosis, treatment_plan, notes } = readEncounterText(payload);

  if (appointment_id && await isCompletedAppointment(connection, appointment_id)) {
    return { conflict: COMPLETED_APPOINTMENT_CONFLICT };
  }

  // Encounters may only be recorded for a patient in the QUEUE
  // (checked_in / serving) assigned to this clinician.
  await assertAppointmentInQueue(connection, appointment_id, patient_user_id, userId);

  // Insert new EMR with AES-256 encryption
  const [emrResult] = await connection.query(
    `INSERT INTO EMR_RECORDS
      (patient_user_id, doctor_user_id, appointment_id, chief_complaint, diagnosis, treatment_plan, notes, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      patient_user_id, userId, appointment_id || null,
      encrypt(chief_complaint), encrypt(diagnosis), encrypt(treatment_plan || ''), encrypt(notes || ''),
      local_version,
    ]
  );
  const serverRecordId = emrResult.insertId;

  // Dentist-only odontogram
  if (dental_chart && typeof dental_chart === 'object' && (user.roles || []).includes('DENTIST')) {
    const chartValidation = validateDentalChart(dental_chart);
    if (!chartValidation.valid) {
      return { validationError: `Odontogram validation error: ${chartValidation.error}` };
    }
    await connection.query(
      `INSERT INTO DENTAL_CHARTS (emr_id, patient_user_id, dentist_user_id, chart_data) VALUES (?, ?, ?, ?)`,
      [serverRecordId, patient_user_id, userId, encrypt(JSON.stringify(dental_chart))]
    );
  }

  // Link appointment and queue
  if (appointment_id) {
    await connection.query("UPDATE APPOINTMENTS SET status = 'completed' WHERE appointment_id = ?", [appointment_id]);
    await connection.query("UPDATE QUEUE SET status = 'done', served_at = CURRENT_TIMESTAMP WHERE appointment_id = ?", [appointment_id]);
  }

  // Persist replayed vitals
  for (const [metric, value] of Object.entries(vitals)) {
    await connection.query(
      'INSERT INTO VITAL_SIGNS (emr_id, metric, value, unit, recorded_by) VALUES (?, ?, ?, ?, ?)',
      [serverRecordId, metric, value, VITAL_RULES[metric].unit, userId]
    );
  }
  return { serverRecordId };
}

export async function updateEncounter(connection, { payload }, user) {
  const userId = user.user_id;
  const { emr_id } = payload;
  if (!emr_id) throw new Error('emr_id is required for UPDATE');
  assertClinicalAuthor(user);
  const { chief_complaint, diagnosis, treatment_plan, notes } = readEncounterText(payload);

  // Only the clinician who authored the EMR may edit it.
  const [updateResult] = await connection.query(
    `UPDATE EMR_RECORDS SET
      chief_complaint = ?, diagnosis = ?, treatment_plan = ?, notes = ?, version = version + 1
     WHERE emr_id = ? AND doctor_user_id = ? AND deleted_at IS NULL`,
    [
      encrypt(chief_complaint), encrypt(diagnosis),
      encrypt(treatment_plan || ''), encrypt(notes || ''),
      emr_id, userId
    ]
  );
  if (updateResult.affectedRows === 0) {
    throw new Error('EMR not found, or you are not the authoring clinician.');
  }
  return { serverRecordId: emr_id };
}
