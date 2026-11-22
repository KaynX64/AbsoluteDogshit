# Server structure review

The implementation now separates route composition, domain transactions, and post-commit work. The earlier structure review led to the changes below. Use the linked modules and tests for current behavior.

## Implemented changes

| Area | Current ownership | Verification |
|---|---|---|
| Queue writes and encounter completion | [Appointment transitions](src/appointments/transitions.js) and [encounter completion](src/appointments/completeEncounter.js) serve online and replay handlers. HTTP queue updates release the transaction connection before running [notification lookups](src/routes/appointments/queueNotifications.js). | [MySQL concurrency tests](tests/serverConcurrency.test.js) cover a single-connection pool and simultaneous online and offline completion. |
| Admin account lifecycle | [Role changes](src/admin/accounts/roleChanges.js) and [full account updates](src/admin/accounts/updateAccount.js) share role rules. Role and health profiles have focused persistence helpers in the same directory. | The concurrency tests cover mixed-role admins, clinical license validation and rollback on invalid profile data. |
| Queue reads | [Queue reads](src/appointments/queueReads.js) owns roster, arrivals and tickets. The roster selects the latest live EMR and prescription. [Migration 004](src/db/migrations/004-appointment-day-index.js) adds the status and date index. | A disposable MySQL fixture showed a change from a full scan to an index range scan for the no-show query. Production query time depends on deployment data. |
| Offline bootstrap | [Bootstrap reads](src/sync/bootstrapReads.js) owns paged roster and EMR queries and the legacy response. The [desktop sync module](../desktop/src/platform/offline/offlineSync.ts) advances the checkpoint after all pages are saved. | The concurrency and [desktop tests](../desktop/tests/offlineBootstrap.test.mjs) cover pagination boundaries and incomplete writes. |
| Analytics | [Report queries](src/analytics/reportQueries.js) share aggregation across the dashboard and exports. Scope resolution, summary assembly and rendering have separate owners. | The [mounted API tests](tests/appRoutes.test.js) check summary and report scope. The concurrency tests compare report and dashboard totals. |
| Incident filing and PDF recovery | [Incident filing](src/emergency/fileIncidentReport.js) owns the transaction. The route publishes events and generates the PDF after commit. [PDF recovery](src/documents/pdfRecovery.js) uses a database-scoped lock, processes up to 20 pending rows per document type in ascending ID order, and defers failures. | The concurrency tests cover duplicate incident filing and recovery lock contention. [Recovery unit tests](tests/pdfRecovery.test.js) cover retry scheduling and isolation after a failure. |

## Replay storage

The [server replay ledger](src/sync/replayService.js) retains mutation outcomes. [Migration 011](src/db/migrations/011-replay-outcomes.js) removes legacy payloads and free-form errors. The [desktop storage upgrade](../desktop/README.md#offline-storage) encrypts the cache and preserves pending work from the SQLite queue and the renderer mirror.

## Open follow-up

- Cold diagnosis aggregation still accumulates distinct labels before truncating its output. Measure memory during [aggregation](src/analytics/analyticsStats.js) and report rendering with representative volumes before changing the format or caching strategy.

Use the existing feature directories for related code. Keep transaction ownership with the workflow and pass its connection to participating queries. Use the mounted API tests for route contracts and disposable MySQL for transaction, locking and query-plan checks.
