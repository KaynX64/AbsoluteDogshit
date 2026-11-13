import { encrypt } from '../utils/cryptoVault.js';
import { completeEncounter, prepareEncounter } from '../appointments/completeEncounter.js';
import { readEncounterText } from '../appointments/encounterText.js';
import { COMPLETED_APPOINTMENT_CONFLICT } from './conflicts.js';

// Only a doctor or dentist may author or edit EMR records.
function assertClinicalAuthor(user) {
  const roles = (user && user.roles) || [];
  if (!roles.some((r) => ['DOCTOR', 'DENTIST'].includes(r))) {
    throw new Error('Only a doctor or dentist may create or edit EMR records.');
  }
}

export async function createEncounter(connection, { payload, local_version }, user) {
  try {
    const encounter = prepareEncounter(payload, user);
    const serverRecordId = await completeEncounter(connection, {
      appointmentId: payload.appointment_id,
      patientId: payload.patient_user_id,
      clinicianId: user.user_id,
      encounter,
      version: local_version,
    });
    return { serverRecordId };
  } catch (error) {
    if (error.appointmentStatus === 'completed') return { conflict: COMPLETED_APPOINTMENT_CONFLICT };
    if (error.code === 'INVALID_DENTAL_CHART') return { validationError: 'Odontogram validation error: ' + error.message };
    throw error;
  }
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
