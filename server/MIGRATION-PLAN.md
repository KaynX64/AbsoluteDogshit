# Versioned migration rollout

`src/db/migrate.js` runs the numbered migrations in `src/db/migrations/`. Run `npm run migrate` from `server/` to apply pending steps before deployment. Startup uses the same runner before loading server policy and opening the listener. The existing DB-free `/api/ping` remains the liveness probe.

## Fresh and existing databases

`schema.sql` defines the current clean-install baseline. The numbered migrations preserve the upgrade history and are kept intact after deployment. Some table definitions intentionally appear in both because the upgrades also support installations that predate those tables. The MySQL rehearsal compares the upgraded foundation table definitions with a fresh install to catch drift.

- Provision a new, empty database using `schema.sql`, then run the migration command. The schema script drops and recreates tables and is reserved for fresh provisioning and disposable fixtures.
- Upgrade an existing database with the migration command. The runner checks the base tables, serializes migration sessions, and records each started and completed version in `SCHEMA_MIGRATIONS`. A failure reports the migration number and prevents the new process from listening.
- The responder and prescription-quantity steps save their backfill decisions before altering the schema. A pre-existing responder flag column is treated as already adopted so a legacy upgrade cannot overwrite an administrator's revocation. Inspect ambiguous partially upgraded installations against a known-good backup before making manual eligibility corrections.
- Migration 004 adds the appointment status and date index for queue reads. Rehearse its DDL on a staging copy with representative appointment volume.
- Migration 005 adds indexes for prescription issue dates and inventory movement dates. The pharmacy dashboard uses them for the rolling activity window.
- Migration 006 adds the View incident records permission to the catalog. Limited Admins receive archive access when a Super Admin grants it. Legacy full-access admins and explicit Super Admins continue to pass the archive gate.
- Migration 007 adds Operations, Clinical, Pharmacy, Headcount, and Export analytics permissions. Existing Limited Admins with View analytics receive Headcount once. Super Admins can grant additional analytics access in account settings. Deploy the server and desktop together because the analytics summary now returns scoped blocks.
- The clinical and pharmacy workflow refinement uses the existing grants. Surveillance and Dispensing are derived scopes. Deploy the server and desktop together for the nested summary changes. This refinement adds no migration.
- Migration 008 creates the staff analytics settings table. It leaves the table empty so nurses, doctors and dentists inherit their existing defaults. Apply migration 008 before serving analytics with the updated server.
- Migration 009 adds nullable PDF retry timestamps and pending-PDF indexes to prescriptions, clearances and incident reports. It leaves stored PDF keys intact. Allow the startup migration to finish before serving traffic with the updated server.

- Migration 010 adds the Terminal permission to the admin catalog. Existing grants carry forward. A Super Admin can opt Limited Admin accounts into diagnostics.

## Rehearsal and recovery

1. Run `node --test` from `server/`. Set `VALETUDO_MIGRATION_TEST_PORT` to the loopback port of an isolated MySQL 8 instance to include the migration rehearsals. The tests create randomly named databases and remove them on teardown. Set `VALETUDO_MIGRATION_TEST_PASSWORD` if that instance requires a root password.
2. Verify a restorable backup and run the migration command against a staging copy of the deployment. Compare grants, responder flags, prescriptions, inventory links, and the policy revision before and after. A second run should report no pending migrations.
3. During the production rollout, stop traffic and older server instances before running the migration command. If a step fails, inspect the pending ledger row and the schema changes already applied. Rehearse the forward fix or restore on a staging copy before resuming production.

The runner uses a MySQL session lock and commits data backfills together with the ledger update. Schema statements run outside that transaction because MySQL DDL can commit implicitly. [MySQL locking functions](https://dev.mysql.com/doc/refman/8.0/en/locking-functions.html) · [Statements that cause implicit commits](https://dev.mysql.com/doc/refman/8.0/en/implicit-commit.html)
