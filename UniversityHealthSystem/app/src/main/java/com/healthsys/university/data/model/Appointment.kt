package com.healthsys.university.data.model

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.Date

/**
 * Consultation Appointment - Manages scheduling for physical and virtual check-ups
 * Supports booking with school doctors, dentists, and nurses
 * 
 * FEATURES:
 * - Physical appointments (in-person at clinic)
 * - Virtual appointments (telemedicine via video call)
 * - Automatic reminders via push notifications
 * - Queue management integration
 * 
 * @property appointmentId Unique identifier
 * @property userId Patient's user ID
 * @property providerId Healthcare provider's user ID (doctor, nurse, dentist)
 * @property appointmentType PHYSICAL or VIRTUAL
 * @property consultationType GENERAL, DENTAL, FOLLOW_UP, EMERGENCY, SPECIALIST
 * @property scheduledDate Scheduled date and time
 * @property duration Expected duration in minutes
 * @property status PENDING, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW
 * @property symptoms Reason for consultation / chief complaint
 * @property notes Additional notes from patient
 * @property clinicLocation Specific clinic location/room
 * @property virtualMeetingLink Video call link (for VIRTUAL appointments)
 * @property checkInTime When patient actually checked in
 * @property consultationEnd When consultation ended
 * @property diagnosis Doctor's diagnosis (filled after consultation)
 * @property treatmentPlan Treatment recommendations
 * @property prescriptionId Reference to prescription if medications were prescribed
 * @property createdAt When the appointment was booked
 */
@Entity(
    tableName = "appointments",
    foreignKeys = [
        ForeignKey(
            entity = User::class,
            parentColumns = ["userId"],
            childColumns = ["userId"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = User::class,
            parentColumns = ["userId"],
            childColumns = ["providerId"],
            onDelete = ForeignKey.SET_NULL
        )
    ],
    indices = [
        Index(value = ["userId"]),
        Index(value = ["providerId"]),
        Index(value = ["scheduledDate"]),
        Index(value = ["status"])
    ]
)
data class Appointment(
    @PrimaryKey(autoGenerate = true)
    val appointmentId: Long = 0,
    
    val userId: Long,  // Patient
    val providerId: Long?,  // Healthcare provider (nullable for pending assignments)
    
    // Appointment details
    val appointmentType: AppointmentType,
    val consultationType: ConsultationType,
    
    // Scheduling
    val scheduledDate: Date,
    val duration: Int = 30,  // Default 30 minutes
    
    // Status tracking
    var status: AppointmentStatus = AppointmentStatus.PENDING,
    
    // Patient information
    val symptoms: String?,  // Chief complaint
    val notes: String?,  // Additional notes
    
    // Location details
    val clinicLocation: String?,  // e.g., "Room 201, Main Clinic"
    val virtualMeetingLink: String?,  // For telemedicine
    
    // Timestamps
    val checkInTime: Date? = null,
    val consultationStart: Date? = null,
    val consultationEnd: Date? = null,
    
    // Medical records (filled by provider after consultation)
    val diagnosis: String? = null,
    val treatmentPlan: String? = null,
    val prescriptionId: Long? = null,
    
    // Metadata
    val createdAt: Date = Date(),
    val updatedAt: Date = Date(),
    val cancelledReason: String? = null
)

/**
 * Enum for appointment type (physical vs virtual)
 */
enum class AppointmentType {
    PHYSICAL,   // In-person visit to clinic
    VIRTUAL     // Telemedicine/video consultation
}

/**
 * Enum for consultation type/specialty
 */
enum class ConsultationType {
    GENERAL,        // General check-up
    DENTAL,         // Dental consultation
    FOLLOW_UP,      // Follow-up visit
    EMERGENCY,      // Walk-in emergency
    SPECIALIST,     // Specialist referral
    MENTAL_HEALTH,  // Counseling/mental health
    SPORTS_PHYSICAL // Sports clearance examination
}

/**
 * Enum for appointment status lifecycle
 */
enum class AppointmentStatus {
    PENDING,        // Awaiting confirmation
    CONFIRMED,      // Confirmed by provider
    REMINDED,       // Reminder sent to patient
    CHECKED_IN,     // Patient has checked in
    IN_PROGRESS,    // Currently being attended
    COMPLETED,      // Consultation finished
    CANCELLED,      // Cancelled by patient or provider
    NO_SHOW         // Patient did not show up
}
