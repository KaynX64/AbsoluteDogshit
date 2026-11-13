import { encrypt } from '../utils/cryptoVault.js';
import { validateDentalChart } from './dentalValidator.js';
import { assertAppointmentInQueue } from './eligibility.js';
import { readEncounterText } from './encounterText.js';
import { AppointmentTransitionError, updateLockedAppointmentStatus } from './transitions.js';
import { validateVitals, VITAL_RULES } from './vitals.js';

export function prepareEncounter(payload, user) {
  const { vitals: submittedVitals, dental_chart: chart } = payload;
  const roles = user.roles || [];
  if (submittedVitals !== undefined && !roles.includes('ADMIN') &&
      (roles.includes('DOCTOR') || roles.includes('DENTIST'))) {
    throw new AppointmentTransitionError('Doctors and dentists cannot record patient vitals.', 403);
  }

  const { values: vitals, errors } = validateVitals(submittedVitals);
  const vitalError = Object.values(errors)[0];
  if (vitalError) throw new AppointmentTransitionError(vitalError, 400);
  let text;
  try {
    text = readEncounterText(payload);
  } catch (error) {
    throw new AppointmentTransitionError(error.message, 400);
  }

  const dentalChart = roles.includes('DENTIST') ? chart : null;
  if (dentalChart != null) {
    const validation = validateDentalChart(dentalChart);
    if (!validation.valid) throw new AppointmentTransitionError(validation.error, 400, 'INVALID_DENTAL_CHART');
  }
  return { text, vitals, dentalChart };
}

export async function completeEncounter(connection, {
  appointmentId, patientId, clinicianId, encounter, version = 1, updateMeasurements = false,
}) {
  const currentStatus = await assertAppointmentInQueue(connection, appointmentId, patientId, clinicianId, { lock: true });
  const { text, vitals, dentalChart } = encounter;
  const [result] = await connection.query(
    `INSERT INTO EMR_RECORDS
       (patient_user_id, doctor_user_id, appointment_id, chief_complaint, diagnosis, treatment_plan, notes, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [patientId, clinicianId, appointmentId, encrypt(text.chief_complaint), encrypt(text.diagnosis),
      encrypt(text.treatment_plan || ''), encrypt(text.notes || ''), version],
  );
  const emrId = result.insertId;
  if (dentalChart) {
    await connection.query(
      'INSERT INTO DENTAL_CHARTS (emr_id, patient_user_id, dentist_user_id, chart_data) VALUES (?, ?, ?, ?)',
      [emrId, patientId, clinicianId, encrypt(JSON.stringify(dentalChart))],
    );
  }

  const measurements = Object.entries(vitals).map(
    ([metric, value]) => [emrId, metric, value, VITAL_RULES[metric].unit, clinicianId],
  );
  if (measurements.length) {
    await connection.query(
      'INSERT INTO VITAL_SIGNS (emr_id, metric, value, unit, recorded_by) VALUES ?',
      [measurements],
    );
  }

  if (updateMeasurements && (vitals.height || vitals.weight)) {
    const height = vitals.height ? Number(vitals.height) : null;
    const weight = vitals.weight ? Number(vitals.weight) : null;
    await connection.query(
      `INSERT INTO HEALTH_PROFILES (user_id, height, weight) VALUES (?, ?, ?) AS submitted
       ON DUPLICATE KEY UPDATE height = COALESCE(submitted.height, HEALTH_PROFILES.height),
                               weight = COALESCE(submitted.weight, HEALTH_PROFILES.weight),
                               updated_at = CURRENT_TIMESTAMP`,
      [patientId, height, weight],
    );
  }
  await updateLockedAppointmentStatus(connection, appointmentId, currentStatus, 'completed');
  return emrId;
}
