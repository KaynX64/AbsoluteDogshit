// Issues and revokes medical clearances and coordinates post-commit PDF generation.

import crypto from 'node:crypto';
import { inTransaction } from '../db/transaction.js';
import { logAudit } from '../utils/auditLogger.js';
import { fail } from '../utils/httpError.js';
import { generateAndStoreClearancePDF } from './documentService.js';
import {
  assertValidSigner,
  assertSignatureEnrolled,
  assertValidPatient,
  assertAppointmentInQueue,
  resolveExpiryDate,
} from './signing/signatory.js';

export async function issueClearance({ user_id, appointment_id, purpose, remarks, expires_at, issuerId, ipAddress }) {
  const issued = await inTransaction(async connection => {
    // Re-verify signer, recipient and expiry against the database
    const signer = await assertValidSigner(connection, issuerId);
    const sg = await assertSignatureEnrolled(connection, issuerId);
    await assertValidPatient(connection, user_id, issuerId);
    await assertAppointmentInQueue(connection, appointment_id, user_id, issuerId);
    const expDate = resolveExpiryDate(expires_at);

    const clearanceUuid = crypto.randomUUID();
    const token = `CLR.${clearanceUuid}.${Date.now()}`;

    const signatureMetadata = {
      signer_user_id: issuerId,
      signer_role: signer.role,
      signer_license_no: signer.license_no,
      signed_at: new Date().toISOString(),
      algorithm: 'SHA-256',
      document_sha256: crypto.createHash('sha256').update(`${user_id}:${purpose}:${token}`).digest('hex'),
      clinical_remarks: remarks,
      signature_s3_key: sg?.signature_s3_key || null,
      signature_sha256: sg?.signature_sha256 || null,
    };

    const [insertResult] = await connection.query(
      `INSERT INTO MEDICAL_CLEARANCES
       (user_id, purpose, status, issued_by, expires_at, qr_token, signature_metadata)
       VALUES (?, ?, 'approved', ?, ?, ?, ?)`,
      [user_id, purpose, issuerId, expDate, token, JSON.stringify(signatureMetadata)]
    );

    const clearanceId = insertResult.insertId;

    await logAudit(connection, {
      userId: issuerId,
      action: 'CREATE',
      table: 'MEDICAL_CLEARANCES',
      recordId: clearanceId,
      oldValue: null,
      newValue: { user_id, purpose, expires_at: expDate, token },
      ipAddress,
    });

    await logAudit(connection, {
      userId: issuerId,
      action: 'SIGN',
      table: 'MEDICAL_CLEARANCES',
      recordId: clearanceId,
      oldValue: null,
      newValue: {
        document_sha256: signatureMetadata.document_sha256,
        signer_role: signatureMetadata.signer_role,
        qr_token: token,
        algorithm: signatureMetadata.algorithm,
      },
      ipAddress,
    });

    return {
      message: 'Medical clearance issued successfully.',
      clearanceId,
      qrToken: token,
      signer: signer.display,
    };
  });
  const pdfKey = await generateAndStoreClearancePDF(issued.clearanceId);
  return { ...issued, pdfAvailable: Boolean(pdfKey) };
}

export function revokeClearance({ clearanceId, reason, user, ipAddress }) {
  return inTransaction(async connection => {
    const [rows] = await connection.query(
      'SELECT status, signature_metadata FROM MEDICAL_CLEARANCES WHERE clearance_id = ? AND deleted_at IS NULL FOR UPDATE',
      [clearanceId]
    );

    if (rows.length === 0) {
      throw fail('Clearance not found.', 404);
    }

    const clearance = rows[0];

    if (clearance.status === 'revoked') {
      throw Object.assign(fail('Clearance is already revoked.', 409), { code: 'ALREADY_REVOKED' });
    }

    if (clearance.status === 'expired') {
      throw Object.assign(fail('Cannot revoke an already-expired clearance.', 409), { code: 'ALREADY_EXPIRED' });
    }

    const revokedAt = new Date().toISOString();
    const revocationPatch = {
      revoked_at: revokedAt,
      revoked_by: user.user_id,
      revoked_by_role: user.roles[0],
      revocation_reason: reason || 'Revoked by clinical staff',
    };

    const existingMetadata =
      typeof clearance.signature_metadata === 'string'
        ? JSON.parse(clearance.signature_metadata)
        : clearance.signature_metadata || {};

    const mergedMetadata = { ...existingMetadata, ...revocationPatch };

    await connection.query(
      `UPDATE MEDICAL_CLEARANCES SET status = 'revoked', signature_metadata = ? WHERE clearance_id = ?`,
      [JSON.stringify(mergedMetadata), clearanceId]
    );

    await logAudit(connection, {
      userId: user.user_id,
      action: 'REVOKE',
      table: 'MEDICAL_CLEARANCES',
      recordId: clearanceId,
      oldValue: { status: clearance.status },
      newValue: {
        status: 'revoked',
        reason: reason || 'Revoked by clinical staff',
        revoked_by_role: user.roles[0],
        revoked_at: revokedAt,
      },
      ipAddress,
    });
    return { message: 'Medical clearance revoked successfully.', clearanceId, status: 'revoked', revokedAt };
  });
}
