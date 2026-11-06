// server/src/utils/signatory.js
//
// Single source of truth for "who may sign a clinical document".
// formatSignatory / formatIssuedBy are pure. The assert* guards take an open
// connection so they can run inside the caller's transaction.

export const SIGNER_ROLES = ['DOCTOR', 'DENTIST'];
const PATIENT_ROLES = ['STUDENT', 'FACULTY', 'NON_TEACHING'];
const DESIGNATION = { DOCTOR: 'Physician', DENTIST: 'Dentist' };

export class SignerError extends Error {
  constructor(message, status = 403, code = 'INVALID_SIGNER') {
    super(message);
    this.name = 'SignerError';
    this.status = status;
    this.code = code;
  }
}

export function isQualifiedSigner(role) {
  return SIGNER_ROLES.includes(role);
}

// Builds the name / title / license text printed on a document.
export function formatSignatory({ first_name, last_name, role, license_no }) {
  const qualified = isQualifiedSigner(role);
  const license = String(license_no || '').trim();
  return {
    name: qualified ? `Dr. ${first_name} ${last_name}` : `${first_name} ${last_name}`,
    designation: DESIGNATION[role] || 'Not an authorized signatory',
    license_no: license || 'License not on file',
    qualified: qualified && Boolean(license),
    caption:
      qualified && license
        ? `${DESIGNATION[role]} · PRC Lic. No. ${license}`
        : 'UNVERIFIED SIGNATORY',
  };
}

// One-line text used by the QR verification endpoints.
export function formatIssuedBy(first_name, last_name, license_no, role) {
  const s = formatSignatory({ first_name, last_name, role, license_no });
  return `${s.name} (${s.designation}, ${s.license_no})`;
}

// Re-checks the DATABASE (not the JWT) at the moment of signing.
export async function assertValidSigner(conn, userId, allowedRoles = SIGNER_ROLES) {
  const [rows] = await conn.query(
    `SELECT u.user_id, u.first_name, u.last_name, u.is_active,
            sp.license_no, sp.specialty, r.code AS role_code
     FROM USERS u
     LEFT JOIN STAFF_PROFILES sp ON sp.user_id = u.user_id
     LEFT JOIN USER_ROLES ur     ON ur.user_id = u.user_id
     LEFT JOIN ROLES r           ON r.role_id  = ur.role_id
     WHERE u.user_id = ? AND u.deleted_at IS NULL`,
    [userId]
  );

  if (rows.length === 0) {
    throw new SignerError('Signer account not found.', 403, 'SIGNER_NOT_FOUND');
  }
  const base = rows[0];
  if (!base.is_active) {
    throw new SignerError('Signer account is deactivated.', 403, 'SIGNER_INACTIVE');
  }

  const role = rows.map((r) => r.role_code).find((c) => allowedRoles.includes(c));
  if (!role) {
    throw new SignerError(
      'Your account no longer holds a role authorized to sign this document.',
      403,
      'SIGNER_ROLE_REVOKED'
    );
  }

  const license = String(base.license_no || '').trim();
  if (!license) {
    throw new SignerError(
      'No PRC license number is on file for your account. Ask an administrator to add it before signing documents.',
      403,
      'SIGNER_NO_LICENSE'
    );
  }

  return {
    user_id: base.user_id,
    first_name: base.first_name,
    last_name: base.last_name,
    role,
    license_no: license,
    specialty: base.specialty || null,
    display: formatSignatory({
      first_name: base.first_name,
      last_name: base.last_name,
      role,
      license_no: license,
    }),
  };
}

// The document recipient must be an active patient account, never the signer.
export async function assertValidPatient(conn, patientId, signerId) {
  const id = Number(patientId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new SignerError('A valid patient id is required.', 400, 'INVALID_PATIENT');
  }
  if (id === Number(signerId)) {
    throw new SignerError('Practitioners cannot issue documents to themselves.', 403, 'SELF_ISSUE');
  }

  const [rows] = await conn.query(
    `SELECT u.user_id, u.is_active, r.code AS role_code
     FROM USERS u
     LEFT JOIN USER_ROLES ur ON ur.user_id = u.user_id
     LEFT JOIN ROLES r       ON r.role_id  = ur.role_id
     WHERE u.user_id = ? AND u.deleted_at IS NULL`,
    [id]
  );

  if (rows.length === 0 || !rows[0].is_active) {
    throw new SignerError('Patient account not found or inactive.', 404, 'PATIENT_NOT_FOUND');
  }
  if (!rows.some((r) => PATIENT_ROLES.includes(r.role_code))) {
    throw new SignerError('Documents can only be issued to patient accounts.', 400, 'NOT_A_PATIENT');
  }
}

// A supplied emr_id must exist and belong to this patient.
export async function assertEmrBelongsToPatient(conn, emrId, patientId) {
  const [rows] = await conn.query(
    'SELECT emr_id FROM EMR_RECORDS WHERE emr_id = ? AND patient_user_id = ? AND deleted_at IS NULL',
    [emrId, patientId]
  );
  if (rows.length === 0) {
    throw new SignerError('emr_id does not belong to this patient.', 400, 'EMR_PATIENT_MISMATCH');
  }
}


// Documents may only be issued for a patient who is IN THE QUEUE (triaged:
// checked_in / serving) and assigned to the signing practitioner.
// Bookings ('scheduled') are view-only.
export async function assertAppointmentInQueue(conn, appointmentId, patientId, signerId) {
  const id = Number(appointmentId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new SignerError(
      'appointment_id is required. Documents can only be issued from the consultation queue.',
      400,
      'APPOINTMENT_REQUIRED'
    );
  }

  const [rows] = await conn.query(
    `SELECT status
       FROM APPOINTMENTS
      WHERE appointment_id = ?
        AND patient_user_id = ?
        AND doctor_user_id = ?
        AND deleted_at IS NULL`,
    [id, patientId, signerId]
  );

  if (rows.length === 0) {
    throw new SignerError(
      'Appointment not found for this patient under your care.',
      404,
      'APPOINTMENT_NOT_FOUND'
    );
  }
  if (!['checked_in', 'serving'].includes(rows[0].status)) {
    throw new SignerError(
      'Documents can only be issued while the patient is in the consultation queue (triaged and checked in). Bookings are view-only.',
      409,
      'NOT_IN_QUEUE'
    );
  }
}

// Default 180 days; rejects invalid, past, or > 365-day expiry dates.
export function resolveExpiryDate(input, defaultDays = 180, maxDays = 365) {
  const DAY = 24 * 60 * 60 * 1000;
  if (!input) {
    return new Date(Date.now() + defaultDays * DAY).toISOString().split('T')[0];
  }
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) {
    throw new SignerError('expires_at is not a valid date.', 400, 'INVALID_EXPIRY');
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d.getTime() < today.getTime()) {
    throw new SignerError('expires_at cannot be in the past.', 400, 'INVALID_EXPIRY');
  }
  if (d.getTime() - today.getTime() > maxDays * DAY) {
    throw new SignerError(`expires_at cannot be more than ${maxDays} days from today.`, 400, 'INVALID_EXPIRY');
  }
  return d.toISOString().split('T')[0];
}