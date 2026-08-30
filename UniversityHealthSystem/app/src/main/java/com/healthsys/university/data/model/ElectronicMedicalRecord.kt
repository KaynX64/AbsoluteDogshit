package com.healthsys.university.data.model

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.Date

/**
 * Electronic Medical Record (EMR) - Comprehensive digitized health history
 * Core component of the Clinic & EMR Module for nurses and doctors
 * 
 * FEATURES:
 * - Complete consultation history
 * - Treatment records
 * - Dental records (separate section)
 * - Laboratory results
 * - Imaging reports
 * - Progress notes
 * 
 * DATA PRIVACY COMPLIANCE:
 * - All sensitive health data encrypted at rest (Philippine Data Privacy Act 2012)
 * - Access logged and auditable
 * - Role-based access control enforced
 * - Patient consent tracking
 * 
 * @property emrId Unique identifier
 * @property patientId Patient's user ID
 * @property providerId Healthcare provider who created/updated record
 * @property appointmentId Reference to related appointment
 * @property recordType CONSULTATION, DENTAL, LABORATORY, IMAGING, PROGRESS_NOTE
 * @property chiefComplaint Patient's reported symptoms
 * @property diagnosis Medical diagnosis (ICD-10 coded when possible)
 * @property treatmentProvided Description of treatment given
 * @property clinicalNotes Detailed clinical observations
 * @property vitalSigns JSON object with BP, HR, RR, temperature, SpO2
 * @property physicalExamFindings Results of physical examination
 * @property laboratoryResults JSON array of lab test results
 * @property imagingResults JSON array of imaging study results
 * @property dentalChart Dental chart data (for dental records)
 * @property medicationsGiven Medications administered during visit
 * @property followUpInstructions Instructions for patient
 * @property followUpDate Scheduled follow-up date
 * @property attachments List of attached documents/images
 * @property isConfidential Whether record contains sensitive information
 * @property consentObtained Whether patient consent was obtained
 */
@Entity(
    tableName = "electronic_medical_records",
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
            childColumns = ["providerId"],
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
        Index(value = ["providerId"]),
        Index(value = ["appointmentId"]),
        Index(value = ["recordType"])
    ]
)
data class ElectronicMedicalRecord(
    @PrimaryKey(autoGenerate = true)
    val emrId: Long = 0,
    
    val patientId: Long,
    val providerId: Long,
    val appointmentId: Long?,
    
    // Record classification
    val recordType: EMRType,
    val visitDate: Date = Date(),
    
    // Clinical information
    val chiefComplaint: String?,
    val historyOfPresentIllness: String?,
    val pastMedicalHistory: String?,
    val diagnosis: String?,  // Can be multiple, comma-separated or JSON
    val diagnosisCode: String?,  // ICD-10 code
    
    // Treatment
    val treatmentProvided: String?,
    val proceduresPerformed: String?,
    val clinicalNotes: String?,
    
    // Examination data
    val vitalSigns: String?,  // JSON: {bp: "120/80", hr: 72, rr: 16, temp: 36.5, spo2: 98}
    val physicalExamFindings: String?,
    
    // Test results
    val laboratoryResults: String?,  // JSON array
    val imagingResults: String?,     // JSON array
    
    // Dental-specific (for dental records)
    val dentalChart: String?,  // JSON dental chart data
    val dentalProcedure: String?,
    
    // Medications
    val medicationsGiven: String?,  // JSON array
    
    // Follow-up
    val followUpInstructions: String?,
    val followUpDate: Date?,
    
    // Attachments (file paths or URLs)
    val attachments: String?,  // JSON array of file paths
    
    // Privacy & Compliance
    val isConfidential: Boolean = false,
    val consentObtained: Boolean = true,
    
    // Metadata
    val createdAt: Date = Date(),
    val updatedAt: Date = Date(),
    val createdBy: Long,  // User ID of creator
    val lastModifiedBy: Long?  // User ID of last modifier
)

/**
 * Enum for EMR record types
 */
enum class EMRType {
    CONSULTATION,      // General medical consultation
    DENTAL,           // Dental examination/treatment
    LABORATORY,       // Lab test results
    IMAGING,          // X-ray, ultrasound, etc.
    PROGRESS_NOTE,    // Follow-up progress note
    IMMUNIZATION,     // Vaccination record
    REFERRAL,         // Specialist referral
    EMERGENCY         // Emergency room visit
}
