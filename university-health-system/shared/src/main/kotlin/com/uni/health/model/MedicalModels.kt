package com.uni.health.model

import com.benasher44.uuid.uuid4
import com.uni.health.domain.ClearanceType
import kotlinx.serialization.Serializable

/**
 * MedicalRecord (EMR) contains complete health history and consultation logs.
 * This is the core of the Electronic Medical Records system.
 * Must be encrypted and access-controlled per Data Privacy Act compliance.
 * 
 * @property id Unique record identifier
 * @property patientId Reference to patient's HealthProfile
 * @property doctorId Reference to attending physician
 * @property consultationDate When the consultation occurred
 * @property chiefComplaint Patient's main reason for visit
 * @property diagnosis Doctor's diagnosis (ICD-10 codes recommended)
 * @property treatment Provided treatment description
 * @property medications Prescribed medications
 * @property allergies Noted during consultation
 * @property vitalSigns Recorded vital signs
 * @property dentalRecord Optional dental-specific information
 * @property followUpDate Recommended follow-up appointment
 * @property attachments List of file URLs (X-rays, lab results, etc.)
 */
@Serializable
data class MedicalRecord(
    val id: String = uuid4().toString(),
    val patientId: String,
    val doctorId: String,
    val consultationDate: Long = System.currentTimeMillis(),
    val chiefComplaint: String,
    val diagnosis: String,
    val treatment: String,
    val medications: List<PrescriptionMedicine> = emptyList(),
    val allergies: List<String> = emptyList(),
    val vitalSigns: VitalSigns? = null,
    val dentalRecord: DentalRecord? = null,
    val followUpDate: Long? = null,
    val attachments: List<String> = emptyList() // File URLs or paths
)

/**
 * PrescriptionMedicine represents a single prescribed medication.
 * 
 * @property medicineName Generic or brand name
 * @property dosage Strength and form (e.g., "500mg tablet")
 * @property frequency How often to take (e.g., "Every 8 hours")
 * @property duration Number of days
 * @property instructions Special instructions (e.g., "Take with food")
 */
@Serializable
data class PrescriptionMedicine(
    val medicineName: String,
    val dosage: String,
    val frequency: String,
    val duration: Int, // days
    val instructions: String = ""
)

/**
 * VitalSigns contains standard vital sign measurements.
 * 
 * @property temperature Body temperature in Celsius
 * @property bloodPressureSystolic Systolic BP (mmHg)
 * @property bloodPressureDiastolic Diastolic BP (mmHg)
 * @property heartRate Beats per minute
 * @property respiratoryRate Breaths per minute
 * @property oxygenSaturation SpO2 percentage
 * @property weight Weight in kilograms
 * @property height Height in centimeters
 */
@Serializable
data class VitalSigns(
    val temperature: Double? = null, // Celsius
    val bloodPressureSystolic: Int? = null, // mmHg
    val bloodPressureDiastolic: Int? = null, // mmHg
    val heartRate: Int? = null, // bpm
    val respiratoryRate: Int? = null, // breaths/min
    val oxygenSaturation: Int? = null, // %
    val weight: Double? = null, // kg
    val height: Double? = null // cm
) {
    /**
     * Calculates BMI if weight and height are available.
     * @return BMI value or null
     */
    fun calculateBMI(): Double? {
        if (weight == null || height == null) return null
        val heightInMeters = height!! / 100.0
        return weight!! / (heightInMeters * heightInMeters)
    }
    
    /**
     * Formats blood pressure as standard reading.
     * @return BP string like "120/80" or null
     */
    fun getBloodPressureString(): String? {
        if (bloodPressureSystolic == null || bloodPressureDiastolic == null) return null
        return "$bloodPressureSystolic/$bloodPressureDiastolic"
    }
}

/**
 * DentalRecord contains dental-specific examination and treatment data.
 * 
 * @property toothNumber Universal numbering system (1-32)
 * @property condition Description of dental condition
 * @property treatmentPerformed Dental procedure done
 * @property toothSurface Affected surface (O, M, D, B, L)
 * @property xrays List of dental X-ray image URLs
 */
@Serializable
data class DentalRecord(
    val toothNumber: Int,
    val condition: String,
    val treatmentPerformed: String,
    val toothSurface: String = "",
    val xrays: List<String> = emptyList()
)

/**
 * MedicalClearance is an official document for OJT, sports, etc.
 * Digitally signed by authorized clinic staff.
 * 
 * @property id Unique clearance identifier
 * @property patientId Reference to patient
 * @property issuedBy Doctor/Nurse who issued clearance
 * @property clearanceType Type of clearance (OJT, Sports, General)
 * @property purpose Specific purpose or requirement
 * @property isFitForPurpose Medical fitness determination
 * @property restrictions Any limitations or restrictions
 * @property validUntil Expiration date
 * @property digitalSignature Cryptographic signature for verification
 * @property issueDate When clearance was issued
 */
@Serializable
data class MedicalClearance(
    val id: String = uuid4().toString(),
    val patientId: String,
    val issuedBy: String,
    val clearanceType: ClearanceType,
    val purpose: String,
    val isFitForPurpose: Boolean,
    val restrictions: String = "",
    val validUntil: Long,
    val digitalSignature: String, // Cryptographic hash for verification
    val issueDate: Long = System.currentTimeMillis()
)

/**
 * Prescription is a downloadable digital prescription document.
 * Can be presented at pharmacies for medication dispensing.
 * 
 * @property id Unique prescription identifier
 * @property medicalRecordId Reference to consultation record
 * @property patientId Reference to patient
 * @property prescribedBy Doctor who prescribed
 * @property medicines List of prescribed medications
 * @property totalDays Duration of medication
 * @property digitalSignature Doctor's cryptographic signature
 * @property issueDate When prescription was issued
 * @property isFilled Whether prescription has been filled at pharmacy
 */
@Serializable
data class Prescription(
    val id: String = uuid4().toString(),
    val medicalRecordId: String,
    val patientId: String,
    val prescribedBy: String,
    val medicines: List<PrescriptionMedicine>,
    val totalDays: Int,
    val digitalSignature: String,
    val issueDate: Long = System.currentTimeMillis(),
    var isFilled: Boolean = false
)

/**
 * MedicineInventory tracks clinic stock levels and expiration dates.
 * Critical for managing clinic supplies and preventing shortages.
 * 
 * @property id Unique inventory item identifier
 * @property medicineName Generic or brand name
 * @property category Type (medication, first-aid, equipment, etc.)
 * @property currentStock Current quantity on hand
 * @property minimumStock Reorder point threshold
 * @property unitOfMeasure tablets, bottles, boxes, etc.
 * @property expirationDate When product expires
 * @property batchNumber Manufacturer batch number for recalls
 * @property supplier Supplier information
 * @property lastRestocked Date of last restock
 * @property isLowStock Computed property - true if below minimum
 * @property isExpired Computed property - true if past expiration
 */
@Serializable
data class MedicineInventory(
    val id: String = uuid4().toString(),
    val medicineName: String,
    val category: String,
    var currentStock: Int,
    val minimumStock: Int,
    val unitOfMeasure: String,
    val expirationDate: Long,
    val batchNumber: String,
    val supplier: String = "",
    val lastRestocked: Long = System.currentTimeMillis()
) {
    /**
     * Checks if stock is below minimum threshold.
     * Triggers automatic alert for restocking.
     */
    val isLowStock: Boolean
        get() = currentStock <= minimumStock
    
    /**
     * Checks if item has expired.
     * Triggers alert for removal from inventory.
     */
    val isExpired: Boolean
        get() = System.currentTimeMillis() > expirationDate
    
    /**
     * Calculates days until expiration.
     * @return Days remaining or negative if expired
     */
    fun daysUntilExpiration(): Long {
        val now = System.currentTimeMillis()
        return (expirationDate - now) / (1000 * 60 * 60 * 24)
    }
}

/**
 * QueueEntry represents a patient in the live queue dashboard.
 * Used to manage walk-in and scheduled patients efficiently.
 * 
 * @property id Unique queue entry
 * @property patientId Reference to patient
 * @property patientName Cached name for quick display
 * @property queueNumber Sequential number for calling
 * @property appointmentType Walk-in or Scheduled
 * @property status Current queue status
 * @property checkInTime When patient arrived
 * @property calledTime When patient was called
 * @property seenTime When consultation started
 * @property completedTime When consultation ended
 */
@Serializable
data class QueueEntry(
    val id: String = uuid4().toString(),
    val patientId: String,
    val patientName: String,
    val queueNumber: Int,
    val appointmentType: String, // "Walk-in" or "Scheduled"
    var status: QueueStatus = QueueStatus.WAITING,
    val checkInTime: Long = System.currentTimeMillis(),
    var calledTime: Long? = null,
    var seenTime: Long? = null,
    var completedTime: Long? = null
)

/**
 * QueueStatus tracks patient's position in queue.
 */
@Serializable
enum class QueueStatus {
    WAITING,      // In queue, not yet called
    CALLED,       // Number called, waiting for patient
    IN_CONSULTATION, // Currently with doctor/nurse
    COMPLETED,    // Consultation finished
    LEFT          // Patient left without being seen
}

/**
 * HealthAnalyticsReport provides campus-wide health statistics.
 * Used for tracking common illnesses and seasonal patterns.
 * 
 * @property reportId Unique report identifier
 * @property generatedAt Report generation timestamp
 * @property periodStart Start of reporting period
 * @property periodEnd End of reporting period
 * @property totalConsultations Total number of consultations
 * @property commonIllnesses List of most frequent diagnoses
 * @property illnessCounts Map of illness to count
 * @property demographicBreakdown Stats by year level, department, etc.
 * @property monthlyTrends Monthly consultation counts
 */
@Serializable
data class HealthAnalyticsReport(
    val reportId: String = uuid4().toString(),
    val generatedAt: Long = System.currentTimeMillis(),
    val periodStart: Long,
    val periodEnd: Long,
    val totalConsultations: Int,
    val commonIllnesses: List<String>,
    val illnessCounts: Map<String, Int>,
    val demographicBreakdown: Map<String, Int>,
    val monthlyTrends: List<MonthlyTrend>
)

/**
 * MonthlyTrend tracks consultations per month.
 */
@Serializable
data class MonthlyTrend(
    val month: String, // e.g., "2024-01"
    val consultationCount: Int,
    val topIllness: String
)
