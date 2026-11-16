<!-- split from README.md — part 04 of 08 -->

### Backend

`server/src/index.js` composes Express, HTTPS and Socket.IO. Startup applies versioned migrations, loads server policy, and checks Redis and MinIO before listening. The listener then starts the appointment reminder, no-show, prescription expiry, and PDF backfill jobs. SIGINT and SIGTERM drain active requests and jobs before closing shared dependencies. Redis is cache-aside with in-memory rate-limit fallbacks, and MinIO provides path-style S3 storage.

`server/src/routes/emergency/sos.js` owns SOS creation and dispatch. The responder access service resolves the current audience, and device delivery selects the Android notification channel or retains the legacy path. [Server route map](../server/src/routes/AGENTS.md)

### Desktop

`desktop/electron/main.cjs` composes the window, certificate policy, updater and IPC registration. The preload exposes `window.electronAPI` through `contextBridge`. The renderer starts loading the shared staff console bundle while sign-in is idle and waits for it before opening the staff workspace. `src/platform/offline/` coordinates the encrypted cache and mutation queue through Electron IPC. Rebuild the renderer after editing `app-config.json` to retarget packaged REST and Socket.IO requests. [Desktop architecture guide](../desktop/AGENTS.md)

### Mobile

`mobile/lib/main.dart` renders the app before starting Firebase, Android notification setup and connectivity monitoring. An authenticated alert session handles responder eligibility, realtime delivery and incident refresh after sign-in or saved-session validation. Set the source-configured API host for the device or emulator. [Mobile setup](../mobile/README.md#configure-and-run)

### Core flows

- **Offline write:** renderer queues an `OfflineMutation` → IPC → SQLite `LOCAL_SYNC_LOGS` → replay to `/api/sync/*` when online. Updated desktops page through `/api/sync/bootstrap?paging=1` and advance their checkpoint after SQLite saves every page.
- **SOS → incident:** mobile sends coordinates → `EMERGENCY_ALERTS` → FCM + Socket.IO → responder action → `INCIDENT_REPORTS` → `documentService` PDF → MinIO → `IncidentRecords` review/save/print.
- **Document verification:** PDF/signature stored in MinIO → QR points at `PUBLIC_API_BASE_URL` → rate-limited public document verification. The separate health pass uses a single-use nonce claimed in Redis when available.

---

## 4. Data Structure

### MySQL — `server/schema.sql`

`schema.sql` is a **full drop-and-recreate script**: `CREATE DATABASE IF NOT EXISTS valetudo_healthlink`, `USE`, `SET FOREIGN_KEY_CHECKS = 0`, a list of `DROP TABLE IF EXISTS` statements, then `CREATE TABLE` statements. The database uses `utf8mb4` / `utf8mb4_unicode_ci`.

The baseline defines 33 tables. The migration runner creates `SCHEMA_MIGRATIONS` separately. Use the versioned migration command for existing databases. [Migration rollout](../server/MIGRATION-PLAN.md)

| Domain | Tables |
| --- | --- |
| Identity & access | `USERS`, `ROLES`, `USER_ROLES`, `ADMIN_PERMISSIONS`, `USER_ADMIN_PERMISSIONS`, `STAFF_ANALYTICS_PERMISSIONS` |
| Population profiles | `STUDENT_PROFILES`, `FACULTY_PROFILES`, `NON_TEACHING_PROFILES`, `STAFF_PROFILES` |
| Health, consent, devices | `HEALTH_PROFILES`, `CONSENT_RECORDS`, `DEVICE_TOKENS` |
| Scheduling | `APPOINTMENTS`, `QUEUE`, `QUEUE_TICKET_COUNTERS` |
| EMR | `EMR_RECORDS`, `VITAL_SIGNS`, `DENTAL_CHARTS`, `EMR_ATTACHMENTS` |
| Pharmacy & inventory | `MEDICINES`, `MEDICINE_BATCHES`, `INVENTORY_LOGS`, `DRUG_INTERACTIONS`, `PRESCRIPTIONS`, `PRESCRIPTION_ITEMS` |
| Clearances | `MEDICAL_CLEARANCES` |
| Emergency | `EMERGENCY_ALERTS`, `INCIDENT_REPORTS` |
| Audit & sync | `AUDIT_LOGS`, `PHI_ACCESS_LOGS`, `LOCAL_SYNC_LOGS` |
| Operational policy | `SERVER_POLICY` |
