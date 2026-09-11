# 🏥 Valetudo HealthLink

> **An EMR-Integrated Consultation and Emergency Response System for PSU Lingayen Campus**  
> *Developed for CC106: Application Development and Emerging Technologies*

---

## 👥 Project Information

* **Institution:** Pangasinan State University — Lingayen Campus
* **College:** College of Computing Sciences | Bachelor of Science in Information Technology
* **Section:** III-BSIT-A
* **Course:** CC106 (Application Development and Emerging Technologies)
* **Adviser / Instructor:** Dr. Clark Kim Castro
* **Development Team (Team 2):**
  * **Arenas, Dimples Gianelli**
  * **Cerezo, Denver B.**
  * **Mata, Juan Nathaniel**
  * **Movida, Daniella Lorraine M.**

---

## 📌 System Architecture Overview

Valetudo HealthLink is engineered as an integrated 3-tier hybrid health platform designed specifically for campus clinical workflows:
* **Mobile Client (Flutter):** Dedicated client for Students, Faculty, Staff, and on-field Emergency Responders.
* **Desktop Workstation (Electron + React + TypeScript + Tailwind):** Deployed on infirmary clinic PCs for Nurses, Doctors, Dentists, and IT Admins.
* **Backend Application Server:** Node.js + Express REST API paired with Socket.IO for real-time live events.
* **Data Tier:** Centralized MySQL 8.0 with spatial indexing (`POINT SRID 4326`), Redis in-memory queue cache, MinIO S3-compatible cloud object storage, and embedded client-side SQLite.

---

## 🚦 System Features Implementation Status

> **Legend:**  
> 🟢 **Active / Implemented** | 🟡 **In Progress / Scaffolded** | 🔴 **Pending / Planned**

| No. | Feature Name | Description | Backend API | Mobile (Flutter) | Desktop (Electron) |
| :---: | :--- | :--- | :---: | :---: | :---: |
| **—** | **System Infrastructure & Auth** | Docker Compose, 21-Table Schema, JWT, RBAC | 🟢 Active | 🟢 Active | 🟢 Active |
| **1** | **Digital Health Profile** | Vitals baseline, allergies, emergency contacts | 🟡 Scaffolded | 🔴 Pending | 🔴 Pending |
| **2** | **QR Code Health Pass** | Dynamic touchless intake & pass generation | 🔴 Pending | 🔴 Pending | 🔴 Pending |
| **3** | **Consultation Scheduler** | Doctor/Dentist appointment booking | 🔴 Pending | 🔴 Pending | 🔴 Pending |
| **4** | **SOS Panic Button** | GPS emergency trigger & live responder routing | 🔴 Pending | 🔴 Pending | 🔴 Pending |
| **5** | **Prescription & Clearance Viewer** | View/download digital credentials via MinIO | 🔴 Pending | 🔴 Pending | 🔴 Pending |
| **6** | **EMR Records Management** | Clinical encounter history & vitals tracking | 🔴 Pending | 🔴 Pending | 🔴 Pending |
| **7** | **Live Queue Dashboard** | Real-time queue stream via Socket.IO & Redis | 🔴 Pending | 🔴 Pending | 🔴 Pending |
| **8** | **Digital Issuance & Native Print** | Tamper-proof certs, e-signatures, Print-to-PDF | 🔴 Pending | 🔴 Pending | 🔴 Pending |
| **9** | **Medicine Inventory Management** | Lot-based drug tracking & batch expiry sweeps | 🔴 Pending | 🔴 Pending | 🔴 Pending |
| **10** | **Health Analytics & Reporting** | Campus health trends, illness cluster analysis | 🔴 Pending | 🔴 Pending | 🔴 Pending |
| **11** | **Role-Based Access Control (RBAC)** | M:N normalized permissions & route guarding | 🟢 Active | 🟡 Scaffolded | 🟡 Scaffolded |
| **12** | **Data Privacy (RA 10173 Compliance)** | SHA-256 hash-chained audit & PHI access logs | 🟡 In Schema | 🔴 Pending | 🔴 Pending |

---

## 🛠️ Technology Stack & Ports Configuration

| Component | Technology | Default Port / Notes |
| :--- | :--- | :--- |
| **Backend REST API** | Node.js + Express + Socket.IO | `http://localhost:5000` |
| **Primary Database** | MySQL 8.0 (`POINT SRID 4326`) | **Port `3307`** *(mapped to prevent conflicts with local MySQL)* |
| **Live Cache** | Redis 7 Alpine | **Port `6379`** |
| **Object Storage (S3)** | MinIO Server | **API: `9000`** \| **Console: `9001`** |
| **Mobile Application** | Flutter (Dart) | Tested on physical Android (Redmi Note 9S) & Web |
| **Desktop Application** | Electron + React + TS + Tailwind | Vite Dev Server on `http://localhost:5173` |

---

## 🚀 Getting Started & Local Development

### 1. Prerequisites
* [Docker Desktop](https://www.docker.com/) (running with WSL 2 backend)
* [Node.js](https://nodejs.org/) (v18 or v20 LTS)
* [Flutter SDK](https://flutter.dev/) (v3.20+)
* [Android Studio](https://developer.android.com/studio) / Android SDK Command-line Tools

---

### 2. Infrastructure Setup (Databases & Services)
From the project root, launch the required databases and storage services:

```bash
docker compose up -d
