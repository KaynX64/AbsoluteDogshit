// Validates and saves health profile changes, encrypts clinical text, and records the audit entry.

import { isCalendarDate } from '../../config/appointmentRules.js';
import { fail } from '../../utils/httpError.js';
import { encrypt } from '../../utils/cryptoVault.js';
import { logAudit } from '../../utils/auditLogger.js';

export async function saveHealthProfile(connection, targetUserId, health_profile, { actorId, ipAddress, operation = 'ADMIN_ADVANCED_PROFILE_OVERRIDE' }) {
  if (health_profile !== undefined) {
    if (health_profile === null || typeof health_profile !== 'object' || Array.isArray(health_profile)) {
      throw fail('health_profile must be an object of health record fields.', 400);
    }

    const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    const hpIn = { ...health_profile };
    // bmi is a GENERATED ALWAYS column derived from height & weight —
    // it can never be written directly (writes would throw SQL errors).
    delete hpIn.bmi;

    const has = (k) => Object.prototype.hasOwnProperty.call(hpIn, k);
    const cleanOptionalText = (value, maxLen, label) => {
      if (value === null || value === undefined) return null;
      const s = String(value).trim();
      if (!s) return null;
      if (s.length > maxLen) throw fail(`${label} must be ${maxLen} characters or fewer.`, 400);
      return s;
    };

    let nextBlood = null;
    if (has('blood_type') && hpIn.blood_type) {
      if (!BLOOD_TYPES.includes(hpIn.blood_type)) {
        throw fail(`Invalid blood type. Allowed values: ${BLOOD_TYPES.join(', ')}.`, 400);
      }
      nextBlood = hpIn.blood_type;
    }

    let nextSex = null;
    if (has('sex') && hpIn.sex) {
      if (!['MALE', 'FEMALE'].includes(hpIn.sex)) {
        throw fail('sex must be MALE or FEMALE.', 400);
      }
      nextSex = hpIn.sex;
    }

    let nextDob = null;
    if (has('date_of_birth') && hpIn.date_of_birth) {
      const dob = String(hpIn.date_of_birth).trim();
      if (!isCalendarDate(dob)) {
        throw fail('date_of_birth must be a valid date in YYYY-MM-DD format.', 400);
      }
      const dobTime = Date.parse(`${dob}T00:00:00Z`);
      if (dobTime > Date.now()) throw fail('date_of_birth cannot be in the future.', 400);
      if (dobTime < Date.parse('1900-01-01T00:00:00Z')) {
        throw fail('date_of_birth must be on or after 1900-01-01.', 400);
      }
      nextDob = dob;
    }

    const cleanMetric = (value, min, max, label) => {
      if (value === null || value === undefined || value === '') return null;
      const num = Number(value);
      if (!Number.isFinite(num) || num < min || num > max) {
        throw fail(`${label} must be a number between ${min} and ${max}.`, 400);
      }
      return Math.round(num * 100) / 100;
    };
    const nextHeight = has('height') ? cleanMetric(hpIn.height, 30, 300, 'height (cm)') : undefined;
    const nextWeight = has('weight') ? cleanMetric(hpIn.weight, 1, 500, 'weight (kg)') : undefined;
    const nextEmName = has('emergency_contact_name')
      ? cleanOptionalText(hpIn.emergency_contact_name, 150, 'Emergency contact name')
      : undefined;
    const nextEmPhone = has('emergency_contact_phone')
      ? cleanOptionalText(hpIn.emergency_contact_phone, 20, 'Emergency contact phone')
      : undefined;

    // Free-text clinical fields are AES-256-GCM encrypted at rest
    // (mirrors PUT /api/profile/me).
    const encryptText = (value, label) => {
      const t = cleanOptionalText(value, 2000, label);
      return t === null ? null : encrypt(t);
    };
    const nextAllergies = has('allergies') ? encryptText(hpIn.allergies, 'Allergies') : undefined;
    const nextConditions = has('chronic_conditions') ? encryptText(hpIn.chronic_conditions, 'Chronic conditions') : undefined;

    // Lock the row and resolve "keep current" for omitted fields
    // (undefined → existing value, null → explicit clear).
    const [hpLockRows] = await connection.query(
      'SELECT * FROM HEALTH_PROFILES WHERE user_id = ? AND deleted_at IS NULL FOR UPDATE',
      [targetUserId]
    );
    const oldHp = hpLockRows[0] || null;
    const resolve = (provided, oldVal) => (provided === undefined ? (oldVal ?? null) : provided);
    const values = {
      blood_type: resolve(has('blood_type') ? nextBlood : undefined, oldHp?.blood_type),
      sex: resolve(has('sex') ? nextSex : undefined, oldHp?.sex),
      date_of_birth: resolve(has('date_of_birth') ? nextDob : undefined, oldHp?.date_of_birth),
      height: resolve(has('height') ? nextHeight : undefined, oldHp?.height),
      weight: resolve(has('weight') ? nextWeight : undefined, oldHp?.weight),
      emergency_contact_name: resolve(has('emergency_contact_name') ? nextEmName : undefined, oldHp?.emergency_contact_name),
      emergency_contact_phone: resolve(has('emergency_contact_phone') ? nextEmPhone : undefined, oldHp?.emergency_contact_phone),
      allergies: resolve(has('allergies') ? nextAllergies : undefined, oldHp?.allergies),
      chronic_conditions: resolve(has('chronic_conditions') ? nextConditions : undefined, oldHp?.chronic_conditions),
    };

    await connection.query(
      `INSERT INTO HEALTH_PROFILES
       (user_id, blood_type, allergies, chronic_conditions, emergency_contact_name,
        emergency_contact_phone, sex, date_of_birth, height, weight)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       blood_type = VALUES(blood_type),
       allergies = VALUES(allergies),
       chronic_conditions = VALUES(chronic_conditions),
       emergency_contact_name = VALUES(emergency_contact_name),
       emergency_contact_phone = VALUES(emergency_contact_phone),
       sex = VALUES(sex),
       date_of_birth = VALUES(date_of_birth),
       height = VALUES(height),
       weight = VALUES(weight),
       version = version + 1`,
      [
        targetUserId,
        values.blood_type,
        values.allergies,
        values.chronic_conditions,
        values.emergency_contact_name,
        values.emergency_contact_phone,
        values.sex,
        values.date_of_birth,
        values.height,
        values.weight,
      ]
    );

    await logAudit(connection, {
      userId: actorId,
      action: oldHp ? 'UPDATE' : 'CREATE',
      table: 'HEALTH_PROFILES',
      recordId: oldHp?.profile_id || null,
      oldValue: null,
      newValue: {
        operation,
        patient_user_id: targetUserId,
        blood_type: values.blood_type,
        sex: values.sex,
        date_of_birth: values.date_of_birth,
        height: values.height,
        weight: values.weight,
        encrypted: true,
      },
      ipAddress: ipAddress,
    });
  }
}
