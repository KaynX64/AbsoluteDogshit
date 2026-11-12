<!-- split from README.md — part 04 of 08 -->

### Backend

`server/src/index.js` composes Express, HTTPS and Socket.IO. Startup applies versioned migrations, loads server policy, and checks Redis and MinIO before listening. The listener then starts the appointment reminder, no-show, prescription expiry, and PDF backfill jobs. SIGINT and SIGTERM drain active requests and jobs before closing shared dependencies. Redis is cache-aside with in-memory rate-limit fallbacks, and MinIO provides path-style S3 storage.

`emergency.js` on `Stage1` imports `generateAndStoreIncidentReportPDF`, `getBufferFromS3` and the responder-access helpers. Its SOS limiter increments `ratelimit:sos:<id>`, sets `X-RateLimit-Remaining` and `Retry-After`, and uses `SOS_LIMIT` from `src/config/limits.js`.

### Desktop

`desktop/electron/main.cjs` is the main process: `BrowserWindow`, TLS/certificate policy, IPC handlers, native `node:sqlite`, printing/notifications and `electron-updater`. `desktop/electron/preload.cjs` exposes a narrow `electronAPI` through `contextBridge`. The renderer in `desktop/src/` switches between `NurseConsole`, `DoctorConsole`, `AdminConsole` and `ResponderConsole`; `IncidentReportModal.tsx` and `IncidentRecords.tsx` implement the new incident workflow; `services/offlineSync.ts` prefers Electron IPC/SQLite and falls back to `localStorage`.

`desktop/AGENTS.md` flags the **build-time `app-config.json` `apiBaseUrl` gotcha**: set the API origin before building the installer, not after.

### Mobile

`mobile/lib/main.dart` initializes Flutter, Firebase/FCM (native platforms only), `EmergencyAlertService`, `ConnectivityService`, session timeout handling and the app. `mobile/AGENTS.md` flags the **hardcoded API host** in `lib/config/api_config.dart`; replace it for emulators, LAN devices and deployment. `lib/screens/` holds the large patient/responder screens that the `MB-*` slice maps describe.

### Core flows

- **Offline write:** renderer queues an `OfflineMutation` → IPC → SQLite `LOCAL_SYNC_LOGS` → replay to `/api/sync/*` when online; `/api/sync/bootstrap?lastSyncedAt=…` pre-populates the workstation cache.
- **SOS → incident:** mobile sends coordinates → `EMERGENCY_ALERTS` → FCM + Socket.IO → responder action → `INCIDENT_REPORTS` → `documentService` PDF → MinIO → `IncidentRecords` review/save/print.
- **Document verification:** PDF/signature stored in MinIO → QR points at `PUBLIC_API_BASE_URL` → public verification page → Redis nonce claimed atomically → single successful verification.

---

## 4. Data Structure

### MySQL — `server/schema.sql`

`schema.sql` is a **full drop-and-recreate script**: `CREATE DATABASE IF NOT EXISTS valetudo_healthlink`, `USE`, `SET FOREIGN_KEY_CHECKS = 0`, a list of `DROP TABLE IF EXISTS` statements, then `CREATE TABLE` statements. Character set is `utf8mb4` / `utf8mb4_unicode_ci`; the header cites R.A. 10173 compliance.

> **Count correction:** the `DROP TABLE` list on `Stage1` names **30 tables**, including the new `INCIDENT_REPORTS`. Root `AGENTS.md` still describes a **“29-table schema”** ; that line is stale and should be updated before merging.

| Domain | Tables |
| --- | --- |
| Identity & access | `USERS`, `ROLES`, `USER_ROLES`, `ADMIN_PERMISSIONS`, `USER_ADMIN_PERMISSIONS` |
| Population profiles | `STUDENT_PROFILES`, `FACULTY_PROFILES`, `NON_TEACHING_PROFILES`, `STAFF_PROFILES` |
| Health, consent, devices | `HEALTH_PROFILES`, `CONSENT_RECORDS`, `DEVICE_TOKENS` |
| Scheduling | `APPOINTMENTS`, `QUEUE` |
| EMR | `EMR_RECORDS`, `VITAL_SIGNS`, `DENTAL_CHARTS`, `EMR_ATTACHMENTS` |
| Pharmacy & inventory | `MEDICINES`, `MEDICINE_BATCHES`, `INVENTORY_LOGS`, `DRUG_INTERACTIONS`, `PRESCRIPTIONS`, `PRESCRIPTION_ITEMS` |
| Clearances | `MEDICAL_CLEARANCES` |
| Emergency | `EMERGENCY_ALERTS`, `INCIDENT_REPORTS` |
| Audit & sync | `AUDIT_LOGS`, `PHI_ACCESS_LOGS`, `LOCAL_SYNC_LOGS` |

`Stage1` schema/migration additions visible in the commit history and route imports:

- `HEALTH_PROFILES`: `sex`, `date_of_birth`, computed `bmi`; `getBmiCategory()` classifies BMI.
- `PRESCRIPTIONS`: `expires_at`, plus PDF/version/soft-delete metadata columns.
- `PRESCRIPTION_ITEMS`: `quantity_prescribed` replaces `quantity_dispensed`, with validation.
- `INCIDENT_REPORTS`: new table plus `db.js` auto-migration.
- Column drift such as `signature_metadata`, `pdf_s3_key`, `version`, `deleted_at` and `signature_s3_key` is handled by boot auto-migrations; backfills were added for the new health/prescription fields.
