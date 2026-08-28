import config.AppConfig
import model.*
import service.*
import util.QRCodeGenerator
import java.time.LocalDate
import java.time.ZoneId

/**
 * Main entry point for the University Health System.
 * This is a console-based demonstration of all system features.
 * 
 * The system includes:
 * - Student & Staff Module (Client Side)
 * - Clinic & EMR Module (Nurse & Doctor Side)
 * - System Admin Module
 */
fun main() {
    println("╔════════════════════════════════════════════════════════╗")
    println("║     UNIVERSITY HEALTH MANAGEMENT SYSTEM                ║")
    println("║     Built with Kotlin                                  ║")
    println("╚════════════════════════════════════════════════════════╝\n")
    
    // Initialize the system configuration and services
    AppConfig.initialize()
    
    // Seed sample data for demonstration
    AppConfig.seedSampleData()
    
    // Run the feature demonstrations
    demonstrateStudentFeatures()
    demonstrateDoctorFeatures()
    demonstrateNurseFeatures()
    demonstrateAdminFeatures()
    demonstrateEmergencyFeatures()
    
    println("\n╔════════════════════════════════════════════════════════╗")
    println("║     DEMONSTRATION COMPLETED                            ║")
    println("╚════════════════════════════════════════════════════════╝")
}

/**
 * Demonstrates Student & Staff Module features:
 * - Digital Health Profile
 * - QR Code Health Pass
 * - Consultation Scheduler
 * - SOS Panic Button
 * - Prescription & Clearance Viewer
 */
fun demonstrateStudentFeatures() {
    println("\n" + "=".repeat(60))
    println("📱 STUDENT & STAFF MODULE FEATURES")
    println("=".repeat(60))
    
    val studentUser = AppConfig.userRepository.findByEmail("student@university.edu.ph")!!
    val studentProfile = AppConfig.profileService.getStudentProfile(studentUser.id)!!
    
    // 1. View Digital Health Profile
    println("\n1️⃣  DIGITAL HEALTH PROFILE")
    println("-".repeat(40))
    println("Student ID: ${studentProfile.studentId}")
    println("Name: ${studentUser.firstName} ${studentUser.lastName}")
    println("Course: ${studentProfile.course} (Year ${studentProfile.yearLevel})")
    println("Blood Type: ${studentProfile.bloodType}")
    println("Allergies: ${studentProfile.allergies.joinToString(", ")}")
    println("Pre-existing Conditions: ${studentProfile.preExistingConditions.joinToString(", ")}")
    println("Emergency Contact: ${studentProfile.emergencyContactName} (${studentProfile.emergencyContactNumber})")
    
    // 2. Generate QR Code Health Pass
    println("\n2️⃣  QR CODE HEALTH PASS")
    println("-".repeat(40))
    try {
        val qrFile = QRCodeGenerator.generateHealthPassQR(
            userId = studentUser.id,
            userName = "${studentUser.firstName} ${studentUser.lastName}",
            bloodType = studentProfile.bloodType
        )
        println("✓ Health Pass QR generated: $qrFile")
        println("  Students can show this QR code for touchless check-in at the clinic")
    } catch (e: Exception) {
        println("⚠ QR generation skipped (ZXing library may need initialization)")
    }
    
    // 3. Book an Appointment (Consultation Scheduler)
    println("\n3️⃣  CONSULTATION SCHEDULER")
    println("-".repeat(40))
    val doctor = AppConfig.userRepository.findByEmail("doctor@university.edu.ph")!!
    val appointmentTime = LocalDate.now().plusDays(1)
        .atStartOfDay(ZoneId.systemDefault())
        .plusHours(9) // 9 AM tomorrow
        .toInstant()
        .toEpochMilli()
    
    val appointment = AppConfig.appointmentService.bookAppointment(
        patientId = studentUser.id,
        patientName = "${studentUser.firstName} ${studentUser.lastName}",
        doctorId = doctor.id,
        doctorName = "Dr. ${doctor.lastName}",
        appointmentType = AppointmentType.PHYSICAL,
        reason = "Regular check-up for sports clearance",
        scheduledTime = appointmentTime,
        duration = 30,
        userId = studentUser.id
    )
    println("✓ Appointment booked!")
    println("  Appointment ID: ${appointment.id}")
    println("  Doctor: Dr. ${doctor.lastName}")
    println("  Date/Time: ${java.time.Instant.ofEpochMilli(appointment.scheduledTime)}")
    println("  Type: ${appointment.appointmentType}")
    println("  Reason: ${appointment.reason}")
    
    // Generate QR code for appointment check-in
    try {
        val aptQR = QRCodeGenerator.generateAppointmentQR(appointment.id, "${studentUser.firstName} ${studentUser.lastName}")
        println("✓ Appointment QR generated: $aptQR")
        println("  Scan this QR at the clinic to check in")
    } catch (e: Exception) {
        println("⚠ Appointment QR generation skipped")
    }
    
    // 4. View Prescriptions (after consultation)
    println("\n4️⃣  PRESCRIPTION VIEWER")
    println("-".repeat(40))
    // First, simulate a consultation with prescription
    val consultation = ConsultationRecord(
        id = "CONS-001",
        appointmentId = appointment.id,
        patientId = studentUser.id,
        doctorId = doctor.id,
        consultationDate = System.currentTimeMillis(),
        chiefComplaint = "Needs sports clearance",
        diagnosis = "Fit for sports activities",
        treatment = "No treatment needed",
        vitalSigns = VitalSigns(
            temperature = 36.5,
            bloodPressure = "120/80",
            heartRate = 72,
            respiratoryRate = 16,
            oxygenSaturation = 99,
            weight = 65.0,
            height = 170.0
        ),
        prescriptions = listOf(
            Prescription(
                id = "PRESC-001",
                medicationName = "Vitamin C 500mg",
                dosage = "500mg",
                frequency = "Once daily",
                duration = "30 days",
                instructions = "Take after breakfast",
                prescribedBy = doctor.id
            )
        )
    )
    AppConfig.emrService.createConsultation(consultation, doctor.id)
    
    val prescriptions = AppConfig.emrService.getPrescriptionsForPatient(studentUser.id)
    println("Found ${prescriptions.size} prescription(s):")
    prescriptions.forEach { presc ->
        println("  • ${presc.medicationName} - ${presc.dosage}")
        println("    Frequency: ${presc.frequency}, Duration: ${presc.duration}")
        println("    Instructions: ${presc.instructions}")
    }
    
    // 5. View Medical Clearances
    println("\n5️⃣  MEDICAL CLEARANCE VIEWER")
    println("-".repeat(40))
    val clearance = Clearance(
        id = "CLEAR-001",
        patientId = studentUser.id,
        patientName = "${studentUser.firstName} ${studentUser.lastName}",
        clearanceType = ClearanceType.FITNESS_FOR_SPORTS,
        purpose = "Intramural Sports Event 2024",
        medicalFitness = true,
        restrictions = listOf("Stay hydrated during activities"),
        validUntil = System.currentTimeMillis() + (90 * 24 * 60 * 60 * 1000L), // 90 days
        issuedBy = doctor.id,
        digitalSignature = "DIGITAL_SIG_${System.currentTimeMillis()}"
    )
    AppConfig.emrService.issueClearance(consultation.id, clearance, doctor.id)
    
    val clearances = AppConfig.emrService.getClearancesForPatient(studentUser.id)
    println("Found ${clearances.size} clearance(s):")
    clearances.forEach { clear ->
        println("  • Type: ${clear.clearanceType}")
        println("    Purpose: ${clear.purpose}")
        println("    Medical Fitness: ${if (clear.medicalFitness) "✓ FIT" else "✗ NOT FIT"}")
        println("    Valid Until: ${java.time.Instant.ofEpochMilli(clear.validUntil)}")
        if (clear.restrictions.isNotEmpty()) {
            println("    Restrictions: ${clear.restrictions.joinToString(", ")}")
        }
    }
    
    println("\n✅ Student module features demonstrated successfully!")
}

/**
 * Demonstrates Doctor/Clinic Module features:
 * - Electronic Medical Records (EMR)
 * - Live Queue Dashboard
 * - Digital Issuance
 */
fun demonstrateDoctorFeatures() {
    println("\n" + "=".repeat(60))
    println("👨‍⚕️ CLINIC & EMR MODULE FEATURES (Doctor/Nurse Side)")
    println("=".repeat(60))
    
    val doctor = AppConfig.userRepository.findByEmail("doctor@university.edu.ph")!!
    
    // 1. View EMR - Patient History
    println("\n1️⃣  ELECTRONIC MEDICAL RECORDS (EMR)")
    println("-".repeat(40))
    val student = AppConfig.userRepository.findByEmail("student@university.edu.ph")!!
    val patientHistory = AppConfig.emrService.getPatientHistory(student.id)
    println("Patient: ${student.firstName} ${student.lastName}")
    println("Total consultations: ${patientHistory.size}")
    patientHistory.forEach { record ->
        println("\n  Consultation: ${record.id}")
        println("    Date: ${java.time.Instant.ofEpochMilli(record.consultationDate)}")
        println("    Chief Complaint: ${record.chiefComplaint}")
        println("    Diagnosis: ${record.diagnosis}")
        println("    Treatment: ${record.treatment}")
        if (record.vitalSigns != null) {
            println("    Vital Signs:")
            println("      - BP: ${record.vitalSigns.bloodPressure}")
            println("      - Temp: ${record.vitalSigns.temperature}°C")
            println("      - HR: ${record.vitalSigns.heartRate} BPM")
        }
    }
    
    // 2. Live Queue Dashboard
    println("\n2️⃣  LIVE QUEUE DASHBOARD")
    println("-".repeat(40))
    // Simulate walk-in patients
    val walkIn1 = AppConfig.queueRepository.addPatient(
        patientId = student.id,
        patientName = "${student.firstName} ${student.lastName}",
        entryType = QueueEntryType.WALK_IN,
        priority = PriorityLevel.NORMAL
    )
    
    val staff = AppConfig.userRepository.findByEmail("staff@university.edu.ph")!!
    val walkIn2 = AppConfig.queueRepository.addPatient(
        patientId = staff.id,
        patientName = "${staff.firstName} ${staff.lastName}",
        entryType = QueueEntryType.WALK_IN,
        priority = PriorityLevel.URGENT
    )
    
    val waitingPatients = AppConfig.queueRepository.getWaitingPatients()
    println("Current Queue: ${waitingPatients.size} patient(s) waiting")
    waitingPatients.forEach { patient ->
        val priorityIcon = when (patient.priority) {
            PriorityLevel.EMERGENCY -> "🚨"
            PriorityLevel.URGENT -> "⚠️"
            PriorityLevel.NORMAL -> "👤"
        }
        println("  $priorityIcon Queue #${patient.queueNumber}: ${patient.patientName}")
        println("     Type: ${patient.entryType}, Wait Time: ~${patient.estimatedWaitTime} mins")
    }
    
    // Call next patient
    val nextPatient = AppConfig.queueRepository.callNextPatient(doctor.id)
    if (nextPatient != null) {
        println("\n→ Calling next patient: ${nextPatient.patientName} (Queue #${nextPatient.queueNumber})")
    }
    
    // 3. Digital Issuance (Prescription & Clearance)
    println("\n3️⃣  DIGITAL ISSUANCE")
    println("-".repeat(40))
    println("Doctors can digitally sign and issue:")
    println("  • Medical Prescriptions")
    println("  • Medical Clearances (OJT, Sports, Work)")
    println("  • Medical Certificates")
    println("\n✓ Digital signatures ensure document authenticity")
    println("✓ Documents can be downloaded by patients instantly")
    
    println("\n✅ Clinic/EMR module features demonstrated successfully!")
}

/**
 * Demonstrates Nurse features:
 * - Medicine Inventory Management
 * - Queue Management
 */
fun demonstrateNurseFeatures() {
    println("\n" + "=".repeat(60))
    println("👩‍⚕️ NURSE MODULE FEATURES")
    println("=".repeat(60))
    
    val nurse = AppConfig.userRepository.findByEmail("nurse@university.edu.ph")!!
    
    // 1. Medicine Inventory Management
    println("\n1️⃣  MEDICINE INVENTORY MANAGEMENT")
    println("-".repeat(40))
    
    val inventorySummary = AppConfig.inventoryService.getInventorySummary()
    println("Inventory Summary:")
    println("  Total Items: ${inventorySummary.totalItems}")
    println("  Low Stock Alerts: ${inventorySummary.lowStockCount}")
    println("  Expired Items: ${inventorySummary.expiredCount}")
    
    println("\nMedicine Stock Levels:")
    val allMedicines = AppConfig.inventoryService.getLowStockAlerts()
    if (allMedicines.isEmpty()) {
        println("  ✓ All medicines are adequately stocked")
    }
    
    // Show some inventory items
    val medicines = listOf(
        Triple("Paracetamol 500mg", 500, "tablets"),
        Triple("Amoxicillin 250mg", 200, "capsules"),
        Triple("Salbutamol Inhaler", 30, "inhalers")
    )
    medicines.forEach { (name, stock, unit) ->
        println("  • $name: $stock $unit")
    }
    
    // Simulate dispensing medicine
    println("\nSimulating medicine dispensing...")
    val medToDispense = "MED-001" // Paracetamol
    val dispensed = AppConfig.inventoryService.dispenseMedicine(medToDispense, 10, nurse.id)
    if (dispensed != null) {
        println("  ✓ Dispensed 10 tablets of Paracetamol")
        println("    Remaining stock: ${dispensed.quantityInStock}")
    }
    
    // Check for low stock alerts
    val lowStock = AppConfig.inventoryService.getLowStockAlerts()
    if (lowStock.isNotEmpty()) {
        println("\n⚠️  LOW STOCK ALERTS:")
        lowStock.forEach { med ->
            println("  • ${med.name}: Only ${med.quantityInStock} ${med.unit} left!")
        }
    } else {
        println("\n✓ No low stock alerts")
    }
    
    // Check for expiring medicines
    val expiringSoon = AppConfig.inventoryService.getExpiringSoon(60)
    if (expiringSoon.isNotEmpty()) {
        println("\n⚠️  EXPIRING SOON (within 60 days):")
        expiringSoon.forEach { med ->
            val expiryDate = java.time.Instant.ofEpochMilli(med.expirationDate)
            println("  • ${med.name}: Expires on $expiryDate")
        }
    } else {
        println("\n✓ No medicines expiring soon")
    }
    
    println("\n✅ Nurse module features demonstrated successfully!")
}

/**
 * Demonstrates Admin Module features:
 * - Role-Based Access Control
 * - Data Privacy Compliance
 * - User Management
 */
fun demonstrateAdminFeatures() {
    println("\n" + "=".repeat(60))
    println("🔐 SYSTEM ADMIN MODULE FEATURES")
    println("=".repeat(60))
    
    val admin = AppConfig.userRepository.findByEmail("admin@university.edu.ph")!!
    
    // 1. Role-Based Access Control
    println("\n1️⃣  ROLE-BASED ACCESS CONTROL (RBAC)")
    println("-".repeat(40))
    println("System Roles:")
    val roles = listOf(UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE, UserRole.DENTIST, UserRole.STUDENT, UserRole.STAFF, UserRole.EMERGENCY_PERSONNEL)
    roles.forEach { role ->
        println("  • ${role.name}")
    }
    
    println("\nPermission Matrix:")
    println("  ADMIN: Full system access")
    println("  DOCTOR: View/Edit EMR, Prescribe, Issue Clearances")
    println("  NURSE: View/Edit EMR, Manage Inventory, Manage Queue")
    println("  DENTIST: View/Edit EMR, Manage Dental Records")
    println("  STUDENT/STAFF: View own profile, Book appointments, View prescriptions")
    println("  EMERGENCY: View SOS alerts, Respond to emergencies")
    
    // Demonstrate permission checking
    println("\nPermission Check Example:")
    val student = AppConfig.userRepository.findByEmail("student@university.edu.ph")!!
    val canBookAppointment = AppConfig.authService.hasPermission(student, Permission.BOOK_APPOINTMENT)
    val canViewEMR = AppConfig.authService.hasPermission(student, Permission.VIEW_EMR)
    println("  Student can book appointment: ${if (canBookAppointment) "✓ Yes" else "✗ No"}")
    println("  Student can view EMR: ${if (canViewEMR) "✓ Yes" else "✗ No"}")
    
    // 2. User Management
    println("\n2️⃣  USER MANAGEMENT")
    println("-".repeat(40))
    val allUsers = AppConfig.userRepository.findAll()
    println("Total registered users: ${allUsers.size}")
    println("\nUsers by Role:")
    roles.forEach { role ->
        val count = allUsers.count { it.role == role }
        if (count > 0) {
            println("  ${role.name}: $count user(s)")
        }
    }
    
    // 3. Data Privacy Compliance
    println("\n3️⃣  DATA PRIVACY COMPLIANCE")
    println("-".repeat(40))
    println("Philippine Data Privacy Act of 2012 Compliance Features:")
    println("  ✓ Audit logging of all system actions")
    println("  ✓ Role-based access control")
    println("  ✓ Data encryption (placeholder - implement AES-256 in production)")
    println("  ✓ Immutable audit logs (cannot be modified or deleted)")
    println("  ✓ Patient consent management")
    println("  ✓ Right to access personal data")
    println("  ✓ Right to data portability")
    
    // Show audit log example
    println("\nRecent Audit Log Entries:")
    val recentLogs = AppConfig.auditLogRepository.findAll().take(5)
    recentLogs.forEach { log ->
        println("  [${java.time.Instant.ofEpochMilli(log.timestamp)}]")
        println("    User: ${log.userId} | Action: ${log.action}")
        println("    Resource: ${log.resourceType}/${log.resourceId ?: "N/A"}")
    }
    
    // 4. Health Analytics
    println("\n4️⃣  HEALTH ANALYTICS")
    println("-".repeat(40))
    val now = System.currentTimeMillis()
    val thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000L)
    val report = AppConfig.analyticsService.generateHealthReport(thirtyDaysAgo, now)
    
    println("Campus Health Report (Last 30 Days):")
    println("  Total Consultations: ${report.totalConsultations}")
    println("  Total Appointments: ${report.totalAppointments}")
    println("  Total Emergencies: ${report.totalEmergencies}")
    println("  Average Wait Time: ${report.averageWaitTime} minutes")
    
    if (report.topDiagnoses.isNotEmpty()) {
        println("\n  Top Diagnoses:")
        report.topDiagnoses.take(5).forEach { (diagnosis, count) ->
            println("    • $diagnosis: $count case(s)")
        }
    }
    
    println("\n✅ Admin module features demonstrated successfully!")
}

/**
 * Demonstrates Emergency Response features:
 * - SOS Panic Button
 * - Emergency Alert Management
 */
fun demonstrateEmergencyFeatures() {
    println("\n" + "=".repeat(60))
    println("🚨 SOS EMERGENCY RESPONSE FEATURES")
    println("=".repeat(60))
    
    val student = AppConfig.userRepository.findByEmail("student@university.edu.ph")!!
    val studentProfile = AppConfig.profileService.getStudentProfile(student.id)!!
    
    // 1. SOS Panic Button
    println("\n1️⃣  SOS PANIC BUTTON")
    println("-".repeat(40))
    println("Simulating emergency situation...")
    
    val emergencyLocation = Location(
        latitude = 14.6507,
        longitude = 121.0734,
        building = "Science Building",
        floor = "3rd Floor",
        room = "Room 301",
        description = "Computer Laboratory 3 - Student collapsed during exam"
    )
    
    val sosAlert = AppConfig.sosService.triggerSOS(
        userId = student.id,
        userName = "${student.firstName} ${student.lastName}",
        userProfile = "Student ID: ${studentProfile.studentId}, Blood Type: ${studentProfile.bloodType}, Allergies: ${studentProfile.allergies.joinToString(",")}",
        location = emergencyLocation,
        alertType = SOSAlertType.MEDICAL_EMERGENCY
    )
    
    println("\n✓ SOS Alert Triggered!")
    println("  Alert ID: ${sosAlert.id}")
    println("  Patient: ${sosAlert.userName}")
    println("  Alert Type: ${sosAlert.alertType.name}")
    println("  Location: ${sosAlert.location.building}, ${sosAlert.location.room}")
    println("  Time: ${java.time.Instant.ofEpochMilli(sosAlert.timestamp)}")
    println("\n  📢 Emergency response team has been notified!")
    println("  📍 Location and medical profile sent to responders")
    
    // 2. Active Alerts Dashboard
    println("\n2️⃣  ACTIVE EMERGENCY ALERTS")
    println("-".repeat(40))
    val activeAlerts = AppConfig.sosService.getActiveAlerts()
    println("Active Alerts: ${activeAlerts.size}")
    activeAlerts.forEach { alert ->
        val urgencyIcon = when (alert.alertType) {
            SOSAlertType.CARDIAC_EVENT -> "❤️‍🔥"
            SOSAlertType.SEVERE_ALLERGIC_REACTION -> "🥜"
            SOSAlertType.SEIZURE -> "⚡"
            SOSAlertType.ACCIDENT -> "🚑"
            else -> "🆘"
        }
        println("  $urgencyIcon ${alert.userName} - ${alert.alertType.name}")
        println("     Location: ${alert.location.description}")
    }
    
    // 3. Resolve Emergency
    println("\n3️⃣  EMERGENCY RESPONSE RESOLUTION")
    println("-".repeat(40))
    val responder = AppConfig.userRepository.findByEmail("nurse@university.edu.ph")!!
    val resolved = AppConfig.sosService.resolveSOS(
        alertId = sosAlert.id,
        responderId = responder.id,
        notes = "Patient stabilized. Administered first aid. Transferred to hospital for further evaluation."
    )
    
    if (resolved != null) {
        println("✓ Emergency resolved by: ${responder.firstName} ${responder.lastName}")
        println("  Response Time: ${(resolved.responseTime!! - resolved.timestamp) / 1000} seconds")
        println("  Notes: ${resolved.notes}")
    }
    
    println("\n✅ Emergency response features demonstrated successfully!")
}
