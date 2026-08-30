package com.healthsys.university.data.model

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.Date

/**
 * Medical Clearance - Digital medical clearances for OJT, sports events, and other activities
 * Can be digitally signed and issued by clinic staff
 * 
 * USE CASES:
 * - OJT (On-the-Job Training) clearance
 * - Sports participation clearance
 * - Study abroad medical clearance
 * - Employment medical fitness
 * - Return-to-school after illness
 * 
 * SECURITY:
 * - Requires digital signature from licensed physician
 * - QR code verification for authenticity
 * - Tamper-evident PDF generation
 * 
 * @property clearanceId Unique identifier
 * @property patientId Patient's user ID
 * @property doctorId Issuing doctor's user ID
 * @property clearanceType Type of clearance (OJT, SPORTS, STUDY_ABROAD, etc.)
 * @property purpose Specific purpose/organization requiring clearance
 * @property examinationDate When the medical exam was conducted
 * @property findings Medical examination findings
 * @property restrictions Any activity restrictions
 * @property recommendations Doctor's recommendations
 * @property isFitForPurpose Whether patient is medically fit
 * @property digitalSignature Doctor's digital signature
 * @property qrVerificationCode QR code for verification
 * @property validUntil Expiration date of clearance
 * @property status PENDING, APPROVED, REJECTED, EXPIRED
 */
@Entity(
    tableName = "medical_clearances",
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
        )
    ],
    indices = [
        Index(value = ["patientId"]),
        Index(value = ["doctorId"]),
        Index(value = ["clearanceType"])
    ]
)
data class MedicalClearance(
    @PrimaryKey(autoGenerate = true)
    val clearanceId: Long = 0,
    
    val patientId: Long,
    val doctorId: Long,
    
    // Clearance details
    val clearanceType: ClearanceType,
    val purpose: String,  // e.g., "OJT at ABC Company", "Varsity Basketball Team"
    val organizationName: String?,  // Name of requesting organization
    
    // Examination results
    val examinationDate: Date,
    val vitalSigns: String?,  // JSON: BP, HR, RR, Temp
    val findings: String?,
    val restrictions: String?,
    val recommendations: String?,
    
    // Fitness determination
    val isFitForPurpose: Boolean,
    val unfitReason: String?,  // If not fit, specify reason
    
    // Security & Verification
    val digitalSignature: String?,
    val qrVerificationCode: String?,
    val certificateNumber: String,  // Unique certificate number
    
    // Validity
    val validFrom: Date = Date(),
    val validUntil: Date,
    
    // Status
    var status: ClearanceStatus = ClearanceStatus.PENDING,
    
    // Timestamps
    val createdAt: Date = Date(),
    val approvedAt: Date? = null
)

/**
 * Enum for types of medical clearances
 */
enum class ClearanceType {
    OJT,                    // On-the-Job Training
    SPORTS,                 // Sports participation
    STUDY_ABROAD,          // Study abroad program
    EMPLOYMENT,            // Pre-employment
    RETURN_TO_SCHOOL,      // After extended illness
    GENERAL_FITNESS,       // General medical fitness
    IMMUNIZATION,          // Immunization record/clearance
    DENTAL_CLEARANCE       // Dental health clearance
}

/**
 * Enum for clearance status
 */
enum class ClearanceStatus {
    PENDING,      // Awaiting examination or approval
    APPROVED,     // Cleared by physician
    REJECTED,     // Not cleared (with reason)
    EXPIRED,      // Past validity period
    REVOKED       // Revoked due to new medical information
}
