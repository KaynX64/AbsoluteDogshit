# Server structure review

Queue writes, admin role changes, queue reads, paged bootstrap, analytics exports, and incident filing now have dedicated modules. Migration 004 adds the appointment day index. In the disposable MySQL fixture, the no-show count changed from a full table scan to an index range scan. Production query time depends on deployment data.

The Express route folders make the API entry points easy to find. Bootstrap, worker scheduling, Database Studio, offline replay, and document generation already have distinct owners. The next refactor should give shared business operations a single owner and address the query costs exposed by those workflows.

## Implementation order

0. **Verify the current refactor as a baseline.** The implementation started from a clean working tree and the baseline backend suite passed. When committing a refactor, include moved modules and their updated imports together.
1. **Queue transitions and encounter completion.** [Daily queue](src/routes/appointments/dailyQueue.js#L209) and [consultation status](src/routes/appointments/consultations.js#L14) retain their transaction connections while waiting on a second pool query after commit. A burst can exhaust the pool with requests waiting for connections they already hold. Release the connection before notification lookups. Extract shared transition rules under `src/appointments/` for the HTTP and [offline mutation](src/sync/appointmentMutations.js) entry points. Use one lock order for appointment and queue rows. [Online completion](src/routes/appointments/consultations.js#L94) and [offline EMR creation](src/sync/encounterMutations.js#L17) also duplicate encounter writes. Share the transaction work and preserve each caller's audit and response contract. Cover concurrent completion, invalid transitions, and pool release order with tests.
2. **Admin account lifecycle.** The [full profile edit](src/routes/admin/userUpdates/profile.js#L81) and [role-only endpoint](src/routes/admin/userUpdates/roles.js#L21) both replace roles and clear grants. Full edits use the existing ADMIN-first role lookup and clean stale role profiles. The role-only path reads the first role row and has separate license checks. Consolidate the transition and grant logic under an admin accounts module, with role-profile persistence and health-profile persistence in focused helpers. Cover mixed-role targets, clinical license validation, and rollback before routing both endpoints through the shared operation.
3. **Queue reads.** Extract roster, arrivals, and ticket reads from [daily queue routes](src/routes/appointments/dailyQueue.js). The roster joins prescriptions through the EMR, so an encounter with multiple prescriptions can produce multiple copies of an appointment and repeat decryption. Define which prescription notes the roster should show and test one row per appointment. Replace the column-side `DATE(date_time)` predicates in arrivals and no-show counts with equivalent range boundaries. Preserve the arrivals endpoint's inclusion of earlier scheduled bookings. Use MySQL execution plans and representative data before adding an index.
4. **Offline cache reads.** Move [bootstrap queries](src/routes/sync/bootstrap.js#L25) into `src/sync/`. The patient roster and EMR queries cap results at 500, while the desktop [advances its saved timestamp](../desktop/src/services/offlineSync.ts#L235) after a single response. A larger EMR delta can leave records behind, and the roster has no paging. Add stable cursors and a server-issued upper watermark. The desktop should advance its checkpoint after all pages are written to SQLite. Test more than 500 records and changes arriving between pages.
5. **Analytics report queries.** [CSV, Excel, and PDF exports](src/routes/analytics/exports.js) repeat department aggregation. The [dashboard](src/routes/analytics/dashboard.js#L99) runs related queries with its own output rules. Share queries in `src/analytics/`, then keep formatting in format-specific renderers. Preserve each report's limits, inventory filters, and output shape. Profile database time and render memory before introducing broader caching or streaming.

## Follow-up

**Incident report filing.** The [incident workflow](src/routes/emergency/incidentReports/workflow.js#L147) owns responder checks, filing and audit writes, then releases its database connection before notifying responders and generating the PDF. Extract filing into `src/emergency/` as a second pass. Preserve duplicate-report handling, responder access, and the post-commit order. This has lower urgency than the queue pool fix.

[PDF backfill](src/workers/documentPdfBackfillWorker.js#L8) always selects the newest 20 missing documents per type. Repeated failures can keep older records out of the batch. Put retry scheduling and document claims at the generation boundary so downloads and workers can coordinate. Retain the existing per-document generators and rendering templates.

## Scope for structural cleanup

- Use the existing feature folders. Add a domain query module when queries are shared or the caller needs a clear transaction boundary. Keep transaction ownership in the workflow, with query functions accepting its connection.
- Move feature-specific helpers as their callers change. For example, move dental chart validation alongside encounter logic and Database Studio policy alongside its routes. First move the generic `fail` helper or replace its uses so account routes stay independent of Database Studio.
- Treat route composition and test folders as optional cleanup. `app.js` already exposes separate app construction and API mounting functions. Feature tests can move into domain folders as coverage grows, with the mounted API and cross-feature concurrency suites kept together.
- The zero-byte `server/valetudo_healthlink` file and its README tree entry were removed after checking deployment scripts. The [migration guide](MIGRATION-PLAN.md) describes the clean-install schema and the numbered upgrades.

## Implementation checkpoints

| Change | How to verify it |
|---|---|
| Queue connection fix | Use a small MySQL pool and concurrent status requests. Confirm the transaction connection is released before the notification lookup, requests finish, and each committed change produces the expected refresh events. Land this fix before extracting shared transitions. |
| Shared transitions and encounter writes | Keep each entry point's authorization and response mapping. Have online completion and offline replay call the same write operation with their current transaction. Test simultaneous completion, rollback, and both appointment and queue state. |
| Admin account lifecycle | Exercise both update routes against the same role-transition cases. Confirm administrator detection across multiple roles, clinical license handling, and rollback of profile and grant changes as a unit. |
| Queue read queries | Check one roster entry per appointment with multiple prescriptions. Cover midnight boundaries and older scheduled arrivals. Compare MySQL execution plans and query time on representative fixtures. |
| Offline bootstrap | Add paging as an opt-in protocol for updated desktops. Verify batches beyond 500 rows, equal timestamps, changes during paging, and an interrupted SQLite write. Advance the checkpoint only after every page is saved. |
| Analytics and incident reports | Compare report totals and format-specific limits against fixtures. Test duplicate incident filing and confirm notification and PDF work happens after commit and connection release. |

Keep each change independently reviewable. Use the mounted API tests for route contracts and disposable MySQL for lock behavior, transaction rollback, and query plans.

The verification suite exercises mounted HTTP routes and disposable MySQL. The desktop paging tests exercise the checkpoint decision with simulated SQLite outcomes, and the desktop build verifies the renderer integration.
