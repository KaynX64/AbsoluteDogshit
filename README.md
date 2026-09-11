# Valetudo HealthLink 🏥⚡

> **An EMR-Integrated Consultation and Emergency Response System for PSU Lingayen Campus**  
> *Course:* CC106 – Application Development and Emerging Technologies  
> *Section:* III-BSIT-A | Team 2 ([REDACTED])  
> *Institution:* Pangasinan State University – Lingayen Campus, College of Computing Sciences  
> *Adviser / Instructor:* [REDACTED]

---

## 📌 Project Overview

**Valetudo HealthLink** is a centralized, multi-platform health and emergency management ecosystem designed specifically for the PSU Lingayen Campus infirmary. The platform bridges patient self-service and clinic administration by linking:
- **A Flutter Mobile Application** for students, faculty, staff, and campus emergency responders.
- **An Electron + React Desktop Application** for clinic nurses, campus physicians, and IT administrators.
- **A Node.js / Express REST API & Socket.IO WebSockets Server** for business logic, live queuing, and emergency geolocation streaming.
- **A Hybrid Storage Engine:** Central MySQL 8.0 (with spatial `POINT SRID 4326`), Redis in-memory live queue caching, MinIO S3-compatible cloud object storage, and embedded client-side SQLite offline sync.

---

## 🚦 System Features Implementation Status

Current status breakdown across the **Backend API**, **Flutter Mobile**, and **Electron Desktop** clients based on the 12 core functional specifications (Table 1.1 / Table 4.1):

| # | Proposed System Feature | Backend Status | Mobile (Flutter) | Desktop (Electron) | Current Milestone / Notes |
|:---:|:---|:---:|:---:|:---:|:---|
| **1** | **Digital Health Profile** | 🟡 In Progress | 🟡 In Progress | 🔴 Pending | DDL tables created (`HEALTH_PROFILES`); baseline auth linked. |
| **2** | **QR Code Health Pass** | 🔴 Pending | 🔴 Pending | 🔴 Pending | Dynamic HMAC token generation & scanner module scheduled for Sprint 2. |
| **3** | **Consultation Scheduler** | 🔴 Pending | 🔴 Pending | 🔴 Pending | Database schema ready (`APPOINTMENTS`); booking API pending. |
| **4** | **SOS Panic Button (GPS)** | 🔴 Pending | 🔴 Pending | 🔴 Pending | Spatial schema ready (`EMERGENCY_ALERTS` `POINT SRID 4326`); Socket.IO alert broadcast next. |
| **5** | **Prescription & Clearance Viewer** | 🔴 Pending | 🔴 Pending | 🔴 Pending | Object storage pipeline (MinIO) ready; document delivery pending. |
| **6** | **Electronic Medical Records (EMR)** | 🔴 Pending | — | 🔴 Pending | Schema deployed (`EMR_RECORDS`, `VITAL_SIGNS`); desktop consultation form pending. |
| **7** | **Live Queue Dashboard** | 🔴 Pending | 🔴 Pending | 🔴 Pending | Redis container active; Socket.IO live queue sync scheduled for Sprint 3. |
| **8** | **Digital Issuance & E-Sign** | 🔴 Pending | — | 🔴 Pending | Native Print-to-PDF pipeline designed; certificate builder pending. |
| **9** | **Medicine Inventory Management** | 🔴 Pending | — | 🔴 Pending | Master & batch tracking tables ready (`MEDICINES`, `MEDICINE_BATCHES`, `INVENTORY_LOGS`). |
| **10** | **Health Analytics & Reporting** | 🔴 Pending | — | 🔴 Pending | Metric aggregation & disease trend endpoints pending. |
| **11** | **Role-Based Access Control (RBAC)** | 🟢 Active | 🟢 Active | 🟢 Active | M:N `USER_ROLES` deployed; JWT auth working; role-based login verified on Mobile and Desktop. |
| **12** | **Data Privacy & Encrypted Audit** | 🟡 In Progress | 🔴 Pending | 🔴 Pending | RA 10173 genesis hash block created in `AUDIT_LOGS`; automated chaining middleware pending. |

> **Status Legend:**  
> 🟢 **Active / Completed** — Deployed, integrated, and verified working.  
> 🟡 **In Progress** — Foundation / tables deployed; endpoints or UI under active implementation.  
> 🔴 **Pending** — Queued for subsequent vertical development slices.

---

## 🛠️ Technology Stack

| Layer | Technologies Used |
|:---|:---|
| **Mobile Client** | Flutter SDK (Dart), `http`, `flutter_secure_storage`, `flutter_map` / Google Maps |
| **Desktop Client** | Electron.js, React, TypeScript, Tailwind CSS, Local SQLite (`better-sqlite3`), Native Print API |
| **Application Tier** | Node.js (LTS), Express.js (REST API), Socket.IO (WebSockets), JSON Web Tokens (JWT) |
| **Database & Cache** | **MySQL 8.0** *(configured on host port **`3307`**)*, Redis 7 (Alpine) |
| **Object Storage** | MinIO (S3-Compatible Object Store for PDF Prescriptions & Clearances) |
| **Containerization** | Docker Desktop (Docker Compose) |

---

## 📂 Project Architecture & Directory Layout

```text
valetudo-healthlink/
├── docker-compose.yml          # Container orchestration (MySQL 8, Redis, MinIO)
├── schema.sql                  # Complete 21-table DDL script with seed data & spatial indexes
├── server/                     # Backend REST API & Socket.IO server
│   ├── .env                    # Environment secrets (Port, DB, JWT)
│   ├── package.json
│   └── src/
│       ├── db.js               # MySQL2 connection pool (Port 3307)
│       ├── auth.js             # JWT generation & RBAC verification
│       └── index.js            # Express server entry point
├── desktop/                    # Clinic Workstation App (Electron + React + TS)
│   ├── electron/
│   │   └── main.cjs            # Electron Main Process (contextIsolation: true)
│   ├── src/                    # React UI & Tailwind design system
│   └── package.json
└── mobile/                     # Student & Emergency Responder App (Flutter)
    ├── lib/
    │   └── main.dart           # Cross-platform entry point & auth controller
    └── pubspec.yaml
