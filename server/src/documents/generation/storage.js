import crypto from 'node:crypto';
import { uploadToS3 } from '../../utils/s3Vault.js';

export async function storeDocumentPdf(prefix, id, buffer, saveKey) {
  const suffix = crypto.randomBytes(4).toString('hex');
  const key = prefix + '-' + id + '-' + suffix + '.pdf';
  await uploadToS3({ buffer, key, mimeType: 'application/pdf' });
  await saveKey(key);
  return key;
}
