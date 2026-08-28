package model

import kotlinx.serialization.Serializable

/**
 * Represents the role of a user in the system.
 * Used for Role-Based Access Control (RBAC) to manage permissions.
 */
enum class UserRole {
    STUDENT,           // Can access personal health profile, book appointments, view prescriptions
    STAFF,             // Similar to student but with department instead of course
    NURSE,             // Can manage EMR, issue clearances, manage inventory
    DOCTOR,            // Full EMR access, can prescribe medication, sign clearances
    DENTIST,           // Specialized access for dental records and treatments
    ADMIN,             // Full system access including user management and compliance settings
    EMERGENCY_PERSONNEL // Limited access for emergency response (SOS alerts)
}

/**
 * Represents a user in the University Health System.
 * This is the base class for all users (students, staff, medical personnel, admins).
 * 
 * Data Privacy Compliance: All sensitive fields should be encrypted at rest.
 */
@Serializable
data class User(
    val id: String,
    val email: String,
    val passwordHash: String, // In production, use proper password hashing (bcrypt, argon2)
    val firstName: String,
    val lastName: String,
    val role: UserRole,
    val phoneNumber: String,
    val isActive: Boolean = true,
    val createdAt: Long = System.currentTimeMillis()
)

/**
 * Represents a student's health profile.
 * Contains sensitive medical information that must be protected under Philippine Data Privacy Act.
 */
@Serializable
data class StudentProfile(
    val userId: String,
    val studentId: String,
    val course: String,
    val yearLevel: Int,
    val bloodType: String?,
    val allergies: List<String>,          // e.g., ["Peanuts", "Penicillin"]
    val preExistingConditions: List<String>, // e.g., ["Asthma", "Diabetes"]
    val emergencyContactName: String,
    val emergencyContactNumber: String,
    val lastUpdated: Long = System.currentTimeMillis()
)

/**
 * Represents a staff member's health profile.
 * Similar to student but with department instead of course.
 */
@Serializable
data class StaffProfile(
    val userId: String,
    val staffId: String,
    val department: String,
    val position: String,
    val bloodType: String?,
    val allergies: List<String>,
    val preExistingConditions: List<String>,
    val emergencyContactName: String,
    val emergencyContactNumber: String,
    val lastUpdated: Long = System.currentTimeMillis()
)

/**
 * Represents an appointment for consultation.
 * Supports both physical and virtual check-ups.
 */
@Serializable
data class Appointment(
    val id: String,
    val patientId: String,
    val patientName: String,
    val doctorId: String,
    val doctorName: String,
    val appointmentType: AppointmentType,
    val reason: String,
    val scheduledTime: Long,
    val duration: Int, // in minutes
    val status: AppointmentStatus = AppointmentStatus.SCHEDULED,
    val notes: String? = null,
    val createdAt: Long = System.currentTimeMillis()
)

/**
 * Type of appointment - physical or virtual.
 */
@Serializable
enum class AppointmentType {
    PHYSICAL,   // In-person visit to campus clinic
    VIRTUAL     // Remote consultation via video call
}

/**
 * Status of an appointment in the scheduling system.
 */
@Serializable
enum class AppointmentStatus {
    SCHEDULED,   // Appointment is booked
    CHECKED_IN,  // Patient has arrived (via QR code scan)
    IN_PROGRESS, // Currently being attended
    COMPLETED,   // Consultation finished
    CANCELLED,   // Appointment cancelled by patient or doctor
    NO_SHOW      // Patient didn't arrive
}

/**
 * Represents a medical consultation record in the EMR system.
 * This is a core component of the Electronic Medical Records module.
 */
@Serializable
data class ConsultationRecord(
    val id: String,
    val appointmentId: String,
    val patientId: String,
    val doctorId: String,
    val consultationDate: Long,
    val chiefComplaint: String,
    val diagnosis: String,
    val treatment: String,
    val vitalSigns: VitalSigns?,
    val prescriptions: List<Prescription> = emptyList(),
    val clearanceIssued: Clearance? = null,
    val dentalRecord: DentalRecord? = null,
    val followUpRequired: Boolean = false,
    val followUpDate: Long? = null,
    val notes: String? = null
)

/**
 * Vital signs recorded during consultation.
 */
@Serializable
data class VitalSigns(
    val temperature: Double, // Celsius
    val bloodPressure: String, // e.g., "120/80"
    val heartRate: Int, // BPM
    val respiratoryRate: Int, // Breaths per minute
    val oxygenSaturation: Int, // SpO2 percentage
    val weight: Double, // kg
    val height: Double // cm
)

/**
 * Represents a prescription issued by a doctor.
 * Part of the Digital Issuance feature.
 */
@Serializable
data class Prescription(
    val id: String,
    val medicationName: String,
    val dosage: String,
    val frequency: String, // e.g., "Twice daily"
    val duration: String, // e.g., "5 days"
    val instructions: String?,
    val prescribedBy: String, // Doctor ID
    val prescribedDate: Long = System.currentTimeMillis(),
    val isDispensed: Boolean = false
)

/**
 * Represents a medical clearance document.
 * Used for OJT applications, sports events, etc.
 */
@Serializable
data class Clearance(
    val id: String,
    val patientId: String,
    val patientName: String,
    val clearanceType: ClearanceType,
    val purpose: String, // e.g., "OJT Application", "Sports Event"
    val medicalFitness: Boolean,
    val restrictions: List<String> = emptyList(),
    val validUntil: Long,
    val issuedBy: String, // Doctor ID
    val issuedDate: Long = System.currentTimeMillis(),
    val digitalSignature: String? = null // Cryptographic signature for authenticity
)

/**
 * Types of medical clearances available.
 */
@Serializable
enum class ClearanceType {
    FITNESS_TO_STUDY,
    FITNESS_FOR_SPORTS,
    FITNESS_FOR_OJT,
    FITNESS_FOR_WORK,
    TRAVEL_CLEARANCE,
    GENERAL_CLEARANCE
}

/**
 * Represents dental-specific records.
 * Separate from general medical records for specialized dental care.
 */
@Serializable
data class DentalRecord(
    val id: String,
    val toothNumber: String?, // Universal numbering system
    val procedure: String,
    val diagnosis: String,
    val treatment: String,
    val materialsUsed: List<String> = emptyList(),
    val nextVisitRecommended: Long? = null
)

/**
 * Represents medicine inventory item in the clinic.
 * Used for Medicine Inventory Management module.
 */
@Serializable
data class MedicineInventory(
    val id: String,
    val name: String,
    val genericName: String?,
    val category: MedicineCategory,
    val quantityInStock: Int,
    val unit: String, // e.g., "tablets", "ml", "boxes"
    val minimumStockLevel: Int, // Alert threshold
    val expirationDate: Long,
    val batchNumber: String,
    val supplier: String?,
    val lastRestocked: Long = System.currentTimeMillis(),
    val isLowStock: Boolean = false,
    val isExpired: Boolean = false
)

/**
 * Categories of medicines and supplies.
 */
@Serializable
enum class MedicineCategory {
    ANALGESIC,
    ANTIBIOTIC,
    ANTIHISTAMINE,
    ANTIINFLAMMATORY,
    ANTIPYRETIC,
    VITAMIN,
    FIRST_AID,
    DENTAL_SUPPLIES,
    OTHER
}

/**
 * Represents an SOS emergency alert.
 * Triggered by the SOS Panic Button feature.
 */
@Serializable
data class SOSAlert(
    val id: String,
    val userId: String,
    val userName: String,
    val userProfile: String, // Serialized profile for quick access
    val location: Location,
    val alertType: SOSAlertType,
    val timestamp: Long = System.currentTimeMillis(),
    val isResolved: Boolean = false,
    val respondedBy: String? = null,
    val responseTime: Long? = null,
    val notes: String? = null
)

/**
 * Geographic location data for SOS alerts and user tracking.
 */
@Serializable
data class Location(
    val latitude: Double,
    val longitude: Double,
    val building: String?,
    val floor: String?,
    val room: String?,
    val description: String?
)

/**
 * Types of SOS alerts for categorization.
 */
@Serializable
enum class SOSAlertType {
    MEDICAL_EMERGENCY,
    ACCIDENT,
    SEVERE_ALLERGIC_REACTION,
    CARDIAC_EVENT,
    SEIZURE,
    OTHER
}

/**
 * Represents a queue entry in the Live Queue Dashboard.
 * Tracks patients waiting for consultation.
 */
@Serializable
data class QueueEntry(
    val id: String,
    val patientId: String,
    val patientName: String,
    val queueNumber: Int,
    val entryType: QueueEntryType,
    val checkedInTime: Long,
    val estimatedWaitTime: Int, // minutes
    val status: QueueStatus = QueueStatus.WAITING,
    val assignedDoctor: String? = null,
    val priority: PriorityLevel = PriorityLevel.NORMAL
)

/**
 * How the patient entered the queue.
 */
@Serializable
enum class QueueEntryType {
    WALK_IN,      // Arrived without appointment
    SCHEDULED     // Had a prior appointment
}

/**
 * Current status of a patient in the queue.
 */
@Serializable
enum class QueueStatus {
    WAITING,
    BEING_ATTENDED,
    COMPLETED,
    LEFT_WITHOUT_BEING_SEEN
}

/**
 * Priority levels for triage in the queue system.
 */
@Serializable
enum class PriorityLevel {
    NORMAL,
    URGENT,
    EMERGENCY
}

/**
 * Audit log entry for compliance and security tracking.
 * Essential for Data Privacy Act compliance.
 */
@Serializable
data class AuditLog(
    val id: String,
    val userId: String,
    val action: String,
    val resourceType: String,
    val resourceId: String?,
    val timestamp: Long = System.currentTimeMillis(),
    val ipAddress: String?,
    val details: String?
)
