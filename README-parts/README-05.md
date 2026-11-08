<!-- split from README.md — part 05 of 08 -->

### Encryption, cache and object keys

- PHI is encrypted through `server/src/utils/cryptoVault.js` (AES-256-GCM in the documented implementation) and decrypted only on authorized reads. Back up `ENCRYPTION_KEY` **and** `ENCRYPTION_SALT` together; losing either makes stored PHI unrecoverable.
- Redis keys include `token:blacklist:<jti>`, `ratelimit:login:<ip>`, `ratelimit:sos:<user-or-ip>`, `ratelimit:booking:<user-or-ip>`, `qr:nonce:<nonce>` and cache-aside JSON entries with a 120-second default TTL. QR nonces use `SET NX EX` for single-use semantics.
- MinIO bucket: `valetudo-attachments` (`S3_BUCKET`). PDF/signature/incident-report object keys are stored in columns such as `pdf_s3_key` and `signature_s3_key`.
- Electron SQLite: `userData/valetudo_data/valetudo_offline.db`, with `LOCAL_SYNC_LOGS(sync_id, client_mutation_id UNIQUE, user_id, device_id, table_name, record_id, record_uuid, action, payload, local_version, sync_status, error_message, created_at, synced_at)` plus local cache tables.
- Renderer type: `OfflineMutation { client_mutation_id, table_name, record_uuid, action: CREATE|UPDATE|DELETE, payload, created_at, user_id?, device_id?, local_version? }`.

---
