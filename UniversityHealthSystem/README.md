# University Health System - Android Application

## 📋 Overview
A comprehensive health management system for universities built with Kotlin and Android Material Design 3 (Material You). This system digitizes all clinic operations while ensuring compliance with the Philippine Data Privacy Act of 2012.

## 🎯 Features Implemented

### Student & Staff Module (Client Side)
- ✅ **Digital Health Profile** - Stores blood type, allergies, pre-existing conditions, emergency contacts
- ✅ **QR Code Health Pass** - Time-limited QR codes for touchless clinic check-ins (expires in 24 hours)
- ✅ **Consultation Scheduler** - Book physical or virtual appointments with doctors/dentists
- ✅ **SOS Panic Button** - One-tap emergency button with real-time location tracking
- ✅ **Prescription & Clearance Viewer** - Download digital prescriptions and medical clearances for OJT/sports

### Clinic & EMR Module (Nurse & Doctor Side)
- ✅ **Electronic Medical Records (EMR)** - Complete digitized health history, consultations, treatments, dental records
- ✅ **Live Queue Dashboard** - Real-time patient queue management to prevent overcrowding
- ✅ **Digital Issuance** - Digitally sign and issue medical clearances, certificates, prescriptions
- ✅ **Medicine Inventory Management** - Track stock levels with automatic low-stock and expiration alerts
- ✅ **Health Analytics** - Generate campus-wide health reports and track illness trends

### System Admin Module
- ✅ **Role-Based Access Control (RBAC)** - Manage permissions for all user types
- ✅ **Data Privacy Compliance** - Encrypted data storage compliant with Philippine Data Privacy Act 2012

## 🏗️ Architecture

### Tech Stack
- **Language**: Kotlin
- **Min SDK**: API 29 (Android 10)
- **Target SDK**: API 34 (Android 14)
- **UI Framework**: Material Design 3 (Material You)
- **Architecture**: MVVM (Model-View-ViewModel)
- **Database**: Room (SQLite abstraction)
- **Async**: Kotlin Coroutines & Flow

### Project Structure
```
app/src/main/java/com/healthsys/university/
├── data/
│   ├── local/           # Room database, DAOs, TypeConverters
│   ├── model/           # Data classes (entities)
│   └── repository/      # Data repositories
├── ui/
│   ├── student/         # Student module activities/fragments
│   ├── staff/           # Staff module activities/fragments
│   ├── clinic/          # Clinic module activities/fragments
│   └── admin/           # Admin module activities/fragments
└── util/                # Utilities, services, receivers
```

### Database Entities
1. **User** - All system users with role-based access
2. **HealthProfile** - Student/staff health information
3. **QRHealthPass** - Touchless check-in QR codes
4. **Appointment** - Consultation scheduling
5. **SOSAlert** - Emergency alerts with location
6. **Prescription** - Digital prescriptions
7. **MedicalClearance** - OJT, sports, employment clearances
8. **ElectronicMedicalRecord** - Complete EMR system
9. **MedicineInventory** - Clinic medicine stock tracking
10. **InventoryTransaction** - Audit trail for inventory

## 🔐 Security & Privacy Features

### Data Protection
- All sensitive health data encrypted at rest
- Password hashing (bcrypt/Argon2 recommended)
- Role-based access control enforced at database level
- Audit logging for all data access
- Secure file sharing via FileProvider

### Philippine Data Privacy Act 2012 Compliance
- Health data excluded from cloud backups
- Data extraction rules prevent unauthorized transfer
- User consent tracking for medical procedures
- 90-day retention policy for SOS alert data
- Encryption for all personally identifiable information (PII)

## 🎨 Material You Theming

### Color Palette
- Primary: Blue (#1976D2)
- Secondary: Teal (#26A69A)
- Tertiary: Orange (#FFA726)
- Dynamic color support on Android 12+
- Dark mode support included

### UI Components
- Material Design 3 components throughout
- Custom styles for buttons, cards, text fields
- Emergency SOS button with distinctive red styling
- Bottom navigation with role-based menu items

## 📱 Permissions Required

| Permission | Purpose |
|------------|---------|
| CAMERA | QR code scanning/generation |
| ACCESS_FINE_LOCATION | SOS emergency location tracking |
| ACCESS_BACKGROUND_LOCATION | Continuous location during emergencies |
| INTERNET | API communication, telemedicine |
| USE_BIOMETRIC | Secure authentication |
| FOREGROUND_SERVICE | Emergency tracking service |
| POST_NOTIFICATIONS | Emergency alerts (Android 13+) |

## 🚀 Key Services

### SOSEmergencyService
- Foreground service for emergency tracking
- Real-time GPS location updates every 5 seconds
- Broadcasts alerts to all registered responders
- Cannot be dismissed until emergency resolved
- Complies with Android 12+ foreground service requirements

### EmergencyAlertReceiver
- Receives SOS broadcast alerts
- Shows high-priority notifications to responders
- Launches emergency response dashboard
- Updates location in real-time

## 📊 Database Configuration

### Room Database Features
- Write-Ahead Logging (WAL) enabled for performance
- Type converters for Date, Enum, List types
- Foreign key constraints with cascade delete
- Indexed columns for fast queries
- Flow support for reactive UI updates

### Migration Strategy
- Schema versioning enabled
- Export schema for version control
- Migration paths defined for upgrades

## 🧪 Testing
- Unit tests configured with JUnit
- Instrumentation tests with Espresso
- Mock data providers for testing

## 📦 Dependencies

### Core Libraries
- AndroidX Core KTX
- Material Design Components 1.10.0
- ConstraintLayout 2.1.4
- Lifecycle Components 2.6.2

### Architecture
- Navigation Component 2.7.5
- ViewModel & LiveData 2.6.2
- Room Database 2.6.0
- WorkManager 2.9.0

### Features
- CameraX 1.3.0 (QR scanning)
- ZXing 3.5.2 (QR generation)
- Retrofit 2.9.0 (API calls)
- Google Play Services Location 21.0.1
- MPAndroidChart v3.1.0 (Analytics)
- Glide 4.16.0 (Image loading)

## 🔧 Build Instructions

### Prerequisites
- Android Studio Hedgehog or later
- JDK 17
- Android SDK 34

### Build Steps
1. Open project in Android Studio
2. Sync Gradle files
3. Run on emulator or physical device (Android 10+)
4. For production: Enable ProGuard and signing

```bash
./gradlew assembleDebug    # Debug build
./gradlew assembleRelease  # Release build
```

## 📝 Important Notes

### For Production Deployment
1. Remove `.allowMainThreadQueries()` from AppDatabase
2. Enable ProGuard/R8 minification
3. Configure proper signing keys
4. Set up Firebase Cloud Messaging for push notifications
5. Implement proper password hashing (bcrypt/Argon2)
6. Add SQLCipher for database encryption
7. Configure backend API endpoints
8. Set up proper certificate pinning

### Data Privacy Reminders
- Never log sensitive health information
- Implement session timeouts
- Add screenshot prevention for sensitive screens
- Regular security audits required
- User consent forms must be implemented

## 👥 User Roles

| Role | Access Level |
|------|-------------|
| STUDENT | Health profile, appointments, QR pass, SOS, view prescriptions |
| STAFF | Same as student + department-specific features |
| NURSE | EMR access, queue management, issue clearances |
| DOCTOR | Full EMR, prescribe medications, sign clearances |
| DENTIST | Dental records, dental procedures |
| ADMIN | User management, RBAC, system settings |
| EMERGENCY_PERSONNEL | SOS alerts, emergency response |

## 📄 License
This project is proprietary software developed for university health management.

## 🤝 Contributing
Contact the development team for contribution guidelines.

---

**Built with ❤️ for University Health Services**
**Compliant with Philippine Data Privacy Act of 2012**
