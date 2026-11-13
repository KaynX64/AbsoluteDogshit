<!-- split from README.md — part 02 of 08 -->

## 1. Tech Stack

| Layer | Technologies |
| --- | --- |
| **Backend** | Node.js ESM, **Express 5**, **Socket.IO 4**, `mysql2` promise pool, `ioredis`/`redis`, AWS SDK S3 client for MinIO, `jsonwebtoken`, `bcryptjs`, `multer`, `pdfkit`, `exceljs`, `qrcode`, `nodemailer`, `firebase-admin`, `cors`, `dotenv`, `nodemon` |
| **Desktop** | **Electron 44**, **React 19**, **TypeScript**, **Vite 6**, `electron-builder` (Windows NSIS x64), `electron-updater`, `socket.io-client`, `jsqr`, `signature_pad`, built-in `node:sqlite`, ESLint. `vite.config.mts` is present on `Stage1`. |
| **Mobile** | **Flutter** stable channel, **Dart ≥ 3.13**; `http`, `flutter_secure_storage`, `qr_flutter`, `geolocator`, `socket_io_client`, `url_launcher`, `firebase_core`, `firebase_messaging`. Android is the primary target; other platform targets are recorded in `mobile/.metadata`. |
| **Infrastructure** | **Docker Compose**: MySQL 8 on `127.0.0.1:3307`, Redis 7 on `127.0.0.1:6379`, MinIO API/console on `127.0.0.1:9000`/`9001`; named volumes `mysql_data` and `minio_data`. All three are loopback-bound. |
| **Docs / QA tooling** | `AGENTS.md` instruction pack, `CODESLICE.md` line-range maps, **Python 3** `scripts/verify_codeslice.py`, Postman collections, Node test files under `server/tests/` |

| Path | Role | Port |
| --- | --- | --- |
| `server/` | REST + WSS API; all business logic; sole DB owner | `5000` (HTTPS) |
| `desktop/` | Clinic-staff console; Windows NSIS executable | `5173` (Vite dev only) |
| `mobile/` | Patient and emergency-responder app | — |
| `docker-compose.yml` | Local MySQL / Redis / MinIO infrastructure | `3307`, `6379`, `9000–9001` |
| `server/schema.sql` | MySQL DDL, source of truth | — |

---

## 2. Features

### Clinical and administrative workflows

- Scheduling with clinic-hour rules, 15-minute slots, lunch exclusion, capacity-limited shared-hour doctor bookings, exclusive-hour dentist bookings and recovery buffers.
- EMR records, vital signs, dental charts, EMR attachments, medical clearances, queueing, analytics and Excel export.
- E-prescriptions with FEFO batch deduction, outside-formulary free-text items, drug-interaction warnings, prescription expiry, prescribed-quantity validation, signature enrollment, PDF generation and versioned/soft-deleted documents.
- Medicine batches and inventory logs, with **expired / low stock / expiring soon** states and a dashboard summary consumed by `NurseConsole.tsx`.
- Admin user/role management with safety checks and granular permissions; admin health-profile editor encrypts/decrypts sensitive fields.
- Dynamic QR Health Pass with a dedicated HMAC secret, short validity, Redis single-use nonce claiming, and a public QR verification page.
- Offline-first desktop operation: embedded SQLite mutation queue, replay on reconnect, local EMR/patient cache and a `localStorage` fallback.
- Background reminders over SMTP, FCM and Socket.IO.
