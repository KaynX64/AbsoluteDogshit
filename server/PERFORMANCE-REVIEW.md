# Backend performance and stability review

This report records the baseline. The [matched implementation results](MIXED-LOAD-RESULTS.md) cover the changes and staging rehearsal commands.

**Priority order**

1. Fix deadlocks in audited writes. Keep the business write and audit append atomic, replace the locking audit-tail scan with a stable row for chain state, and bound retries after confirmed rollbacks.
2. Make SOS delivery retry temporary failures per device. Persist push and realtime progress separately so push retries do not rebroadcast an alert.
3. Reuse the open transaction connection for admin permission reads. Bound database wait queues, and apply scheduled maintenance in small batches targeted by primary key.
4. Replace wildcard invalidation for the current queue cache key, coalesce surveillance work, and claim each missing PDF before rendering it.

## Mixed load

The 2026-11-23 runs used Windows 11, Node 24.21.0 and MySQL 8.0.46 on a Ryzen 7 5700X with 32 GiB RAM. Each 800-request burst used 2,000 synthetic patients and 25,000 encrypted encounters. The mix covered queues, paged history, booking across four practitioners, check-in, analytics and keyed SOS. Each concurrency ran four times over loopback HTTP with Redis offline, simulated SMTP and Firebase, and in-memory S3.

| Concurrent clients | Requests/s | Booking p95 | Check-in p95 | MySQL acquire p95 | Failed bookings | Failed SOS submissions |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 45–51 | 4–8 ms | 5–10 ms | 0.1 ms | 0/800 | 0/160 |
| 8 | 51–60 | 312–368 ms | 350–523 ms | 0.2 ms | 164/800 | 98/160 |
| 24 | 53–60 | 488–619 ms | 820–987 ms | 170–317 ms | 281/800 | 106/160 |

Throughput includes failures and latency covers successes. MySQL logged deadlocks for all 445 failed bookings and 204 failed SOS submissions, including a cycle between the audit-tail read and insert. All 276 accepted alerts arrived once, with request-to-WebSocket p95 of 4.61–5.98 s. All 1,440 check-ins persisted queue tickets and no stored audit links mismatched. [Audit](src/utils/auditLogger.js) · [Booking](src/routes/appointments/booking/create.js) · [SOS](src/emergency/sosDispatch.js).

### Sustained traffic with Redis and TLS

Both paced runs used HTTPS, WSS, Redis 7.4.8 and up to 24 in-flight requests. Each distributed 360 writes and SOS submissions across the run and filled other slots with reads.

| Offered rate | Requests | Delivered rate | HTTP p95 by minute | MySQL acquire p95 | Last-minute send lag p95 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 30/s | 5,400 | 30/s | 169–186 ms | 0.3 ms | 14 ms |
| 60/s | 14,400 | 51.7/s | 946–1,048 ms | 197 ms | 37.3 s |

Every paced request succeeded and all 80 accepted SOS alerts arrived once. At 60/s, the four-minute plan took 278 s and 49,570 of 49,956 MySQL acquisitions queued. HTTP latency starts at send time. Send lag captures the backlog before that point. API RSS peaked at 421 MiB and ended the 60/s run at 274 MiB. [Load harness](scripts/benchmark.js).

## Controlled tests

| Area | Result |
| --- | --- |
| Admin pool | Archiving an admin and changing an admin’s responder flag each waited through the 500 ms observation on a one-connection pool. The permission check queued behind its own transaction. Both completed after adding a connection. [Permissions](src/admin/accounts/permissions.js) |
| Maintenance | At 100, 5,000 and 20,000 due rows, the latest unlocked pass took 3, 102 and 331 ms for no-show and 5, 110 and 378 ms for expiry. With one row locked, both jobs scanned the primary index, timed out and committed zero rows. A trial forced a primary-key range and updated the other 99 rows in under 1.4 ms before rollback. Both jobs caught up after release. [No-show](src/appointments/noShow.js) · [Expiry](src/documents/prescriptions/expirePrescriptions.js) |
| Redis invalidation | At about 10,000 keys, wildcard p95 was 19–20 ms versus 0.18–0.19 ms for exact deletion. At about 100,000 keys it was 182 ms versus 0.17–0.18 ms, using 996–997 `SCAN` calls per invalidation. Each method ran 30 times per size. [Cache helper](src/utils/redisClient.js) |
| Firebase | A partial response dropped a temporary per-device error without a retry. Invalid-token cleanup worked. A thrown error retried and emitted the same alert to the responder room twice. A 250 ms provider delay blocked the next alert’s realtime dispatch. [FCM](src/utils/fcmNotifier.js) · [Dispatch](src/emergency/sosDispatch.js) |
| Reminders | A concurrent worker skipped the claimed batch. The 50-attempt pass took 1.45–1.54 s with simulated 20 ms SMTP responses. A failed email retried after the cursor wrapped. The worker persisted 51 reminders in 52 attempts. [Reminder worker](src/workers/appointmentReminderWorker.js) |
| PDFs | With local RustFS 1.0.6, 16 simultaneous downloads uploaded 16 objects and deleted 15. P95 was 277–281 ms cold and 38 ms warm. An injected upload failure returned 503. Backfill deferred it and recovered the PDF on the next eligible pass. [Downloads](src/routes/documents/pdfs.js) · [Recovery](src/documents/pdfRecovery.js) |
| Analytics | The 16-request summary p95 was 3.49–4.09 s cold and 2.46–3.32 s with warm diagnosis and risk caches. In a separate 4,001-row surveillance test, median MySQL time was 4.8 ms and median post-query work was 172 ms, including decryption and aggregation. [Summary](src/analytics/summary.js) |

## Verification and reproduction

All 201 backend tests passed with no skips. Native Windows MySQL failed migration preflight with `lower_case_table_names=1` because lowercase metadata was compared against uppercase keys. A fresh `lower_case_table_names=2` instance passed startup. [Preflight](src/db/migrate.js) · [MySQL case settings](https://dev.mysql.com/doc/refman/8.0/en/identifier-case-sensitivity.html).

These local workloads measured the application before the mixed-load changes. SMTP and Firebase used injected responses, and S3 compatibility was tested with RustFS. Production capacity and device delivery are outside these measurements.

Install desktop and server dependencies. Set `VALETUDO_MIGRATION_TEST_PORT` and `VALETUDO_MIGRATION_TEST_PASSWORD` for disposable loopback MySQL. Use the `VALETUDO_BENCHMARK_REDIS_*` and `VALETUDO_BENCHMARK_S3_*` variables defined in the harnesses for Redis and S3. For HTTPS set `VALETUDO_BENCHMARK_TLS_KEY`, `VALETUDO_BENCHMARK_TLS_CERT` and `NODE_EXTRA_CA_CERTS`. Run each command from `server/` against isolated fixtures.

```text
node --test
node scripts/benchmark.js 1,8,24 2
node scripts/benchmark.js 24 1 --soak 180 30
node scripts/benchmark.js 24 1 --soak 240 60
node --experimental-test-module-mocks scripts/benchmark-operations.js
```
