<!-- split from README.md — part 06 of 08 -->

## 5. File Structure

Abridged `Stage1` tree (dependencies/build outputs omitted):

```
AbsoluteDogshit/
├── .gitignore                    # 647 B on Stage1; ignores .env*, certs, Firebase creds, build outputs
├── .gitignore.backup
├── AGENTS.md                     # 8,021 B — root agent routing map and invariants
├── LICENSE                       # GPL-2.0
├── README.md                     # replace this 3,170 B AGENTS-pack note with this project README
├── docker-compose.yml            # loopback-bound MySQL / Redis / MinIO
├── package.json                  # 113 B; shared tooling only, no root scripts
├── package-lock.json
│
├── scripts/
│   └── verify_codeslice.py       # 3.41 KB; validates CODESLICE line ranges/anchors
│
├── server/                       # valetudo-backend
│   ├── .env.example              # 2.61 KB
│   ├── AGENTS.md                 # 7.24 KB
│   ├── schema.sql                # 33.57 KB; destructive full recreate, now 30 tables
│   ├── package.json / package-lock.json
│   ├── .postman/ postman/        # API collections/globals
│   ├── public/                   # public QR verification page
│   ├── scripts/                  # PHI encryption migration utility
│   ├── src/
│   │   ├── index.js              # HTTPS + Express + Socket.IO entry point
│   │   ├── auth/                 # login, session checks, logout, password changes and download tokens
│   │   ├── db/                   # pool and versioned migrations
│   │   ├── config/               # appointment rules, rate limits
│   │   ├── middleware/           # RBAC, consent
│   │   ├── routes/               # 12 route modules + AGENTS.md
│   │   │   ├── admin/  analytics/  appointments/  documents/
│   │   │   ├── emergency/  healthPass.js  interactions.js  inventory/
│   │   │   └── privacy.js  profile/  signature.js  sync/
│   │   ├── admin/ analytics/ appointments/ bootstrap/ documents/ emergency/ sync/ workers/
│   │   └── utils/                # shared infrastructure, encryption and logging
│   └── tests/                    # backend test suite (see §8)
│
├── desktop/                      # valetudo-desktop
│   ├── AGENTS.md / README.md     # architecture and build instructions
│   ├── app-config.json           # build-time renderer API URL
│   ├── docs/                     # code-slice index and source maps
│   ├── electron/                 # main, preload, window, TLS, offline IPC and updates
│   ├── public/                   # favicon and icon license
│   ├── src/
│   │   ├── main.tsx / index.css / electron.d.ts
│   │   ├── app/                  # session shell, login and navigation
│   │   ├── features/             # admin, consultations, nurse, appointments,
│   │   │                        # documents, inventory, analytics and emergency
│   │   ├── platform/             # connectivity, realtime and offline sync
│   │   ├── shared/ui/            # reusable components and styles
│   │   └── config/ theme/ assets/
│   ├── eslint.config.js
│   ├── index.html
│   ├── tsconfig*.json
│   └── vite.config.mts
│
└── mobile/                       # Flutter patient/responder app
    ├── AGENTS.md                 # 4,067 B
    ├── README.md                 # template stub
    ├── .metadata / analysis_options.yaml / pubspec.yaml
    ├── android/ ios/ assets/    # plus platform targets declared in .metadata
    └── lib/
        ├── main.dart
        ├── config/               # api_config.dart — hardcoded API host
        ├── screens/
        │   ├── AGENTS.md         # 7.67 KB
        │   ├── CODESLICE.md      # 4.62 KB
        │   ├── splash_screen.dart  login_screen.dart
        │   ├── patient_portal_screen.dart  responder_screen.dart
        │   ├── consultation_scheduler_screen.dart
        │   ├── documents_viewer_screen.dart  edit_profile_screen.dart
        │   ├── change_password_screen.dart  .gitkeep
        │   └── codeslice/       # MB-01 … MB-07 (7 Markdown maps)
        ├── services/             # connectivity, emergency_alert, offline_sos
        ├── utils/                # responsive helpers
        └── widgets/              # session_timeout_listener, valetudo_logo
```

`server/node_modules/` is **not** present on `Stage1` (commit `chore: untrack server node_modules`). `desktop/README.md` and `mobile/README.md` remain starter/template stubs; project documentation lives here and in the `AGENTS.md` / `CODESLICE.md` system.

### Code-slice maps

| Location | Maps |
| --- | --- |
| `desktop/docs/codeslice/` | `DT-01-DoctorConsole.md`, `DT-02-AdminConsole.md`, `DT-03-NurseConsole.md`, `DT-04-InventoryManager.md`, `DT-05-QrIntakeScanner.md`, `DT-06-AnalyticsDashboard.md`, `DT-07-PrescriptionGenerator.md`, `DT-08-IncidentRecords.md`, `DT-09-App.md`, `DT-10-CreateUserModal.md`, `DT-11-IncidentReportModal.md`, `DT-12-ResponderConsole.md`, `DT-13-ElectronMain.md` |
| `mobile/lib/screens/codeslice/` | `MB-01-PatientPortalScreen-parts/`, `MB-02-ConsultationSchedulerScreen.md`, `MB-03-DocumentsViewerScreen.md`, `MB-04-ResponderScreen.md`, `MB-05-ChangePasswordScreen.md`, `MB-06-LoginScreen.md`, `MB-07-EmergencyAlertService.md` |

These exist because several files are genuine monoliths (`DoctorConsole.tsx` ≈ 164 KB, `AdminConsole.tsx` ≈ 157 KB, `patient_portal_screen.dart` ≈ 120 KB). Any source edit that shifts line numbers must be followed by a slice-map update and verification.

---

## 6. Getting Started
