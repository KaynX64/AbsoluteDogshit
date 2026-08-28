# University Health Management System - Multiplatform

A comprehensive health management system built with **Kotlin Multiplatform** and **Compose Multiplatform** that runs on:

- 🖥️ **PC/Desktop** (Windows, macOS, Linux)
- 📱 **Android Phones & Tablets**
- 🌐 **Web Browsers**

## Features

### Student & Staff Module (Client Side)
- **Digital Health Profile**: Stores basic information, course/department, blood type, allergies, and pre-existing medical conditions
- **QR Code Health Pass**: Generates a unique QR code for touchless check-ins at the University campus clinic
- **Consultation Scheduler**: Allows users to book physical or virtual check-up appointments with the school doctor or dentist
- **SOS Panic Button**: One-tap emergency button that immediately sends the user's location and profile to the clinic response team during a campus accident
- **Prescription & Clearance Viewer**: Lets users view and download digital prescriptions and medical clearances for OJT or sports events

### Clinic & EMR Module (Nurse & Doctor Side)
- **Electronic Medical Records (EMR)**: Fully digitizes student/staff health history, consultation logs, treatments, and dental records
- **Live Queue Dashboard**: Tracks and manages walk-in and scheduled patients to prevent overcrowding at the campus infirmary
- **Digital Issuance**: Allows clinic staff to digitally sign and issue medical clearances, certificates, and prescriptions
- **Medicine Inventory Management**: Tracks the stock levels of clinic medicines and first-aid supplies, with automatic alerts for low stock or expiration dates
- **Health Analytics**: Generates campus-wide health reports (e.g., tracking common illnesses or seasonal flu spikes on campus)

### System Admin Module (University IT/Admin)
- **Role-Based Access Control**: Manages permissions for students, faculty, nurses, doctors, and emergency personnel to protect data privacy
- **Data Privacy Compliance**: Ensures all medical records are encrypted and compliant with the Philippine Data Privacy Act of 2012

## Project Structure

```
/workspace
├── app/                          # Multiplatform application module
│   ├── src/
│   │   ├── commonMain/           # Shared code across all platforms
│   │   │   ├── kotlin/com/university/health/
│   │   │   │   ├── model/        # Data models (shared)
│   │   │   │   ├── service/      # Business logic (shared)
│   │   │   │   ├── repository/   # Data access (shared)
│   │   │   │   ├── ui/           # Compose UI components (shared)
│   │   │   │   └── util/         # Utilities (shared)
│   │   │   └── resources/        # Shared resources
│   │   ├── desktopMain/          # PC/Desktop specific code
│   │   ├── androidMain/          # Android specific code
│   │   └── webMain/              # Web/Browser specific code
│   └── build.gradle.kts
├── src/                          # Legacy JVM module (console demo)
├── build.gradle.kts              # Root build configuration
├── settings.gradle.kts           # Project settings
└── README.md                     # This file
```

## Technology Stack

- **Language**: Kotlin 1.9.20
- **UI Framework**: Compose Multiplatform (JetBrains Compose)
- **Multiplatform**: Kotlin Multiplatform (KMP)
- **Coroutines**: kotlinx-coroutines for async operations
- **Serialization**: kotlinx-serialization for JSON
- **Date/Time**: kotlinx-datetime
- **Dependencies**:
  - ZXing for QR code generation (Desktop)
  - ML Kit for barcode scanning (Android)
  - Google Play Services Location (Android)
  - Ktor for HTTP client (Web)

## Building the Application

### Prerequisites
- JDK 17 or higher
- Android SDK (for Android builds)
- Gradle 8.5+

### Build Commands

#### Desktop (PC)
```bash
./gradlew :app:runDesktop
# Or create distributable packages
./gradlew :app:packageDmg    # macOS
./gradlew :app:packageMsi    # Windows
./gradlew :app:packageDeb    # Linux
```

#### Android (Phone/Tablet)
```bash
./gradlew :app:assembleDebug    # Debug APK
./gradlew :app:assembleRelease  # Release APK (signed)
```

#### Web (Browser)
```bash
./gradlew :app:jsBrowserDevelopmentRun  # Development server
./gradlew :app:jsBrowserDistribution    # Production build
```

## Running the Application

### Desktop Application
The desktop application provides a full-featured experience optimized for larger screens:
- Native window management
- Keyboard shortcuts
- File system integration for downloads
- System tray support

### Android Application
The Android app is optimized for touch interaction:
- Responsive layout for phones and tablets
- Camera integration for QR scanning
- GPS for SOS location
- Biometric authentication
- Push notifications

### Web Application
Access the system from any browser:
- No installation required
- Works on any device with a browser
- Responsive design
- Progressive Web App (PWA) capabilities

## User Roles

| Role | Access Level | Key Features |
|------|-------------|--------------|
| Student/Staff | Personal | View profile, book appointments, SOS, view prescriptions |
| Doctor/Dentist | Clinical | EMR access, prescribe, issue clearances, manage schedule |
| Nurse | Clinical + Inventory | EMR, inventory management, queue management |
| Admin | Full System | User management, RBAC, compliance, analytics |
| Emergency Personnel | Limited | SOS alerts, emergency response |

## Data Privacy Compliance

This system is designed to comply with the **Philippine Data Privacy Act of 2012**:
- All medical records are encrypted at rest
- Role-based access control ensures data minimization
- Audit logging tracks all data access
- Users can access and update their own data
- Data retention policies are enforced

## Demo Credentials

For testing purposes:
- **Student**: student@university.edu.ph / student123
- **Doctor**: doctor@university.edu.ph / doctor123
- **Nurse**: nurse@university.edu.ph / nurse123
- **Admin**: admin@university.edu.ph / admin123

## Architecture

The application follows a clean architecture pattern:

```
┌─────────────────────────────────────────┐
│           Presentation Layer            │
│    (Compose Multiplatform UI)           │
├─────────────────────────────────────────┤
│           Domain Layer                  │
│    (Business Logic / Use Cases)         │
├─────────────────────────────────────────┤
│           Data Layer                    │
│    (Repositories / Data Sources)        │
└─────────────────────────────────────────┘
```

## License

This project is developed for educational purposes as part of a university health management system requirement.
