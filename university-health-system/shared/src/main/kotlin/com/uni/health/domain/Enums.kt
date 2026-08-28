package com.uni.health.domain

import com.benasher44.uuid.Uuid
import kotlinx.serialization.Serializable

/**
 * UserRole defines the different types of users in the system.
 * Each role has specific permissions and access levels.
 * 
 * - STUDENT: Can access personal health profile, book appointments, view prescriptions
 * - STAFF: Faculty members with similar access to students
 * - NURSE: Can view patient records, manage queue, issue basic clearances
 * - DOCTOR: Full access to EMR, can diagnose, prescribe, and sign medical documents
 * - DENTIST: Specialized access for dental records and treatments
 * - ADMIN: System administration, user management, role assignments
 * - EMERGENCY: Limited access for emergency response (location and basic profile only)
 */
@Serializable
enum class UserRole {
    STUDENT,
    STAFF,
    NURSE,
    DOCTOR,
    DENTIST,
    ADMIN,
    EMERGENCY
}

/**
 * AppointmentType specifies whether a consultation is physical or virtual.
 */
@Serializable
enum class AppointmentType {
    PHYSICAL,      // In-person visit to clinic
    VIRTUAL        // Remote consultation via video call
}

/**
 * AppointmentStatus tracks the current state of an appointment.
 */
@Serializable
enum class AppointmentStatus {
    PENDING,       // Waiting for confirmation
    CONFIRMED,     // Approved by clinic staff
    IN_PROGRESS,   // Currently being attended
    COMPLETED,     // Consultation finished
    CANCELLED,     // Cancelled by user or clinic
    NO_SHOW        // Patient did not arrive
}

/**
 * ClearanceType defines the different types of medical clearances.
 */
@Serializable
enum class ClearanceType {
    OJT,           // On-the-Job Training clearance
    SPORTS,        // Sports event participation clearance
    GENERAL,       // General medical clearance
    DENTAL         // Dental clearance
}

/**
 * EmergencyLevel indicates the severity of an emergency situation.
 */
@Serializable
enum class EmergencyLevel {
    LOW,           // Minor injury, non-urgent
    MEDIUM,        // Requires attention but not life-threatening
    HIGH,          // Serious injury, requires immediate care
    CRITICAL       // Life-threatening emergency
}
