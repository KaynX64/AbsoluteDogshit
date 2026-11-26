// Adds a one-time synthetic clinic walkthrough to an existing development database.
import 'dotenv/config';
import bcrypt from 'bcryptjs';

const label = 'Synthetic clinic fixture';
const patients = [
  { name: 'Avery', role: 'STUDENT', birthDate: '2004-02-12', height: 164, weight: 56 },
  { name: 'Blair', role: 'STUDENT', birthDate: '2005-09-03', height: 172, weight: 67 },
  { name: 'Casey', role: 'FACULTY', birthDate: '1985-06-18', height: 159, weight: 61 },
  { name: 'Devon', role: 'FACULTY', birthDate: '1991-12-10', height: 177, weight: 75 },
  { name: 'Ellis', role: 'NON_TEACHING', birthDate: '1989-07-25', height: 167, weight: 70 },
  { name: 'Finley', role: 'NON_TEACHING', birthDate: '1995-03-30', height: 170, weight: 63 },
].map(patient => ({ ...patient, email: `clinic-${patient.name.toLowerCase()}@example.invalid` }));

const staffRoles = { 'doctor@psu.edu.ph': 'DOCTOR', 'dentist@psu.edu.ph': 'DENTIST', 'nurse@psu.edu.ph': 'NURSE' };
const visits = [
  { patient: 0, days: -3, hour: 9, complaint: 'Headache', diagnosis: 'Tension headache' },
  { patient: 1, days: -7, hour: 10, complaint: 'Routine dental examination', diagnosis: 'Routine dental follow-up', dental: true },
  { patient: 2, days: -14, hour: 13, complaint: 'Seasonal congestion', diagnosis: 'Allergic rhinitis' },
  { patient: 3, days: -35, hour: 14, complaint: 'Routine examination', diagnosis: 'Routine follow-up' },
  { patient: 4, days: -49, hour: 11, complaint: 'Tooth sensitivity', diagnosis: 'Dental sensitivity', dental: true },
  { patient: 5, days: -77, hour: 15, complaint: 'Ankle soreness', diagnosis: 'Ankle strain' },
  { patient: 0, days: 0, hour: 9, status: 'checked_in', ticket: 'waiting' },
  { patient: 1, days: 0, hour: 10, status: 'serving', ticket: 'in-consultation', dental: true },
  { patient: 2, days: 1, hour: 9, status: 'scheduled' },
  { patient: 3, days: 2, hour: 10, status: 'scheduled', dental: true },
  { patient: 4, days: -2, hour: 14, status: 'cancelled' },
  { patient: 5, days: 0, hour: 8, status: 'no_show' },
];

const formulary = [
  { name: 'Paracetamol', form: 'Tablet', strength: '500 mg', unit: 'pcs', lots: [[8, 60], [180, 40]] },
  { name: 'Cetirizine', form: 'Tablet', strength: '10 mg', unit: 'pcs', lots: [[120, 5]] },
  { name: 'Oral rehydration salts', form: 'Powder', strength: '20.5 g', unit: 'pcs', lots: [[-10, 12]] },
];

async function insertPatient(db, patient, passwordHash, encrypt) {
  const [{ insertId: id }] = await db.execute(
    'INSERT INTO USERS (email, password_hash, first_name, last_name, is_demo_account) VALUES (?, ?, ?, ?, TRUE)',
    [patient.email, passwordHash, patient.name, 'Synthetic Clinic Demo'],
  );
  const [{ affectedRows }] = await db.execute(
    'INSERT INTO USER_ROLES (user_id, role_id) SELECT ?, role_id FROM ROLES WHERE code = ?', [id, patient.role],
  );
  if (affectedRows !== 1) throw new Error(`Fixture role ${patient.role} is missing.`);
  const profileId = `CLINIC-DEMO-${patient.name.toUpperCase()}`;
  if (patient.role === 'STUDENT') {
    await db.execute('INSERT INTO STUDENT_PROFILES (user_id, student_no, course, year_level) VALUES (?, ?, ?, ?)',
      [id, profileId, 'BS Information Technology', 3]);
  } else if (patient.role === 'FACULTY') {
    await db.execute('INSERT INTO FACULTY_PROFILES (user_id, faculty_no, department, position) VALUES (?, ?, ?, ?)',
      [id, profileId, 'College of Computing Studies', 'Instructor']);
  } else {
    await db.execute('INSERT INTO NON_TEACHING_PROFILES (user_id, employee_no, department, position) VALUES (?, ?, ?, ?)',
      [id, profileId, 'Campus Library', 'Library Assistant']);
  }
  await db.execute('INSERT INTO HEALTH_PROFILES (user_id, date_of_birth, height, weight, allergies) VALUES (?, ?, ?, ?, ?)',
    [id, patient.birthDate, patient.height, patient.weight, encrypt(patient.name === 'Casey' ? 'Pollen' : 'None reported')]);
  await db.execute('INSERT INTO CONSENT_RECORDS (user_id, is_granted) VALUES (?, TRUE)', [id]);
  return id;
}

async function insertVisit(db, visit, patientId, clinicianId, nurseId, { encrypt, reserveQueueTicket, VITAL_RULES, formatTriageNote }) {
  const status = visit.status ?? 'completed';
  const counterId = 1;
  const vitals = { systolic_bp: 116 + visit.patient, diastolic_bp: 74, pulse: 72 + visit.patient, temperature: 36.6, spo2: 98 };
  const [[{ dateTime }]] = await db.execute(
    `SELECT DATE_FORMAT(DATE_ADD(DATE_ADD(CURDATE(), INTERVAL ? DAY), INTERVAL ? HOUR), '%Y-%m-%d %H:%i:%s') AS dateTime`,
    [visit.days, visit.hour],
  );
  const [{ insertId: appointmentId }] = await db.execute(
    `INSERT INTO APPOINTMENTS
       (patient_user_id, doctor_user_id, date_time, appointment_type, status, reminder_sent, booked_at, cancelled_reason, notes)
     VALUES (?, ?, ?, ?, ?, TRUE, LEAST(NOW(), DATE_SUB(?, INTERVAL 1 DAY)), ?, ?)`,
    [patientId, clinicianId, dateTime, visit.dental ? 'Dental Checkup' : 'General consultation', status,
      dateTime, status === 'cancelled' ? label : null, visit.ticket ? formatTriageNote(vitals) + label : label],
  );
  if (visit.ticket) {
    const { queueDate, queueNumber } = await reserveQueueTicket(db, counterId);
    await db.execute(
      `INSERT INTO QUEUE (patient_user_id, appointment_id, queue_date, counter_id, queue_number, status, served_at)
       VALUES (?, ?, ?, ?, ?, ?, IF(? = 'in-consultation', NOW(), NULL))`,
      [patientId, appointmentId, queueDate, counterId, queueNumber, visit.ticket, visit.ticket],
    );
  }
  if (status !== 'completed') return;

  const [{ insertId: emrId }] = await db.execute(
    `INSERT INTO EMR_RECORDS (patient_user_id, doctor_user_id, appointment_id, encounter_date, chief_complaint, diagnosis, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [patientId, clinicianId, appointmentId, dateTime, encrypt(visit.complaint), encrypt(visit.diagnosis), encrypt(label)],
  );
  await db.query(
    `INSERT INTO VITAL_SIGNS (emr_id, metric, value, unit, recorded_by, recorded_at) VALUES ?`,
    [Object.entries(vitals).map(([metric, value]) => [emrId, metric, value, VITAL_RULES[metric].unit, nurseId, dateTime])],
  );
  if (visit.dental) {
    const chart = { 3: { number: 3, condition: 'filled', notes: label }, 8: { number: 8, condition: 'sound' } };
    await db.execute('INSERT INTO DENTAL_CHARTS (emr_id, patient_user_id, dentist_user_id, chart_data) VALUES (?, ?, ?, ?)',
      [emrId, patientId, clinicianId, encrypt(JSON.stringify(chart))]);
  }
}

async function insertInventory(db, nurseId) {
  for (const [index, medicine] of formulary.entries()) {
    const [{ insertId: medicineId }] = await db.execute(
      'INSERT INTO MEDICINES (name, generic_name, form, strength, unit) VALUES (?, ?, ?, ?, ?)',
      [`Demo ${medicine.name}`, medicine.name, medicine.form, medicine.strength, medicine.unit],
    );
    for (const [lotIndex, [expiryDays, quantity]] of medicine.lots.entries()) {
      const [{ insertId: batchId }] = await db.execute(
        `INSERT INTO MEDICINE_BATCHES (medicine_id, batch_no, manufacture_date, expiry_date, supplier, quantity_on_hand)
         VALUES (?, ?, CURDATE() - INTERVAL 180 DAY, DATE_ADD(CURDATE(), INTERVAL ? DAY), ?, ?)`,
        [medicineId, `CLINIC-DEMO-${index + 1}-${lotIndex + 1}`, expiryDays, label, quantity],
      );
      await db.execute(
        `INSERT INTO INVENTORY_LOGS (batch_id, quantity_change, transaction_type, reason, performed_by)
         VALUES (?, ?, 'receive', ?, ?)`, [batchId, quantity, label, nurseId],
      );
    }
  }
}

async function seedClinic(db, passwordHash, helpers) {
  const [staffRows] = await db.query(
    `SELECT u.user_id, u.email, r.code FROM USERS u
       JOIN USER_ROLES ur ON ur.user_id = u.user_id JOIN ROLES r ON r.role_id = ur.role_id
       WHERE u.email IN (?) AND u.is_active = TRUE AND u.deleted_at IS NULL FOR UPDATE`,
    [Object.keys(staffRoles)],
  );
  // Keep the demo staff rows locked through the fixture check and inserts to serialize concurrent runs.
  const staff = Object.fromEntries(staffRows.filter(row => staffRoles[row.email] === row.code)
    .map(row => [row.code, row.user_id]));
  if (Object.keys(staff).length !== Object.keys(staffRoles).length) {
    throw new Error('The active demo doctor, dentist and nurse accounts from schema.sql are required.');
  }

  const [existing] = await db.query('SELECT email, last_name FROM USERS WHERE email IN (?)', [patients.map(patient => patient.email)]);
  if (existing.length === patients.length && existing.every(row => row.last_name === 'Synthetic Clinic Demo')) return false;
  if (existing.length) throw new Error('Some fixture accounts already exist. Use a fresh development database for another copy.');

  const patientIds = [];
  for (const patient of patients) patientIds.push(await insertPatient(db, patient, passwordHash, helpers.encrypt));
  for (const visit of visits) {
    const clinician = visit.dental ? staff.DENTIST : staff.DOCTOR;
    await insertVisit(db, visit, patientIds[visit.patient], clinician, staff.NURSE, helpers);
  }
  await insertInventory(db, staff.NURSE);
  return true;
}

const loopback = ['127.0.0.1', 'localhost', '::1'];
if (!process.argv.includes('--development-fixture') || process.env.NODE_ENV === 'production' ||
    !loopback.includes(process.env.DB_HOST || '127.0.0.1')) {
  console.error('Use --development-fixture with a loopback development database.');
  process.exitCode = 1;
} else {
  let pool;
  let sosPool;
  try {
    ({ pool, sosPool } = await import('../src/db/pool.js'));
    const { inTransaction } = await import('../src/db/transaction.js');
    const { encrypt } = await import('../src/utils/cryptoVault.js');
    const { reserveQueueTicket } = await import('../src/appointments/queueTickets.js');
    const { VITAL_RULES, formatTriageNote } = await import('../src/appointments/vitals.js');
    // Reuse the documented password from schema.sql for these synthetic patient accounts.
    const passwordHash = await bcrypt.hash('Password123!', 10);
    const inserted = await inTransaction(db => seedClinic(db, passwordHash, { encrypt, reserveQueueTicket, VITAL_RULES, formatTriageNote }),
      { readCommitted: true, retries: 2 });
    console.log(inserted
      ? 'Added 6 synthetic patients, 12 appointments, 2 live queue tickets, 6 encounters and 4 inventory lots.'
      : 'The synthetic clinic fixture is already present.');
  } catch (error) {
    console.error('Clinic fixture failed:', error.code || error.message);
    process.exitCode = 1;
  } finally {
    await Promise.all([pool?.end(), sosPool?.end()]);
  }
}
