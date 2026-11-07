# server/src/utils/ — shared helpers (reuse, don't reimplement)
| File | Use |
|---|---|
| secrets.js | `JWT_SECRET`, `ENCRYPTION_KEY` (validated at import) |
| cryptoVault.js | `encrypt`, `decrypt`, `isEncryptedValue` (prefix-tagged; legacy mode if no `ENCRYPTION_SALT`) |
| auditLogger.js | `logAudit(conn, {userId, action, table, recordId, oldValue, newValue, ipAddress})` |
| phiLogger.js | `logPhiAccess({...})` → PHI_ACCESS_LOGS |
| redisClient.js | `initRedis`, `isRedisActive`, `getCache`, `setCache`, `invalidateCache` |
| s3Vault.js | `uploadToS3`, `getFromS3`, `getBufferFromS3`, `deleteFromS3`, `ensureBucketExists` |
| pdfVault.js · documentService.js | PDF generation / document handling |
| signatureVault.js · signatory.js | stored signatures, signatory data |
| interactionChecker.js | drug-interaction logic |
| dentalValidator.js | dental chart validation |
| analyticsStats.js | analytics aggregation (tested) |
| passwordPolicy.js | password rules |
| mailer.js | nodemailer (SMTP_* env) |
| fcmNotifier.js | FCM push |
| reminderWorker.js | `startReminderScheduler(io)`: reminders + no-show flip |
| dbStudioGuard.js | DB-studio access guard (tested) |

Changing `cryptoVault.js` → run `node --test tests/cryptoVault.test.js tests/reencrypt.test.js`. Never alter the ciphertext format without a re-encrypt migration.
