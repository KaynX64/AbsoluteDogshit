# Mixed-load implementation and acceptance

The 2026-11-24 rehearsal used the same synthetic data and Windows host as the [baseline](PERFORMANCE-REVIEW.md). Each burst used a fresh 2,000-patient schema with 25,000 encrypted encounters. The paced runs used HTTPS, WSS, Redis 7.4.8 and MySQL 8.0.46. SMTP, push and object storage used local fixtures. Latency starts at HTTP send time. Send lag measures time spent waiting in the load generator before sending.

## Matched results

| Workload | Baseline | After implementation |
| --- | --- | --- |
| 8-client bursts, four runs | 164 booking failures and 98 SOS failures | 3,200 successful requests, zero failures |
| 24-client bursts, four runs | 281 booking failures and 106 SOS failures | 3,200 successful requests, zero failures |
| 24-client booking p95 | 488–619 ms | 54–57 ms |
| 24-client check-in p95 | 820–987 ms | 81–95 ms |
| 30 requests/s for 3 minutes | 5,400 successes, HTTP p95 169–186 ms by minute | 5,400 successes, HTTP p95 6.4–6.6 ms by minute |
| 60 requests/s for 4 minutes | 51.7 completions/s, HTTP p95 946–1,048 ms by minute | 60 completions/s, 14,400 successes, HTTP p95 6.3–6.7 ms by minute |
| 60 requests/s, last-minute send-lag p95 | 37.3 s | 14.2 ms |
| 60 requests/s, MySQL acquire p95 | 197 ms | 0.2 ms |

Each matched burst and each paced run persisted 200 bookings, 120 check-in tickets, 40 SOS alerts and 360 audit entries. No audit links mismatched. All 40 accepted alerts reached the responder in each stage. The oldest dashboard snapshot in the 60/s run was 3.502 seconds. Its 360 audit-head lock acquisitions averaged 0.19 ms.

In the 64-client HTTPS overload run, all 40 SOS submissions committed and reached the responder once. The API returned `503 API_BUSY` for 693 ordinary requests. Only accepted writes were persisted, with 59 audit entries for 14 bookings, five tickets and 40 alerts. SOS receipt remains separate from realtime dispatch. The latter reached 8.3 s p95 in the burst while the dispatch worker drained multiple batches.

## What changed

- Audit writes lock a singleton head row after business writes and advance it atomically with the existing ledger. Login and logout explicitly open audit transactions. Startup checks the recorded head against the ledger tail.
- Booking reads two relevant hours under transaction-local `READ COMMITTED`. Booking, check-in and keyed SOS retry only confirmed pre-commit rollbacks. Check-in releases MySQL before cache invalidation and socket events.
- A one-connection worker computes dashboard snapshots off the API event loop. The API applies live permissions and serves only snapshots at most five seconds old.
- Ordinary operations have bounded admission and eight shared MySQL connections. SOS has four reserved admission slots, a separate bounded priority queue and one reserved connection. The daily queue uses generation-checked Redis refills. Maintenance claims at most 100 rows per transaction and updates those IDs through the primary index.

## Verification and rollout

The full disposable MySQL and Redis suite passed 210 tests with no skips. These are local results with simulated external delivery. Rehearse the audit cutover and run the same benchmarks in staging before enabling load controls in production. [Migration and rollback instructions](../migrations/MIGRATION-PLAN.md).

Use the baseline report's environment setup. From `server/`, run the burst command with Redis benchmarking disabled, then enable Redis and TLS for the paced and overload commands.

```text
node --test
node scripts/benchmark.js 8,24 4
node scripts/benchmark.js 24 1 --soak 180 30
node scripts/benchmark.js 24 1 --soak 240 60
node scripts/benchmark.js 64 1
```
