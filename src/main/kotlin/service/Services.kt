package service

import model.*
import repository.*
import util.QRCodeGenerator
import java.util.UUID

/**
 * Service for managing user authentication and authorization.
 * Implements Role-Based Access Control (RBAC) for the system.
 */
class AuthService(
    private val userRepository: UserRepository,
    private val auditLogRepository: AuditLogRepository
) {
    
    /**
     * Authenticates a user with email and password.
     * In production, use proper password hashing (bcrypt, argon2).
     */
    fun login(email: String, password: String, ipAddress: String?): AuthResult {
        val user = userRepository.findByEmail(email) 
            ?: return AuthResult(false, "Invalid credentials")
        
        if (!user.isActive) {
            return AuthResult(false, "Account is deactivated")
        }
        
        // Simple password check - replace with proper hash verification in production
        if (user.passwordHash != hashPassword(password)) {
            auditLogRepository.logAction(
                userId = user.id,
                action = "LOGIN_FAILED",
                resourceType = "USER",
                resourceId = user.id,
                ipAddress = ipAddress,
                details = "Failed login attempt"
            )
            return AuthResult(false, "Invalid credentials")
        }
        
        auditLogRepository.logAction(
            userId = user.id,
            action = "LOGIN_SUCCESS",
            resourceType = "USER",
            resourceId = user.id,
            ipAddress = ipAddress,
            details = "Successful login"
        )
        
        return AuthResult(true, "Login successful", user)
    }
    
    /**
     * Registers a new user in the system.
     * Used by admins to create student/staff accounts.
     */
    fun registerUser(
        email: String,
        password: String,
        firstName: String,
        lastName: String,
        role: UserRole,
        phoneNumber: String,
        adminId: String
    ): User {
        // Check if email already exists
        if (userRepository.findByEmail(email) != null) {
            throw IllegalArgumentException("Email already registered")
        }
        
        val user = User(
            id = "U-${UUID.randomUUID()}",
            email = email,
            passwordHash = hashPassword(password),
            firstName = firstName,
            lastName = lastName,
            role = role,
            phoneNumber = phoneNumber
        )
        
        val savedUser = userRepository.save(user)
        
        auditLogRepository.logAction(
            userId = adminId,
            action = "USER_CREATED",
            resourceType = "USER",
            resourceId = savedUser.id,
            ipAddress = null,
            details = "Created user with role ${role.name}"
        )
        
        return savedUser
    }
    
    /**
     * Checks if a user has permission to perform an action.
     * Implements Role-Based Access Control.
     */
    fun hasPermission(user: User, permission: Permission): Boolean {
        return when (user.role) {
            UserRole.ADMIN -> true // Admin has all permissions
            UserRole.DOCTOR -> when (permission) {
                Permission.VIEW_EMR, Permission.EDIT_EMR, 
                Permission.PRESCRIBE_MEDICATION, Permission.ISSUE_CLEARANCE,
                Permission.VIEW_APPOINTMENTS, Permission.MANAGE_APPOINTMENTS -> true
                else -> false
            }
            UserRole.NURSE -> when (permission) {
                Permission.VIEW_EMR, Permission.EDIT_EMR,
                Permission.MANAGE_INVENTORY, Permission.VIEW_APPOINTMENTS,
                Permission.MANAGE_QUEUE -> true
                else -> false
            }
            UserRole.DENTIST -> when (permission) {
                Permission.VIEW_EMR, Permission.EDIT_EMR,
                Permission.MANAGE_DENTAL_RECORDS, Permission.VIEW_APPOINTMENTS -> true
                else -> false
            }
            UserRole.STUDENT, UserRole.STAFF -> when (permission) {
                Permission.VIEW_OWN_PROFILE, Permission.EDIT_OWN_PROFILE,
                Permission.BOOK_APPOINTMENT, Permission.VIEW_OWN_PRESCRIPTIONS,
                Permission.VIEW_OWN_CLEARANCES, Permission.GENERATE_QR -> true
                else -> false
            }
            UserRole.EMERGENCY_PERSONNEL -> when (permission) {
                Permission.VIEW_SOS_ALERTS, Permission.RESPOND_TO_SOS -> true
                else -> false
            }
        }
    }
    
    /**
     * Simple password hashing - replace with bcrypt/argon2 in production.
     */
    private fun hashPassword(password: String): String {
        // WARNING: This is NOT secure for production!
        // Use BCrypt.encodeToString(BCrypt.hashpw(password, BCrypt.gensalt()))
        return "hash_$password"
    }
    
    /**
     * Updates user role (Admin only).
     */
    fun updateUserRole(userId: String, newRole: UserRole, adminId: String): User {
        val user = userRepository.findById(userId) 
            ?: throw IllegalArgumentException("User not found")
        
        val updated = user.copy(role = newRole)
        val saved = userRepository.update(updated)
        
        auditLogRepository.logAction(
            userId = adminId,
            action = "ROLE_UPDATED",
            resourceType = "USER",
            resourceId = userId,
            ipAddress = null,
            details = "Changed role from ${user.role.name} to ${newRole.name}"
        )
        
        return saved
    }
    
    /**
     * Deactivates a user account.
     */
    fun deactivateUser(userId: String, adminId: String) {
        val user = userRepository.findById(userId) 
            ?: throw IllegalArgumentException("User not found")
        
        val updated = user.copy(isActive = false)
        userRepository.update(updated)
        
        auditLogRepository.logAction(
            userId = adminId,
            action = "USER_DEACTIVATED",
            resourceType = "USER",
            resourceId = userId,
            ipAddress = null,
            details = "Account deactivated"
        )
    }
}

/**
 * Authentication result container.
 */
data class AuthResult(
    val success: Boolean,
    val message: String,
    val user: User? = null
)

/**
 * Permissions for Role-Based Access Control.
 */
enum class Permission {
    // Student/Staff permissions
    VIEW_OWN_PROFILE,
    EDIT_OWN_PROFILE,
    BOOK_APPOINTMENT,
    VIEW_OWN_PRESCRIPTIONS,
    VIEW_OWN_CLEARANCES,
    GENERATE_QR,
    
    // Medical staff permissions
    VIEW_EMR,
    EDIT_EMR,
    PRESCRIBE_MEDICATION,
    ISSUE_CLEARANCE,
    MANAGE_DENTAL_RECORDS,
    MANAGE_INVENTORY,
    MANAGE_QUEUE,
    VIEW_APPOINTMENTS,
    MANAGE_APPOINTMENTS,
    
    // Emergency permissions
    VIEW_SOS_ALERTS,
    RESPOND_TO_SOS,
    
    // Admin permissions
    MANAGE_USERS,
    VIEW_AUDIT_LOGS,
    SYSTEM_CONFIG
}

/**
 * Service for managing student and staff health profiles.
 * Handles Digital Health Profile features.
 */
class ProfileService(
    private val studentProfileRepo: StudentProfileRepository,
    private val staffProfileRepo: StaffProfileRepository,
    private val auditLogRepository: AuditLogRepository
) {
    
    /**
     * Creates a health profile for a student.
     */
    fun createStudentProfile(profile: StudentProfile, userId: String): StudentProfile {
        val saved = studentProfileRepo.save(profile)
        
        auditLogRepository.logAction(
            userId = userId,
            action = "PROFILE_CREATED",
            resourceType = "STUDENT_PROFILE",
            resourceId = profile.userId,
            ipAddress = null,
            details = "Student health profile created"
        )
        
        return saved
    }
    
    /**
     * Creates a health profile for a staff member.
     */
    fun createStaffProfile(profile: StaffProfile, userId: String): StaffProfile {
        val saved = staffProfileRepo.save(profile)
        
        auditLogRepository.logAction(
            userId = userId,
            action = "PROFILE_CREATED",
            resourceType = "STAFF_PROFILE",
            resourceId = profile.userId,
            ipAddress = null,
            details = "Staff health profile created"
        )
        
        return saved
    }
    
    /**
     * Updates a student's health profile.
     */
    fun updateStudentProfile(profile: StudentProfile, userId: String): StudentProfile {
        val saved = studentProfileRepo.update(profile)
        
        auditLogRepository.logAction(
            userId = userId,
            action = "PROFILE_UPDATED",
            resourceType = "STUDENT_PROFILE",
            resourceId = profile.userId,
            ipAddress = null,
            details = "Student health profile updated"
        )
        
        return saved
    }
    
    /**
     * Gets a student's health profile.
     */
    fun getStudentProfile(userId: String): StudentProfile? {
        return studentProfileRepo.findById(userId)
    }
    
    /**
     * Gets a staff member's health profile.
     */
    fun getStaffProfile(userId: String): StaffProfile? {
        return staffProfileRepo.findById(userId)
    }
    
    /**
     * Searches for allergies in a patient's profile.
     * Critical for emergency response and prescription safety.
     */
    fun getAllergies(userId: String): List<String> {
        return studentProfileRepo.findById(userId)?.allergies 
            ?: staffProfileRepo.findById(userId)?.allergies 
            ?: emptyList()
    }
    
    /**
     * Gets blood type for emergency purposes.
     */
    fun getBloodType(userId: String): String? {
        return studentProfileRepo.findById(userId)?.bloodType 
            ?: staffProfileRepo.findById(userId)?.bloodType
    }
}

/**
 * Service for managing appointments (Consultation Scheduler).
 * Handles booking, cancellation, and QR code check-in.
 */
class AppointmentService(
    private val appointmentRepo: AppointmentRepository,
    private val queueRepo: QueueRepository,
    private val auditLogRepository: AuditLogRepository
) {
    
    /**
     * Books a new appointment for a patient.
     */
    fun bookAppointment(
        patientId: String,
        patientName: String,
        doctorId: String,
        doctorName: String,
        appointmentType: AppointmentType,
        reason: String,
        scheduledTime: Long,
        duration: Int = 30,
        userId: String
    ): Appointment {
        val appointment = Appointment(
            id = "APT-${UUID.randomUUID()}",
            patientId = patientId,
            patientName = patientName,
            doctorId = doctorId,
            doctorName = doctorName,
            appointmentType = appointmentType,
            reason = reason,
            scheduledTime = scheduledTime,
            duration = duration
        )
        
        val saved = appointmentRepo.save(appointment)
        
        auditLogRepository.logAction(
            userId = userId,
            action = "APPOINTMENT_BOOKED",
            resourceType = "APPOINTMENT",
            resourceId = saved.id,
            ipAddress = null,
            details = "Booked appointment with Dr. $doctorName"
        )
        
        return saved
    }
    
    /**
     * Cancels an appointment.
     */
    fun cancelAppointment(appointmentId: String, userId: String): Appointment {
        val appointment = appointmentRepo.findById(appointmentId)
            ?: throw IllegalArgumentException("Appointment not found")
        
        val updated = appointment.copy(status = AppointmentStatus.CANCELLED)
        val saved = appointmentRepo.update(updated)
        
        auditLogRepository.logAction(
            userId = userId,
            action = "APPOINTMENT_CANCELLED",
            resourceType = "APPOINTMENT",
            resourceId = appointmentId,
            ipAddress = null,
            details = "Appointment cancelled"
        )
        
        return saved
    }
    
    /**
     * Checks in a patient using QR code scan.
     * Adds patient to the live queue.
     */
    fun checkInPatient(appointmentId: String, userId: String): QueueEntry {
        val appointment = appointmentRepo.findById(appointmentId)
            ?: throw IllegalArgumentException("Appointment not found")
        
        // Update appointment status
        val updatedAppointment = appointment.copy(status = AppointmentStatus.CHECKED_IN)
        appointmentRepo.update(updatedAppointment)
        
        // Add to queue
        val queueEntry = queueRepo.addPatient(
            patientId = appointment.patientId,
            patientName = appointment.patientName,
            entryType = QueueEntryType.SCHEDULED
        )
        
        auditLogRepository.logAction(
            userId = userId,
            action = "PATIENT_CHECKED_IN",
            resourceType = "QUEUE",
            resourceId = queueEntry.id,
            ipAddress = null,
            details = "Patient checked in via QR code"
        )
        
        return queueEntry
    }
    
    /**
     * Gets all appointments for a patient.
     */
    fun getAppointmentsForPatient(patientId: String): List<Appointment> {
        return appointmentRepo.findByPatientId(patientId)
    }
    
    /**
     * Gets all appointments for a doctor.
     */
    fun getAppointmentsForDoctor(doctorId: String): List<Appointment> {
        return appointmentRepo.findByDoctorId(doctorId)
    }
    
    /**
     * Updates appointment status.
     */
    fun updateAppointmentStatus(appointmentId: String, status: AppointmentStatus): Appointment {
        val appointment = appointmentRepo.findById(appointmentId)
            ?: throw IllegalArgumentException("Appointment not found")
        
        return appointmentRepo.update(appointment.copy(status = status))
    }
}

/**
 * Service for Electronic Medical Records (EMR).
 * Core module for digitizing health records.
 */
class EMRService(
    private val consultationRepo: ConsultationRecordRepository,
    private val auditLogRepository: AuditLogRepository
) {
    
    /**
     * Creates a new consultation record.
     */
    fun createConsultation(record: ConsultationRecord, userId: String): ConsultationRecord {
        val saved = consultationRepo.save(record)
        
        auditLogRepository.logAction(
            userId = userId,
            action = "CONSULTATION_CREATED",
            resourceType = "EMR",
            resourceId = saved.id,
            ipAddress = null,
            details = "New consultation record created"
        )
        
        return saved
    }
    
    /**
     * Gets all consultation records for a patient.
     */
    fun getPatientHistory(patientId: String): List<ConsultationRecord> {
        return consultationRepo.findByPatientId(patientId)
    }
    
    /**
     * Adds a prescription to a consultation record.
     */
    fun addPrescription(consultationId: String, prescription: Prescription, userId: String): ConsultationRecord {
        val record = consultationRepo.findById(consultationId)
            ?: throw IllegalArgumentException("Consultation record not found")
        
        val updatedPrescriptions = record.prescriptions + prescription
        val updated = record.copy(prescriptions = updatedPrescriptions)
        
        val saved = consultationRepo.update(updated)
        
        auditLogRepository.logAction(
            userId = userId,
            action = "PRESCRIPTION_ADDED",
            resourceType = "EMR",
            resourceId = consultationId,
            ipAddress = null,
            details = "Prescription added: ${prescription.medicationName}"
        )
        
        return saved
    }
    
    /**
     * Issues a medical clearance.
     */
    fun issueClearance(
        consultationId: String,
        clearance: Clearance,
        userId: String
    ): ConsultationRecord {
        val record = consultationRepo.findById(consultationId)
            ?: throw IllegalArgumentException("Consultation record not found")
        
        val updated = record.copy(clearanceIssued = clearance)
        val saved = consultationRepo.update(updated)
        
        auditLogRepository.logAction(
            userId = userId,
            action = "CLEARANCE_ISSUED",
            resourceType = "EMR",
            resourceId = consultationId,
            ipAddress = null,
            details = "Clearance issued: ${clearance.clearanceType.name}"
        )
        
        return saved
    }
    
    /**
     * Gets prescriptions for a patient.
     */
    fun getPrescriptionsForPatient(patientId: String): List<Prescription> {
        return consultationRepo.findByPatientId(patientId)
            .flatMap { it.prescriptions }
    }
    
    /**
     * Gets clearances for a patient.
     */
    fun getClearancesForPatient(patientId: String): List<Clearance> {
        return consultationRepo.findByPatientId(patientId)
            .mapNotNull { it.clearanceIssued }
    }
}

/**
 * Service for SOS Emergency Response System.
 * Handles panic button alerts and emergency coordination.
 */
class SOSService(
    private val sosRepo: SOSAlertRepository,
    private val auditLogRepository: AuditLogRepository
) {
    
    /**
     * Triggers an SOS alert (Panic Button).
     * Immediately notifies emergency response team.
     */
    fun triggerSOS(
        userId: String,
        userName: String,
        userProfile: String,
        location: Location,
        alertType: SOSAlertType
    ): SOSAlert {
        val alert = SOSAlert(
            id = "SOS-${UUID.randomUUID()}",
            userId = userId,
            userName = userName,
            userProfile = userProfile,
            location = location,
            alertType = alertType
        )
        
        val saved = sosRepo.save(alert)
        
        auditLogRepository.logAction(
            userId = userId,
            action = "SOS_TRIGGERED",
            resourceType = "SOS_ALERT",
            resourceId = saved.id,
            ipAddress = null,
            details = "Emergency alert triggered at ${location.building ?: "Unknown location"}"
        )
        
        // In production: Send push notifications, SMS, emails to emergency team
        notifyEmergencyTeam(saved)
        
        return saved
    }
    
    /**
     * Resolves an SOS alert after response.
     */
    fun resolveSOS(alertId: String, responderId: String, notes: String?): SOSAlert? {
        val resolved = sosRepo.resolveAlert(alertId, responderId)
        
        if (resolved != null) {
            auditLogRepository.logAction(
                userId = responderId,
                action = "SOS_RESOLVED",
                resourceType = "SOS_ALERT",
                resourceId = alertId,
                ipAddress = null,
                details = notes ?: "Alert resolved"
            )
        }
        
        return resolved
    }
    
    /**
     * Gets all active (unresolved) SOS alerts.
     */
    fun getActiveAlerts(): List<SOSAlert> {
        return sosRepo.getActiveAlerts()
    }
    
    /**
     * Notifies emergency response team.
     * In production, integrate with SMS gateway, push notifications, etc.
     */
    private fun notifyEmergencyTeam(alert: SOSAlert) {
        println("!!! EMERGENCY ALERT !!!")
        println("Patient: ${alert.userName}")
        println("Type: ${alert.alertType.name}")
        println("Location: ${alert.location.description ?: "${alert.location.latitude}, ${alert.location.longitude}"}")
        println("Time: ${java.time.Instant.ofEpochMilli(alert.timestamp)}")
        println("!!! DISPATCH EMERGENCY TEAM IMMEDIATELY !!!")
    }
}

/**
 * Service for Medicine Inventory Management.
 * Tracks stock levels and generates alerts.
 */
class InventoryService(
    private val inventoryRepo: MedicineInventoryRepository,
    private val auditLogRepository: AuditLogRepository
) {
    
    /**
     * Adds a new medicine to inventory.
     */
    fun addMedicine(medicine: MedicineInventory, userId: String): MedicineInventory {
        val saved = inventoryRepo.save(medicine)
        
        auditLogRepository.logAction(
            userId = userId,
            action = "MEDICINE_ADDED",
            resourceType = "INVENTORY",
            resourceId = saved.id,
            ipAddress = null,
            details = "Added ${medicine.name} to inventory"
        )
        
        return saved
    }
    
    /**
     * Updates medicine quantity after dispensing.
     */
    fun dispenseMedicine(medicineId: String, quantity: Int, userId: String): MedicineInventory? {
        val updated = inventoryRepo.updateQuantity(medicineId, quantity)
        
        if (updated != null) {
            auditLogRepository.logAction(
                userId = userId,
                action = "MEDICINE_DISPENSED",
                resourceType = "INVENTORY",
                resourceId = medicineId,
                ipAddress = null,
                details = "Dispensed $quantity units"
            )
        }
        
        return updated
    }
    
    /**
     * Gets low stock alerts.
     */
    fun getLowStockAlerts(): List<MedicineInventory> {
        return inventoryRepo.getLowStockMedicines()
    }
    
    /**
     * Gets expired medicines.
     */
    fun getExpiredMedicines(): List<MedicineInventory> {
        return inventoryRepo.getExpiredMedicines()
    }
    
    /**
     * Gets medicines expiring soon.
     */
    fun getExpiringSoon(days: Int = 30): List<MedicineInventory> {
        return inventoryRepo.getExpiringSoon(days)
    }
    
    /**
     * Restocks a medicine.
     */
    fun restockMedicine(medicineId: String, quantity: Int, userId: String): MedicineInventory {
        val medicine = inventoryRepo.findById(medicineId)
            ?: throw IllegalArgumentException("Medicine not found")
        
        val updated = medicine.copy(
            quantityInStock = medicine.quantityInStock + quantity,
            lastRestocked = System.currentTimeMillis()
        )
        
        val saved = inventoryRepo.update(updated)
        
        auditLogRepository.logAction(
            userId = userId,
            action = "MEDICINE_RESTOCKED",
            resourceType = "INVENTORY",
            resourceId = medicineId,
            ipAddress = null,
            details = "Restocked $quantity units"
        )
        
        return saved
    }
    
    /**
     * Gets inventory summary for analytics.
     */
    fun getInventorySummary(): InventorySummary {
        val allMedicines = inventoryRepo.findAll()
        return InventorySummary(
            totalItems = allMedicines.size,
            lowStockCount = allMedicines.count { it.isLowStock },
            expiredCount = allMedicines.count { it.isExpired },
            totalValue = 0.0 // Calculate based on cost if available
        )
    }
}

/**
 * Inventory summary data class.
 */
data class InventorySummary(
    val totalItems: Int,
    val lowStockCount: Int,
    val expiredCount: Int,
    val totalValue: Double
)

/**
 * Service for Health Analytics.
 * Generates campus-wide health reports.
 */
class AnalyticsService(
    private val consultationRepo: ConsultationRecordRepository,
    private val appointmentRepo: AppointmentRepository,
    private val sosRepo: SOSAlertRepository
) {
    
    /**
     * Generates health statistics report.
     */
    fun generateHealthReport(startDate: Long, endDate: Long): HealthReport {
        val consultations = consultationRepo.findByDateRange(startDate, endDate)
        val appointments = appointmentRepo.findByDateRange(startDate, endDate)
        val sosAlerts = sosRepo.findAll().filter { it.timestamp in startDate..endDate }
        
        // Count diagnoses
        val diagnosisCount = consultations.groupBy { it.diagnosis }
            .mapValues { it.value.size }
        
        // Most common illnesses
        val topIllnesses = diagnosisCount.entries.sortedByDescending { it.value }.take(10)
        
        return HealthReport(
            periodStart = startDate,
            periodEnd = endDate,
            totalConsultations = consultations.size,
            totalAppointments = appointments.size,
            totalEmergencies = sosAlerts.size,
            topDiagnoses = topIllnesses,
            appointmentsByType = appointments.groupBy { it.appointmentType }
                .mapValues { it.value.size },
            averageWaitTime = calculateAverageWaitTime(appointments)
        )
    }
    
    private fun calculateAverageWaitTime(appointments: List<Appointment>): Int {
        // Simplified calculation
        return 15 // minutes
    }
}

/**
 * Health report data class.
 */
data class HealthReport(
    val periodStart: Long,
    val periodEnd: Long,
    val totalConsultations: Int,
    val totalAppointments: Int,
    val totalEmergencies: Int,
    val topDiagnoses: List<Map.Entry<String, Int>>,
    val appointmentsByType: Map<AppointmentType, Int>,
    val averageWaitTime: Int
)
