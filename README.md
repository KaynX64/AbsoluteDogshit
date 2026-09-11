
***

```markdown
# Valetudo HealthLink 🏥

> **An EMR-Integrated Consultation and Emergency Response System**  
> *Developed for Pangasinan State University — Lingayen Campus*  
> *Course: CC106 | Application Development and Emerging Technologies*

---

## 📌 Overview

**Valetudo HealthLink** is a centralized healthcare management platform engineered to modernize campus infirmary workflows, appointment triage, digital credential issuance, and emergency dispatch. 

Built with a 3-tier hybrid enterprise topology, the system pairs a **Flutter mobile application** for students and on-field emergency responders with an **Electron desktop workstation** for clinic doctors, nurses, and administrators—backed by a centralized Node.js REST API, Redis in-memory cache, and a MySQL 8.0 spatial database.

---

## 🚦 System Implementation & Feature Status

### Core System Features (SADD Functional Specifications)

| Feature # | Functional Module | Scope / Capability | Backend Status | Frontend Status (Mobile / Desktop) |
| :---: | :--- | :--- | :---: | :---: |
| **01** | **Digital Health Profile** | Baseline medical indicators, allergies, blood type, emergency contacts | 🟢 Active | 🔴 Pending UI Form |
| **02** | **QR Code Health Pass** | Dynamic HMAC-signed QR generation & USB/camera check-in | 🔴 Pending | 🔴 Pending |
| **03** | **Consultation Scheduler** | Doctor/Dentist appointment slots, calendar view, notifications | 🔴 Pending | 🔴 Pending |
| **04** | **SOS Emergency Panic Button** | One-tap GPS dispatch (`POINT SRID 4326`), real-time clinic alarm | 🔴 Pending | 🔴 Pending |
| **05** | **Prescription & Clearance Viewer** | Tamper-evident digital clearance & Rx viewing (MinIO object storage) | 🔴 Pending | 🔴 Pending |
| **06** | **EMR Management** | Chronological patient history, consultation notes, normalized vitals | 🟢 DB Ready | 🔴 Pending UI |
| **07** | **Live Queue Dashboard** | Real-time queue ticketing via Socket.IO & in-memory Redis cache | 🔴 Pending | 🔴 Pending |
| **08** | **Digital Issuance & E-Sign** | E-signatures, clearance generation, Electron native Print-to-PDF | 🔴 Pending | 🔴 Pending |
| **09** | **Medicine Inventory** | Batch-level lot tracking, expiration checks, auto-dispense logs | 🟢 DB Ready | 🔴 Pending UI |
| **10** | **Health Analytics & Reports** | Campus health trends, seasonal spikes, exportable audit summaries | 🔴 Pending | 🔴 Pending |
| **11** | **Role-Based Access Control** | M:N security boundaries (Student, Faculty, Nurse, Doctor, Admin) | 🟢 Active | 🟢 Active (Auth Shell) |
| **12** | **Data Privacy (RA 10173)** | SHA-256 hash-chained audit logs, PHI read tracking, SQLite sync | 🟢 Schema Ready | 🔴 Pending Engine |

---

### Infrastructure & Pipeline Status

* 🟢 **Containerized Services:** Docker Compose orchestration for MySQL 8.0, Redis 7, and MinIO.
* 🟢 **Database Core:** 21 normalized tables deployed with constraints, spatial indexes, and role lookups.
* 🟢 **Backend Authentication:** JWT issuance, bcrypt password verification, role permission extraction.
* 🟢 **Mobile Client Scaffolding:** Cross-platform Flutter client with secure token storage and backend connectivity.
* 🟢 **Desktop Client Scaffolding:** Vite + React + TypeScript + Electron main/renderer setup with `contextIsolation: true`.
* 🔴 **Real-Time WebSockets:** Socket.IO event broadcaster for live queue and campus-wide SOS alerts.
* 🔴 **MinIO S3 Integration:** Backend file upload handlers for prescriptions and medical clearances.
* 🔴 **Offline Engine:** Electron embedded SQLite replication queue (`LOCAL_SYNC_LOGS`).

---

## 🛠️ Technology Stack

* **Mobile Client:** Flutter (Dart) — Target: Android & iOS
* **Desktop Workstation:** Electron.js + React (TypeScript) + Tailwind CSS
* **Backend Application Tier:** Node.js + Express (REST API) + Socket.IO (WebSockets)
* **Relational Persistence:** MySQL 8.0 *(Configured Host Port: `3307`)*
* **Caching & Real-Time Queue:** Redis 7 (Alpine)
* **Object Storage (S3-Compatible):** MinIO Server
* **Embedded Client Storage:** SQLite3 / Better-SQLite3
* **Spatial Reference Standard:** WGS 84 (`EPSG:4326`)

---

## 📁 Repository Structure

```text
valetudo-healthlink/
├── docker-compose.yml       # Local infrastructure (MySQL, Redis, MinIO)
├── schema.sql               # Full DDL schema (21 tables + seed data)
├── server/                  # Node.js + Express REST API
│   ├── .env                 # Environment secrets (Port, DB, JWT)
│   ├── src/
│   │   ├── db.js            # MySQL connection pool
│   │   ├── auth.js          # JWT & RBAC controller logic
│   │   └── index.js         # API entry point & routes
│   └── package.json
├── mobile/                  # Flutter Mobile Client
│   ├── lib/
│   │   └── main.dart        # Mobile entry, secure storage & auth UI
│   └── pubspec.yaml
└── desktop/                 # Electron + React Client
    ├── electron/
    │   └── main.cjs         # Electron Main Process (IPC, Window management)
    ├── src/                 # React UI Components
    └── package.json
```

---

## 🚀 Quick Start Guide

### 1. Prerequisites
* [Node.js](https://nodejs.org/) (v18.x or higher)
* [Flutter SDK](https://flutter.dev/) (v3.24+ recommended)
* [Docker Desktop](https://www.docker.com/products/docker-desktop/) (running on Windows 11 / WSL 2)

---

### 2. Infrastructure Setup (Docker)

Start the database, cache, and object storage containers:

```bash
docker compose up -d
```

Verify that the containers are healthy:
* **MySQL 8.0:** Running on `localhost:3307`
* **Redis:** Running on `localhost:6379`
* **MinIO API:** Running on `localhost:9000`
* **MinIO Web Console:** Open browser at `http://localhost:9001` *(User: `minioadmin` | Pass: `miniopassword`)*

---

### 3. Database Deployment

Load the schema and default seed data:

```bash
docker exec -i valetudo-mysql mysql -u root -prootpassword valetudo_healthlink < schema.sql
```

---

### 4. Backend Setup

```bash
cd server
npm install
npm run dev
```
*API will start on `http://localhost:5000`.*

---

### 5. Running the Frontends

#### A. Mobile App (Flutter)
```bash
cd mobile
flutter pub get
flutter run
```
> **Physical Device Tip:** If deploying wirelessly or via cable to a physical phone, ensure your phone and computer share the same local network, or tunnel the port using ADB:
> ```bash
> adb reverse tcp:5000 tcp:5000
> ```

#### B. Desktop Client (Electron)
```bash
cd desktop
npm install
npm run dev
```

---

## 🔑 Pre-Configured Test Accounts

All pre-seeded test accounts use the default testing credentials:  
**Password:** `Password123!`

| Account Email | Assigned Role | System Access Scope |
| :--- | :--- | :--- |
| `admin@psu.edu.ph` | **ADMIN** | IT Administration, User Management, RA 10173 Audit Logs |
| `doctor@psu.edu.ph` | **DOCTOR** | EMR Records, Clinical Diagnosis, Digital Prescriptions |
| `nurse@psu.edu.ph` | **NURSE** | Triage Vitals, Live Patient Queue, Medicine Inventory |
| `responder@psu.edu.ph` | **EMERGENCY_RESPONDER** | Field SOS Geolocation Alerts, Incident Status |
| `student@psu.edu.ph` | **STUDENT** | Dynamic Health Pass, Consultations, SOS Panic Button |

---

## 🔒 Security & Statutory Compliance

This project is engineered in compliance with the **Philippine Data Privacy Act of 2012 (Republic Act No. 10173)**:
* **Tamper-Evident Audit Trails:** Critical transactions write cryptographic SHA-256 hash chains (`entry_hash = SHA256(prev_hash + row_data)`).
* **Isolated Access Audits:** Non-mutating read actions on Protected Health Information (PHI) are tracked independently in `PHI_ACCESS_LOGS`.
* **Electron Sandboxing:** Workstation clients enforce `contextIsolation: true` to prevent arbitrary Node.js execution within the renderer window.

---

## 👥 Development Team

* **Project:** Valetudo HealthLink (Team 2)
* **Institution:** Pangasinan State University — Lingayen Campus
* **Department:** College of Computing Sciences *(Bachelor of Science in Information Technology)*
* **Section:** III-BSIT-A
* **Course:** CC106 — Application Development and Emerging Technologies
* **Prepared by:** `[REDACTED - Team 2 Members]`
* **Supervising Instructor:** `[REDACTED - Course Professor]`
```
