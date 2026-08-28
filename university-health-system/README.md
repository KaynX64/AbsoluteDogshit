# University Health System

A comprehensive Kotlin-based health management system for universities, built with Compose Multiplatform for cross-platform support (PC, Android phones, and tablets).

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

### System Admin Module (University IT/University Admin)

- **Role-Based Access Control**: Manages permissions for students, faculty, nurses, doctors, and emergency personnel to protect data privacy
- **Data Privacy Compliance**: Ensures all medical records are encrypted and compliant with the Philippine Data Privacy Act of 2012

## Project Structure

```
university-health-system/
├── shared/                          # Shared business logic (Kotlin Multiplatform)
│   └── src/main/kotlin/com/uni/health/
│       ├── domain/                  # Domain enums and constants
│       ├── model/                   # Data models
│       ├── repository/              # Repository interfaces
│       ├── usecase/                 # Business logic use cases
│       └── presentation/            # UI components and utilities
├── desktopApp/                      # Desktop application (Windows, Mac, Linux)
│   └── src/main/kotlin/com/uni/health/desktop/
└── mobileApp/                       # Android mobile application (phones & tablets)
    └── src/main/kotlin/com/uni/health/mobile/
```

## Technology Stack

- **Language**: Kotlin
- **UI Framework**: 
  - Compose Multiplatform (Desktop)
  - Jetpack Compose (Android)
- **Architecture**: Clean Architecture with Use Cases
- **Async**: Kotlin Coroutines
- **Serialization**: Kotlinx Serialization
- **Networking**: Ktor Client
- **Database**: SQLite (Desktop), Room (Android)
- **QR Code**: ZXing

## User Roles

1. **STUDENT** - View health profile, book appointments, view prescriptions/clearances, SOS access
2. **STAFF** - Same as student access
3. **NURSE** - Queue management, patient records, inventory, issue clearances
4. **DOCTOR** - Full EMR access, prescribe medications, view analytics
5. **DENTIST** - Dental records, treatments
6. **ADMIN** - User management, role assignments, system settings, compliance
7. **EMERGENCY** - Emergency response, location tracking

## Building the Project

### Prerequisites

- JDK 17 or higher
- Android SDK (for mobile app)
- Gradle 8.0+

### Build Commands

```bash
# Build shared module
./gradlew :shared:build

# Build desktop application
./gradlew :desktopApp:build

# Build mobile application
./gradlew :mobileApp:assembleDebug

# Run desktop application
./gradlew :desktopApp:run
```

## Security & Compliance

- All passwords are hashed using bcrypt/Argon2 (implementation required)
- Medical records are encrypted at rest and in transit
- Role-based access control ensures data privacy
- Digital signatures for clearances and prescriptions
- Compliant with Philippine Data Privacy Act of 2012

## Key Components

### Models (`shared/src/main/kotlin/com/uni/health/model/`)

- `User` - Authentication and authorization
- `HealthProfile` - Student/staff medical information
- `Appointment` - Consultation scheduling
- `EmergencyAlert` - SOS panic button alerts
- `MedicalRecord` - Electronic medical records (EMR)
- `Prescription` - Digital prescriptions
- `MedicalClearance` - OJT, sports, general clearances
- `MedicineInventory` - Clinic stock management
- `QueueEntry` - Live queue management

### Use Cases (`shared/src/main/kotlin/com/uni/health/usecase/`)

- `AuthenticationUseCase` - Login, registration, password management
- `HealthProfileUseCase` - Profile CRUD, QR code generation
- `AppointmentUseCase` - Booking, confirmation, cancellation
- `EmergencyAlertUseCase` - SOS trigger, alert management
- `EMRUseCase` - Medical record management
- `ClearanceUseCase` - Digital clearance issuance
- `InventoryUseCase` - Stock management, alerts
- `QueueUseCase` - Queue dashboard management
- `AnalyticsUseCase` - Health reports and trends

## Running the Application

### Desktop (PC/Mac/Linux)

```bash
cd university-health-system
./gradlew :desktopApp:run
```

### Mobile (Android)

```bash
cd university-health-system
./gradlew :mobileApp:installDebug
```

## Notes for Production

1. **Implement proper password hashing** - Replace placeholder with bcrypt/Argon2
2. **Set up encryption service** - Implement AES-256 for data encryption
3. **Configure push notifications** - Set up Firebase Cloud Messaging
4. **Implement digital signatures** - Use RSA/ECDSA for document signing
5. **Set up database** - Configure SQLite/Room with proper migrations
6. **Add API backend** - Connect to server for data synchronization
7. **Implement QR code generation** - Integrate ZXing library properly
8. **Add location services** - Implement GPS for SOS feature
9. **Set up logging** - Configure proper audit trails
10. **Security audit** - Conduct penetration testing before deployment

## License

This project is for educational purposes. Ensure compliance with local data privacy laws before deployment.
