<!-- split from README.md — part 07 of 08 -->

### Prerequisites

- Node.js **22+** and npm. The desktop packaged smoke runner needs native WebSocket and SQLite support.
- Docker + Docker Compose
- Flutter SDK with Dart ^3.13.3
- Python 3 for `scripts/verify_codeslice.py`
- A MySQL client for initial schema provisioning and Firebase project credentials for Android push.

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
```

Fill in `.env`, provision or migrate the database, and generate the API certificate and key before running `npm run dev` or `npm start` from `server/`. Follow the [TLS bootstrap instructions](../AGENTS-parts/AGENTS-01.md#bootstrap-a-dev-machine-order-matters).

- The API serves HTTPS on `PORT` (default `5000`); clients use `https://<host>:5000/api/...` and Socket.IO/WSS on the same port.
- Make `DB_USER`/`DB_PASSWORD` match the Compose MySQL instance. `docker-compose.yml` sets `MYSQL_ROOT_PASSWORD=rootpassword`; `.env.example` defaults to `DB_NAME=valetudo_healthlink`, `DB_PORT=3307` and `DB_USER=valetudo_app`. Create that user or point `DB_USER` at `root`.
- Provision fresh databases with `schema.sql`, which drops and recreates tables. Upgrade existing databases with `npm run migrate` from `server/`. Startup also applies any pending versions before listening. [Migration rollout guide](../server/MIGRATION-PLAN.md)
- TLS material belongs in git-ignored `server/certs/`.

### 3. Run the desktop console

Run these commands from the repository root with the API running and the development certificate in place.

```bash
cd desktop
npm install
# set app-config.json BEFORE building/packaging
npm run dev      # Vite on 127.0.0.1:5173, then Electron
npm run build
npm run dist     # Windows NSIS x64 installer -> desktop/release/
```

### 4. Run the mobile app

Run these commands from the repository root after configuring the target device and Android Firebase build files.

```bash
cd mobile
flutter pub get
flutter run
```

Set `lib/config/api_config.dart` to the API host reachable from the target device. Use the server’s LAN address for a physical Android phone or `10.0.2.2` for the Android emulator. Firebase needs git-ignored `mobile/android/app/google-services.json` and `server/serviceAccountKey.json`; Android builds require the client configuration, and live push delivery requires the server credential. The self-signed-certificate override is debug-build only.

---

## 7. Configuration

`server/.env.example` is the authoritative env manifest. Keep `.env`, private keys, certificates and Firebase credentials out of git.

| Group | Variables / values | Notes |
| --- | --- | --- |
| Server | `PORT=5000`, `PUBLIC_API_BASE_URL`, `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY=false` | `PUBLIC_API_BASE_URL` is embedded in generated PDFs/QR codes. The built-in allow-list includes the packaged Electron origin `null`. Add browser origins through `CORS_ALLOWED_ORIGINS`. |
| Secrets | `JWT_SECRET`, `ENCRYPTION_KEY`, `ENCRYPTION_SALT`, `HEALTH_PASS_HMAC_SECRET` | Generate 32-byte secrets with `openssl rand -hex 32` (salt with `openssl rand -hex 16`). Keep the QR HMAC secret distinct from `JWT_SECRET`; back up the encryption key/salt pair. |
| MySQL | `DB_HOST`, `DB_PORT=3307`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=valetudo_healthlink` | `server/src/db/pool.js` refuses to start without a DB password. |
| Redis | `REDIS_HOST`, `REDIS_PORT=6379`, `REDIS_PASSWORD` | Cache, JWT denylist, rate limits and QR nonces. |
| MinIO / S3 | `S3_ENDPOINT=http://127.0.0.1:9000`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET=valetudo-attachments` | Path-style access; bucket created on startup if missing. |
| Mail, push, maps | `SMTP_HOST`, `SMTP_PORT=587`, `SMTP_USER`, `SMTP_PASS`, Firebase service account, optional `GOOGLE_MAPS_API_KEY` | Reminders, SOS push and reverse geocoding. |
| Throttles | `LOGIN_RATE_LIMIT_MAX/WINDOW`, `SOS_RATE_LIMIT_MAX/WINDOW`, `BOOKING_RATE_LIMIT_MAX/WINDOW`, `VERIFY_RATE_LIMIT_*` | Defaults per 60 seconds are 5 login, 10 SOS, 10 booking and 30 verification attempts. [Limit defaults](../server/src/config/limits.js) |

See the [cross-module configuration guide](../AGENTS-parts/AGENTS-02.md#read-before-touching-cross-module-config) for client and deployment settings.

- `desktop/app-config.json` sets the packaged renderer API URL at build time. Electron main reads the packaged file for certificate checks.
- `mobile/lib/config/api_config.dart` contains a **hardcoded** API host.
- Set `PUBLIC_API_BASE_URL` to the API origin reachable by users scanning document links. Configure browser origins in the CORS allow-list and point client base URLs at the API.
- Compose ports are loopback-only by design; do not expose MySQL/Redis/MinIO directly to the clinic network.

---
