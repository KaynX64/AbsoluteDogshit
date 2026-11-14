<!-- Authoritative server route guidance; see ../AGENTS.md for the index. -->

# server/src/routes/
Each API area exports a router or a factory. Feature folders compose their routes in `index.js`. Appointments, documents, admin, emergency, and inventory use factories that receive `io`.

| File | Area | Size |
|---|---|---|
| documents/index.js | EMR documents, attachments, PDFs, QR verification | |
| appointments/index.js | booking, queue, intake, consultations and patient history | |
| admin/index.js | users, roles, admin permissions, audit, Database Studio, Server Policy, presence and Terminal | |
| inventory/index.js | medicines, batches, logs | |
| emergency/index.js | SOS alerts, responder access and incident reports (Socket.IO + FCM) | |
| analytics/index.js | dashboard and exports (uses `src/analytics/analyticsStats.js`) | |
| healthPass.js | dynamic QR health pass (HMAC) | |
| profile/index.js | self-profile, clinical health profile, theme and device tokens | |
| privacy.js | consent records | |
| sync/index.js | offline bootstrap, mutation replay and status from desktop | |
| interactions.js | drug-interaction check | |
| signature.js | e-signature enroll/use | |

## Feature modules

| Area | Modules |
|---|---|
| Appointments | `booking/reads.js` for clinicians, slots and personal bookings, with `booking/create.js` and `booking/cancellation.js` for writes. `dailyQueue.js` and `consultations.js` delegate reads, transitions and encounter writes to `src/appointments/`. `queueNotifications.js` runs after the transaction releases its connection. `intake/` handles intake reads and writes, and `patientHistory.js` serves history and patient search. |
| Documents | `prescriptions/issuance.js`, `prescriptions/history.js`, and `prescriptions/cancellation.js` for issuing, reading, and cancelling prescriptions with stock restoration. `clearances.js` owns clearance issuance, history and lifecycle. `verification/public.js` serves public QR reads and `verification/details.js` applies the staff gate. `attachments.js` handles upload and token-based download. `pdfs.js` handles protected prescription, clearance and incident report PDFs. |
| Admin | `userDirectory.js` for account reads and archival, `userUpdates/` for role assignment and full account edits through `src/admin/accounts/`, and `accountCredentials.js` for credential operations. `permissions.js` and `responders.js` for grants and responder eligibility. `audit.js` for access logs and telemetry. `databaseStudio/` separates schema lookups, reads, writes and table policy behind a shared access gate. `serverPolicy.js` handles Super Admin policy read, preview and versioned save. `presence.js` lists connected sessions, and `operations.js` serves Terminal status, fixed diagnostics and supervised restart. |
| Profile | `self.js` for personal profile reads and edits, `clinicalHealth.js` for clinical health-profile routes, and `preferences.js` for theme and device tokens. Authenticated `GET`/`PUT /api/profile/theme` share the desktop/mobile account preference without requiring clinical consent. Reads return only the caller's normalized mode and preset; writes require both fields. |
| Sync | `bootstrap.js` loads legacy or paged workstation cache data via `src/sync/bootstrapReads.js`. `replay.js` calls the transaction service in `src/sync/`, and `status.js` returns sync telemetry. `POST /api/sync/replay` accepts up to 25 mutations and deduplicates by mutation ID and checks ownership before returning an existing outcome. `POST /api/sync/legacy-ownership` returns only submitted appointment IDs assigned to the authenticated doctor or dentist with a current clinical role. |
| Emergency | `sos.js` for SOS creation, rate limiting and dispatch notifications. `alerts.js` for live responder access, active alerts and status changes. `incidentReports/workflow.js` maps pending-report and filing requests. `src/emergency/fileIncidentReport.js` owns the filing transaction. `incidentReports/archive.js` handles archived reports and PDF download. |
| Analytics | `dashboard.js` and `exports.js` share `src/analytics/reportQueries.js`. The dashboard reads formulary activity and reorder priorities from `src/inventory/pharmacyAnalytics.js`. CSV, Excel, and PDF rendering lives in `src/analytics/reports/`. The entry point applies the shared analytics access gate. |
| Inventory | `overview.js` for catalog, stock views and logs. Reorder suggestions sort by usable stock, lowest first, and use recent net dispensing and prescribing to break stock ties. `receiving.js` handles deliveries, `formulary.js` catalog writes, and `stock.js` deductions and adjustments. |

