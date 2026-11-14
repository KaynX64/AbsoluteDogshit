// Uploads a generated PDF and publishes its object key on the document record.

import crypto from 'node:crypto';
import { deleteFromS3, uploadToS3 } from '../../utils/s3Vault.js';

export async function storeDocumentPdf(prefix, id, buffer, saveKey) {
  const suffix = crypto.randomBytes(4).toString('hex');
  const key = prefix + '-' + id + '-' + suffix + '.pdf';
  await uploadToS3({ buffer, key, mimeType: 'application/pdf' });
  const [result] = await saveKey(key);
  if (!result.affectedRows) {
    await deleteFromS3(key).catch(() => console.error('[PDF] Could not remove an unpublished upload.'));
    return null;
  }
  return key;
}
