# server/src/utils/ — shared helpers (reuse, don't reimplement)
| File | Use |
|---|---|
| secrets.js | `JWT_SECRET`, `ENCRYPTION_KEY` (validated at import) |
| cryptoVault.js | `encrypt`, `decrypt`, `isEncryptedValue` (AES-256-GCM v2 envelopes with required `ENCRYPTION_SALT`) |
| auditLogger.js | `logAudit(conn, {userId, action, table, recordId, oldValue, newValue, ipAddress})` |
| phiLogger.js | `logPhiAccess({...})` → PHI_ACCESS_LOGS |
| redisClient.js | `initRedis`, `isRedisActive`, `getCache`, `setCache`, `invalidateCache` |
| s3Vault.js | `uploadToS3`, `getFromS3`, `getBufferFromS3`, `deleteFromS3`, `ensureBucketExists` |
| ../documents/documentService.js · ../documents/pdf/ | Document storage orchestration, shared PDF drawing helpers and document templates |
| ../documents/signing/ | stored signatures and signatory data |
| interactionChecker.js | drug-interaction logic |
| ../appointments/dentalValidator.js | dental chart validation shared by online completion and replay |
| ../appointments/vitals.js | shared desktop and API measurement validation and check-in note formatting |
| ../appointments/encounterText.js | required encounter text and optional blanks for online finalization and offline replay |
| ../analytics/analyticsStats.js | analytics aggregation (tested) |
| passwordPolicy.js | password rules |
| mailer.js | nodemailer (SMTP_* env) |
| fcmNotifier.js · fcmCredential.js | FCM push and scoped Google Auth JWT credential. The backend reads the configured service-account file, with simulation mode when it is absent. |
| ../appointments/noShow.js | Locks eligible appointments, skips locked rows, and commits the no-show transition. `../workers/noShowWorker.js` broadcasts after commit. |
| ../appointments/queueTickets.js | Reserves daily ticket numbers per counter inside the intake transaction. The first reservation starts after any existing tickets. |
| httpError.js | shared status-bearing errors |
| ../routes/admin/databaseStudio/tablePolicy.js | Database Studio table protections and audit masking |

After changing `cryptoVault.js`, run `node --test tests/cryptoVault.test.js` from `server/`. Never alter the ciphertext format without a re-encrypt migration.

## Vital-sign entry

`../appointments/vitals.js` is the source of truth for booked and walk-in intake, structured encounter submissions, and offline EMR replay. The desktop bundles this pure module at build time. Intake rejects malformed and above-limit edits in full and blocks submission until the field is corrected or cleared. BMI uses two validated readings and gives separate feedback for missing and invalid measurements. Leave unmeasured values blank. Record an explicit zero where the field allows it. The Doctor/Dentist encounter displays nurse-recorded readings.

| Measurement | Entry limit |
|---|---|
| Blood pressure (mmHg) | Whole numbers, systolic 1–350 and diastolic 0–300. Enter `systolic/diastolic` at intake with systolic greater than diastolic. |
| Temperature (°C) | 10–50, up to two decimal places |
| Pulse (bpm) | 0–300, whole numbers |
| SpO₂ (%) | 0–100, up to two decimal places |
| Respiration (breaths/min) | 0–170, whole numbers |
| Height (cm) and weight (kg) | Height 30–300, weight 1–500, up to two decimal places |

These limits are clinic software entry rules. The units follow HL7 FHIR. Monitor specifications inform the broad pulse, saturation, and respiration limits. Blood pressure and temperature bounds allow values beyond a typical monitor's rated range. Height and weight use the existing admin profile bounds. [HL7 FHIR vital signs](https://fhir.hl7.org/fhir/observation-vitalsigns.html) · [Philips IntelliVue X3 specifications](https://images.philips.com/is/content/PhilipsConsumer/Campaigns/HC20182709_surgery_solutions/TDS_IntelliVue_X3_Patient_Monitor_RelM0indd.pdf) · [Severe accidental hypothermia case](https://academic.oup.com/ejcts/article-pdf/58/5/1091/36283106/ezaa159.pdf) · [Severe heatstroke case](https://pubmed.ncbi.nlm.nih.gov/7073052/)
