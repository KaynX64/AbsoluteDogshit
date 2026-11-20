import { decrypt } from '../../utils/cryptoVault.js';
import { hash, fail, today } from './structuredContract.js';

export function isPrescriptionExpired(row, now = new Date()) {
  if (row.status === 'cancelled') return false;
  if (row.status === 'expired') return true;
  if (!row.expires_at) return false;
  if (Number(row.contract_version) !== 2) return new Date(row.expires_at) < now;
  const value = row.expires_at;
  const date = value instanceof Date ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}` : String(value).slice(0, 10);
  return date < today(now);
}

export function readSnapshot(row) {
  if (Number(row.contract_version) !== 2) return null;
  try {
    const snapshot = JSON.parse(decrypt(row.clinical_snapshot));
    const metadata = typeof row.signature_metadata === 'string' ? JSON.parse(row.signature_metadata) : row.signature_metadata;
    if (!metadata || metadata.hash_scope !== 'prescription_payload_v2' || hash(snapshot) !== metadata.document_sha256) throw Error();
    return snapshot;
  } catch {
    // JSON parser diagnostics can include clinical text; expose only the category.
    throw fail('Recorded prescription content failed its integrity check.', 'PRESCRIPTION_INTEGRITY_ERROR', 409);
  }
}

export function hydratePrescription(row) {
  const snapshot = readSnapshot(row);
  const { clinical_snapshot, ...publicRow } = row;
  if (!snapshot) return publicRow;
  return { ...publicRow, contract_version: 2, notes: snapshot.notes, items: snapshot.items,
    issued_at: snapshot.issued_at, expires_at: snapshot.expires_at,
    status: isPrescriptionExpired({ ...publicRow, expires_at: snapshot.expires_at }) ? 'expired' : publicRow.status,
    patient_snapshot: snapshot.patient, prescriber_snapshot: {
      first_name: snapshot.doctor.first_name, last_name: snapshot.doctor.last_name,
      role: snapshot.doctor.role, license_no: snapshot.doctor.license_no,
    }, doctor_first_name: snapshot.doctor.first_name, doctor_last_name: snapshot.doctor.last_name,
    doctor_license: snapshot.doctor.license_no };
}
