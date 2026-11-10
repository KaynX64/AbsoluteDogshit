# server/src/routes/
One file per `/api/<name>` area. Exports: `appointments emergency inventory documents` → factory `(io)`; rest → `Router`.

| File | Area | Size |
|---|---|---|
| documents.js | EMR docs, attachments, PDFs, QR verify, S3 | ~1.8k lines |
| appointments.js | booking, queue, no-show, rules | ~1.6k |
| admin.js | users, roles, admin permissions | ~1.3k |
| serverPolicy.js | Super Admin policy read, impact preview and versioned save under `/api/admin/server-policy` | |
| inventory.js | medicines, batches, logs | |
| emergency.js | SOS alerts, responders (Socket.IO + FCM); incident reports (~700 lines — status PATCH L314, pending L444, report GET/POST L492/L575) | |
| analytics.js | stats/export (uses `utils/analyticsStats.js`) | |
| healthPass.js | dynamic QR health pass (HMAC) | |
| profile.js | user/health profile | |
| privacy.js | consent records | |
| sync.js | offline mutation sync from desktop | |
| interactions.js | drug-interaction check | |
| signature.js | e-signature enroll/use | |

## Workflow
- Locate: `grep -n "router\.\(get\|post\|put\|patch\|delete\)" routes/<file>.js` → read only that handler.
- Don't open `documents.js` / `appointments.js` / `admin.js` whole.

## Handler checklist
1. Auth (`authenticateToken` — check file top for `router.use` vs per-route) + `requireRoles(...)`.
2. Patient data → `requirePrivacyConsent`; reads → `logPhiAccess`; writes → `logAudit` (inside the transaction).
3. PHI columns → `encrypt`/`decrypt`.
4. Validate input; `?` placeholders only; return `{ error }` + proper status.
5. Realtime/notify: `io.to('responders').emit(...)`, FCM via `utils/fcmNotifier.js`.
6. Cache via `getCache/setCache/invalidateCache` (Redis, TTL 120s default) — invalidate on writes.
