<!-- split from README.md — part 06 of 08 -->

## 5. File Structure

Abridged historical repository tree. See the [current layout](../../../README.md#-repository-structure) for current paths.

```
AbsoluteDogshit/
├── .gitignore                    # local configuration, credentials and generated output
├── .gitignore.backup
├── AGENTS.md / AGENTS-parts/      # cross-module guidance
├── DOCUMENTATION.md             # documentation index
├── LICENSE                       # GPL-2.0
├── README.md                     # project introduction and split README index
├── docker-compose.yml            # loopback-bound MySQL / Redis / MinIO
├── package.json                  # shared tooling only, no root scripts
├── package-lock.json
│
├── scripts/
│   └── verify_codeslice.py       # validates CODESLICE line ranges/anchors
│
├── server/                       # valetudo-backend
│   ├── .env.example              # API environment template
│   ├── AGENTS.md / AGENTS-parts/ # server guidance
│   ├── schema.sql                # destructive clean-install baseline, 33 tables
│   ├── package.json / package-lock.json
│   ├── .postman/ postman/        # Postman workspace metadata
│   ├── public/                   # public QR verification page
│   ├── scripts/                  # migration runner and legacy PHI encryption utility
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
│   │   └── config/ theme/ assets/ img_icons/
│   ├── eslint.config.js
│   ├── index.html
│   ├── tsconfig*.json
│   └── vite.config.mts
│
└── mobile/                       # Flutter patient/responder app
    ├── AGENTS.md / README.md      # architecture, build and workflows
    ├── .metadata / analysis_options.yaml / pubspec.yaml
    ├── android/ ios/ assets/    # plus platform targets declared in .metadata
    └── lib/
        ├── main.dart
        ├── config/               # api_config.dart — hardcoded API host
        ├── screens/
        │   ├── AGENTS.md / AGENTS-parts/
        │   ├── CODESLICE.md
        │   ├── splash_screen.dart  login_screen.dart
        │   ├── patient_portal_screen.dart  responder_screen.dart
        │   ├── consultation_scheduler_screen.dart
        │   ├── documents_viewer_screen.dart  edit_profile_screen.dart
        │   ├── change_password_screen.dart
        │   └── codeslice/       # MB-01 … MB-08
        ├── services/             # connectivity, alert session, responder roster and offline SOS
        ├── theme/                # account appearance preferences
        ├── utils/                # responsive helpers
        └── widgets/              # account settings, booking review, Responder Hub and shared UI
```

Use the [desktop README](../../../desktop/README.md) and [mobile README](../../../mobile/README.md) for setup and workflows.

### Code-slice maps

- [Desktop slice index](../../../desktop/docs/CODESLICE.md) covers DT-01 through DT-13.
- [Mobile slice index](../../../mobile/lib/screens/CODESLICE.md) covers MB-01 through MB-08.

Update the affected ranges and run the [slice verifier](README-08.md#verify-code-slice-documentation) after editing a mapped file.

---

## 6. Getting Started

Follow the [prerequisites and setup steps](README-07.md#prerequisites).
