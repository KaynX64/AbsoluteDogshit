<!-- split from README.md — part 07 of 08 -->

### Prerequisites

- Node.js **22+** (Electron main process uses built-in `node:sqlite`) and npm
- Docker + Docker Compose
- Flutter SDK, stable channel, Dart ≥ 3.13
- Python 3 for `scripts/verify_codeslice.py`
- Optional: MySQL client, Postman, Firebase project credentials

### 1. Start infrastructure

```bash
git clone https://github.com/KaynX64/AbsoluteDogshit.git
cd AbsoluteDogshit
git checkout Stage1
docker compose up -d
```

Compose binds MySQL to `127.0.0.1:3307`, Redis to `127.0.0.1:6379` and MinIO to `127.0.0.1:9000`/`9001`. Only the API on port `5000` should be exposed to client devices.

### 2. Configure and run the API

```bash
cd server
npm install
cp .env.example .env
# edit .env — see §7
npm run dev        # or: npm start
```

- The API serves HTTPS on `PORT` (default `5000`); clients use `https://<host>:5000/api/...` and Socket.IO/WSS on the same port.
- Make `DB_USER`/`DB_PASSWORD` match the Compose MySQL instance. `docker-compose.yml` sets `MYSQL_ROOT_PASSWORD=rootpassword`; `.env.example` defaults to `DB_NAME=valetudo_healthlink`, `DB_PORT=3307` and `DB_USER=valetudo_app`. Create that user or point `DB_USER` at `root`.
- **Do not run `schema.sql` against an existing database**: it drops all tables. Apply it only to a fresh database; `runAutoMigrations()` then handles newer columns/tables on boot.
- TLS material belongs in git-ignored `server/certs/`.

### 3. Run the desktop console

```bash
cd desktop
npm install
# set app-config.json BEFORE building/packaging
npm run dev      # Vite on 127.0.0.1:5173, then Electron
npm run build
npm run dist     # Windows NSIS x64 installer -> desktop/release/
```

### 4. Run the mobile app

```bash
cd mobile
flutter pub get
flutter run
```

Set `lib/config/api_config.dart` to an address the device can actually reach — `localhost` and `10.0.2.2` are not valid for a physical phone on the LAN. Firebase needs git-ignored `mobile/android/app/google-services.json` and `server/serviceAccountKey.json`; without them the app runs but push notifications are disabled. The self-signed-certificate override is debug-build only.

---

## 7. Configuration

`server/.env.example` is the authoritative env manifest. Keep `.env`, private keys, certificates and Firebase credentials out of git.

| Group | Variables / values | Notes |
| --- | --- | --- |
| Server | `PORT=5000`, `PUBLIC_API_BASE_URL`, `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY=false` | `PUBLIC_API_BASE_URL` is embedded in generated PDFs/QR codes. Include `null` in the CORS allow-list for packaged `file://` Electron builds. |
| Secrets | `JWT_SECRET`, `ENCRYPTION_KEY`, `ENCRYPTION_SALT`, `HEALTH_PASS_HMAC_SECRET` | Generate 32-byte secrets with `openssl rand -hex 32` (salt with `openssl rand -hex 16`). Keep the QR HMAC secret distinct from `JWT_SECRET`; back up the encryption key/salt pair. |
| MySQL | `DB_HOST`, `DB_PORT=3307`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=valetudo_healthlink` | `server/src/db.js` refuses to start without a DB password. |
| Redis | `REDIS_HOST`, `REDIS_PORT=6379`, `REDIS_PASSWORD` | Cache, JWT denylist, rate limits and QR nonces. |
| MinIO / S3 | `S3_ENDPOINT=http://127.0.0.1:9000`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET=valetudo-attachments` | Path-style access; bucket created on startup if missing. |
| Mail, push, maps | `SMTP_HOST`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`, Firebase service account, optional `GOOGLE_MAPS_API_KEY` | Reminders, SOS push and reverse geocoding. |
| Throttles | `LOGIN_RATE_LIMIT_MAX/WINDOW`, `SOS_RATE_LIMIT_MAX/WINDOW`, `BOOKING_RATE_LIMIT_MAX/WINDOW`, `VERIFY_RATE_LIMIT_*` | Defaults are `5/60`, `10/60`, `10/60`; see `server/src/config/limits.js`. |

Cross-module gotchas called out by `AGENTS.md` and the root docs pack:

- `desktop/app-config.json` is a **build-time** API URL, not runtime configuration.
- `mobile/lib/config/api_config.dart` contains a **hardcoded** API host.
- `CORS_ALLOWED_ORIGINS`, `PUBLIC_API_BASE_URL` and the client base URLs must agree.
- Compose ports are loopback-only by design; do not expose MySQL/Redis/MinIO directly to the clinic network.

---
