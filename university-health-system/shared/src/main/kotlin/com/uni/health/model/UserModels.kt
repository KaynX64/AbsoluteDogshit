package com.uni.health.model

import com.benasher44.uuid.Uuid
import com.benasher44.uuid.uuid4
import com.uni.health.domain.UserRole
import kotlinx.serialization.Serializable

/**
 * User represents a person in the system (student, staff, nurse, doctor, admin).
 * Contains authentication and role-based access information.
 * 
 * @property id Unique identifier for the user
 * @property email Email address used for login
 * @property passwordHash Hashed password for security (never store plain text)
 * @property role User's role determining system permissions
 * @property isActive Whether the account is currently active
 * @property createdAt Account creation timestamp
 * @property lastLogin Timestamp of last successful login
 */
@Serializable
data class User(
    val id: String = uuid4().toString(),
    val email: String,
    val passwordHash: String,
    val role: UserRole,
    val isActive: Boolean = true,
    val createdAt: Long = System.currentTimeMillis(),
    var lastLogin: Long? = null
)

/**
 * HealthProfile contains medical and personal information for students and staff.
 * This is sensitive data that must be encrypted and protected per Data Privacy Act.
 * 
 * @property id Unique identifier
 * @property userId Reference to the User account
 * @property firstName User's first name
 * @property lastName User's last name
 * @property dateOfBirth Date of birth for age calculation
 * @property sex Biological sex (relevant for medical treatment)
 * @property courseOrDepartment Student's course or Staff's department
 * @property yearLevel Academic year level (for students)
 * @property bloodType Blood type (A+, A-, B+, B-, AB+, AB-, O+, O-)
 * @property allergies List of known allergies (medications, food, etc.)
 * @property preExistingConditions List of chronic illnesses or conditions
 * @property emergencyContactName Name of emergency contact person
 * @property emergencyContactNumber Phone number of emergency contact
 * @property qrCodeData Unique QR code string for touchless check-in
 * @property profileImageUrl Optional profile photo
 * @property updatedAt Last modification timestamp
 */
@Serializable
data class HealthProfile(
    val id: String = uuid4().toString(),
    val userId: String,
    val firstName: String,
    val lastName: String,
    val dateOfBirth: String, // ISO 8601 format: YYYY-MM-DD
    val sex: String,
    val courseOrDepartment: String,
    val yearLevel: Int? = null, // Null for staff
    val bloodType: String,
    val allergies: List<String> = emptyList(),
    val preExistingConditions: List<String> = emptyList(),
    val emergencyContactName: String = "",
    val emergencyContactNumber: String = "",
    val qrCodeData: String = uuid4().toString(), // Unique QR identifier
    val profileImageUrl: String? = null,
    val updatedAt: Long = System.currentTimeMillis()
) {
    /**
     * Generates full name from first and last name.
     */
    fun getFullName(): String = "$firstName $lastName"
    
    /**
     * Checks if user has specific allergy.
     * @param allergen The allergen to check for
     * @return true if allergic, false otherwise
     */
    fun isAllergicTo(allergen: String): Boolean {
        return allergies.any { it.equals(allergen, ignoreCase = true) }
    }
}

/**
 * Appointment represents a scheduled consultation with clinic staff.
 * 
 * @property id Unique appointment identifier
 * @property patientId Reference to patient's HealthProfile
 * @property doctorId Reference to doctor/nurse User
 * @property appointmentType Physical or Virtual consultation
 * @property status Current appointment status
 * @property scheduledDate Scheduled date and time
 * @property reason Reason for consultation (chief complaint)
 * @property notes Additional notes from clinic staff
 * @property createdAt Booking timestamp
 */
@Serializable
data class Appointment(
    val id: String = uuid4().toString(),
    val patientId: String,
    val doctorId: String,
    val appointmentType: com.uni.health.domain.AppointmentType,
    var status: com.uni.health.domain.AppointmentStatus = com.uni.health.domain.AppointmentStatus.PENDING,
    val scheduledDate: Long, // Unix timestamp
    val reason: String,
    var notes: String = "",
    val createdAt: Long = System.currentTimeMillis()
)

/**
 * EmergencyAlert represents an SOS panic button activation.
 * Critical for campus safety - sends location and profile immediately.
 * 
 * @property id Unique alert identifier
 * @property userId Reference to user who triggered SOS
 * @property latitude GPS latitude coordinate
 * @property longitude GPS longitude coordinate
 * @property accuracy Location accuracy in meters
 * @property emergencyLevel Severity level
 * @property description User-provided description of emergency
 * @property isResolved Whether emergency has been handled
 * @property respondedBy ID of responder who acknowledged
 * @property createdAt Alert trigger timestamp
 * @property resolvedAt Timestamp when resolved
 */
@Serializable
data class EmergencyAlert(
    val id: String = uuid4().toString(),
    val userId: String,
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float,
    val emergencyLevel: com.uni.health.domain.EmergencyLevel = com.uni.health.domain.EmergencyLevel.HIGH,
    val description: String = "",
    var isResolved: Boolean = false,
    var respondedBy: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    var resolvedAt: Long? = null
)
