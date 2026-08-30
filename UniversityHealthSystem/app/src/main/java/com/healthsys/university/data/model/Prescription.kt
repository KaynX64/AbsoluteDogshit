package com.healthsys.university.data.model

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.Date

/**
 * Prescription - Digital prescriptions issued by doctors
 * Can be viewed and downloaded by students/staff for OJT or sports events
 * 
 * FEATURES:
 * - Digital signature from licensed physician
 * - QR code verification for authenticity
 * - Download as PDF for external use
 * - Integration with pharmacy inventory
 * 
 * LEGAL COMPLIANCE:
 * - Must comply with Philippine FDA regulations on e-prescriptions
 * - Requires digital signature from licensed physician
 * - Controlled substances require additional verification
 * 
 * @property prescriptionId Unique identifier
 * @property appointmentId Reference to the consultation appointment
 * @property patientId Patient's user ID
 * @property doctorId Prescribing doctor's user ID
 * @property prescriptionDate When the prescription was issued
 * @property medications List of prescribed medications (JSON)
 * @property dosageInstructions Dosage and administration instructions
 * @property duration Duration of medication (in days)
 * @property refillsAllowed Number of allowed refills
 * @property refillsRemaining Remaining refills
 * @property notes Additional instructions or warnings
 * @property isControlled Whether prescription contains controlled substances
 * @property digitalSignature Doctor's digital signature hash
 * @property status ACTIVE, COMPLETED, EXPIRED, CANCELLED
 * @property expiryDate When the prescription expires
 */
@Entity(
    tableName = "prescriptions",
    foreignKeys = [
        ForeignKey(
            entity = User::class,
            parentColumns = ["userId"],
            childColumns = ["patientId"],
            onDelete = ForeignKey.CASCADE
        ),
        ForeignKey(
            entity = User::class,
            parentColumns = ["userId"],
            childColumns = ["doctorId"],
            onDelete = ForeignKey.SET_NULL
        ),
        ForeignKey(
            entity = Appointment::class,
            parentColumns = ["appointmentId"],
            childColumns = ["appointmentId"],
            onDelete = ForeignKey.SET_NULL
        )
    ],
    indices = [
        Index(value = ["patientId"]),
        Index(value = ["doctorId"]),
        Index(value = ["appointmentId"])
    ]
)
data class Prescription(
    @PrimaryKey(autoGenerate = true)
    val prescriptionId: Long = 0,
    
    val appointmentId: Long?,
    val patientId: Long,
    val doctorId: Long,
    
    // Prescription details
    val prescriptionDate: Date = Date(),
    val medications: String,  // JSON array of Medication objects
    val dosageInstructions: String,
    val durationDays: Int,
    
    // Refill information
    val refillsAllowed: Int = 0,
    var refillsRemaining: Int = 0,
    
    // Additional information
    val notes: String?,
    val isControlledSubstance: Boolean = false,
    
    // Security & Verification
    val digitalSignature: String?,  // Hash of doctor's digital signature
    val verificationCode: String?,  // QR verification code
    
    // Status
    var status: PrescriptionStatus = PrescriptionStatus.ACTIVE,
    val expiryDate: Date,
    
    // Timestamps
    val createdAt: Date = Date(),
    val updatedAt: Date = Date()
)

/**
 * Nested data class for individual medication in a prescription
 */
data class MedicationItem(
    val medicationName: String,
    val strength: String,  // e.g., "500mg", "250mg/5ml"
    val form: String,      // e.g., "Tablet", "Capsule", "Syrup", "Injection"
    val frequency: String, // e.g., "Every 8 hours", "Twice daily"
    val quantity: Int,
    val duration: String,  // e.g., "7 days", "Until finished"
    val instructions: String? // Special instructions (e.g., "Take with food")
)

/**
 * Enum for prescription status
 */
enum class PrescriptionStatus {
    ACTIVE,         // Currently valid and can be filled
    FILLING,        // Being processed at pharmacy
    COMPLETED,      // All medications dispensed
    EXPIRED,        // Past expiry date
    CANCELLED       // Cancelled by prescriber
}
