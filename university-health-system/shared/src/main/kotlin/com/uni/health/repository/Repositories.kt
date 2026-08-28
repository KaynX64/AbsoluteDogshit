package com.uni.health.repository

import com.uni.health.model.*
import kotlinx.coroutines.flow.Flow

/**
 * BaseRepository defines common CRUD operations for all repositories.
 * Provides a consistent interface for data access across the system.
 * 
 * @param T The type of entity this repository manages
 * @param ID The type of the entity's identifier
 */
interface BaseRepository<T, ID> {
    /**
     * Retrieves an entity by its ID.
     * @param id Unique identifier
     * @return Entity or null if not found
     */
    suspend fun getById(id: ID): T?
    
    /**
     * Retrieves all entities.
     * @return List of all entities
     */
    suspend fun getAll(): List<T>
    
    /**
     * Creates a new entity.
     * @param entity Entity to create
     * @return Created entity with generated ID
     */
    suspend fun create(entity: T): T
    
    /**
     * Updates an existing entity.
     * @param entity Entity with updated data
     * @return Updated entity or null if not found
     */
    suspend fun update(entity: T): T?
    
    /**
     * Deletes an entity by ID.
     * @param id Unique identifier
     * @return true if deleted, false if not found
     */
    suspend fun delete(id: ID): Boolean
    
    /**
     * Checks if an entity exists.
     * @param id Unique identifier
     * @return true if exists, false otherwise
     */
    suspend fun exists(id: ID): Boolean
}

/**
 * UserRepository handles user account data access.
 * Manages authentication and role-based access control.
 */
interface UserRepository : BaseRepository<User, String> {
    /**
     * Finds user by email address (for login).
     * @param email User's email
     * @return User or null
     */
    suspend fun findByEmail(email: String): User?
    
    /**
     * Finds users by role (for admin management).
     * @param role User role to filter by
     * @return List of users with specified role
     */
    suspend fun findByRole(role: com.uni.health.domain.UserRole): List<User>
    
    /**
     * Updates user's last login timestamp.
     * @param userId User ID
     * @return true if updated
     */
    suspend fun updateLastLogin(userId: String): Boolean
    
    /**
     * Deactivates user account (soft delete).
     * @param userId User ID
     * @return true if deactivated
     */
    suspend fun deactivateUser(userId: String): Boolean
}

/**
 * HealthProfileRepository manages student/staff health profiles.
 * Handles sensitive medical information with encryption.
 */
interface HealthProfileRepository : BaseRepository<HealthProfile, String> {
    /**
     * Finds profile by user ID.
     * @param userId Associated user ID
     * @return HealthProfile or null
     */
    suspend fun findByUserId(userId: String): HealthProfile?
    
    /**
     * Finds profile by QR code data (for touchless check-in).
     * @param qrCodeData QR code string
     * @return HealthProfile or null
     */
    suspend fun findByQrCode(qrCodeData: String): HealthProfile?
    
    /**
     * Searches profiles by name (for quick lookup).
     * @param query Search query (first or last name)
     * @return List of matching profiles
     */
    suspend fun searchByName(query: String): List<HealthProfile>
    
    /**
     * Gets profiles by course/department.
     * @param courseOrDepartment Course or department name
     * @return List of profiles in that course/department
     */
    suspend fun findByCourseOrDepartment(courseOrDepartment: String): List<HealthProfile>
    
    /**
     * Updates allergy information.
     * @param profileId Profile ID
     * @param allergies New allergy list
     * @return Updated profile
     */
    suspend fun updateAllergies(profileId: String, allergies: List<String>): HealthProfile?
    
    /**
     * Updates pre-existing conditions.
     * @param profileId Profile ID
     * @param conditions New conditions list
     * @return Updated profile
     */
    suspend fun updatePreExistingConditions(profileId: String, conditions: List<String>): HealthProfile?
}

/**
 * AppointmentRepository manages consultation scheduling.
 * Handles booking, confirmation, and status tracking.
 */
interface AppointmentRepository : BaseRepository<Appointment, String> {
    /**
     * Finds appointments by patient ID.
     * @param patientId Patient's profile ID
     * @return List of patient's appointments
     */
    suspend fun findByPatientId(patientId: String): List<Appointment>
    
    /**
     * Finds appointments by doctor ID.
     * @param doctorId Doctor's user ID
     * @return List of doctor's appointments
     */
    suspend fun findByDoctorId(doctorId: String): List<Appointment>
    
    /**
     * Finds appointments by date range.
     * @param startDate Start timestamp
     * @param endDate End timestamp
     * @return List of appointments in range
     */
    suspend fun findByDateRange(startDate: Long, endDate: Long): List<Appointment>
    
    /**
     * Finds appointments by status.
     * @param status Appointment status to filter
     * @return List of appointments with status
     */
    suspend fun findByStatus(status: com.uni.health.domain.AppointmentStatus): List<Appointment>
    
    /**
     * Checks if time slot is available.
     * @param doctorId Doctor ID
     * @param timestamp Desired appointment time
     * @return true if available, false if booked
     */
    suspend fun isTimeSlotAvailable(doctorId: String, timestamp: Long): Boolean
    
    /**
     * Gets upcoming appointments for a patient.
     * @param patientId Patient ID
     * @return List of future confirmed appointments
     */
    suspend fun getUpcomingAppointments(patientId: String): List<Appointment>
    
    /**
     * Cancels an appointment.
     * @param appointmentId Appointment ID
     * @return true if cancelled
     */
    suspend fun cancelAppointment(appointmentId: String): Boolean
}

/**
 * EmergencyAlertRepository handles SOS panic button alerts.
 * Critical for emergency response - must be fast and reliable.
 */
interface EmergencyAlertRepository : BaseRepository<EmergencyAlert, String> {
    /**
     * Finds active (unresolved) alerts.
     * @return List of active emergency alerts
     */
    suspend fun getActiveAlerts(): List<EmergencyAlert>
    
    /**
     * Finds alerts by user ID.
     * @param userId User who triggered alerts
     * @return List of user's alerts
     */
    suspend fun findByUserId(userId: String): List<EmergencyAlert>
    
    /**
     * Creates emergency alert (SOS trigger).
     * @param userId User in emergency
     * @param latitude GPS latitude
     * @param longitude GPS longitude
     * @param accuracy Location accuracy
     * @param description Emergency description
     * @return Created alert
     */
    suspend fun createAlert(
        userId: String,
        latitude: Double,
        longitude: Double,
        accuracy: Float,
        description: String = ""
    ): EmergencyAlert
    
    /**
     * Marks alert as resolved.
     * @param alertId Alert ID
     * @param responderId ID of person who responded
     * @return true if resolved
     */
    suspend fun resolveAlert(alertId: String, responderId: String): Boolean
    
    /**
     * Gets alerts by location radius (for nearby emergencies).
     * @param latitude Center latitude
     * @param longitude Center longitude
     * @param radiusKm Radius in kilometers
     * @return List of alerts within radius
     */
    suspend fun findAlertsByLocation(
        latitude: Double,
        longitude: Double,
        radiusKm: Double
    ): List<EmergencyAlert>
}

/**
 * MedicalRecordRepository manages Electronic Medical Records (EMR).
 * Core repository for digitized health history and consultations.
 */
interface MedicalRecordRepository : BaseRepository<MedicalRecord, String> {
    /**
     * Finds records by patient ID.
     * @param patientId Patient's profile ID
     * @return List of patient's medical records
     */
    suspend fun findByPatientId(patientId: String): List<MedicalRecord>
    
    /**
     * Finds records by doctor ID.
     * @param doctorId Doctor's user ID
     * @return List of records created by doctor
     */
    suspend fun findByDoctorId(doctorId: String): List<MedicalRecord>
    
    /**
     * Finds records by date range.
     * @param startDate Start timestamp
     * @param endDate End timestamp
     * @return List of records in range
     */
    suspend fun findByDateRange(startDate: Long, endDate: Long): List<MedicalRecord>
    
    /**
     * Searches records by diagnosis.
     * @param diagnosis Diagnosis keyword
     * @return List of matching records
     */
    suspend fun searchByDiagnosis(diagnosis: String): List<MedicalRecord>
    
    /**
     * Gets patient's complete health history.
     * @param patientId Patient ID
     * @return List of all records sorted by date
     */
    suspend fun getHealthHistory(patientId: String): List<MedicalRecord>
    
    /**
     * Adds attachment to record (X-ray, lab result, etc.).
     * @param recordId Record ID
     * @param attachmentUrl URL or path to attachment
     * @return true if added
     */
    suspend fun addAttachment(recordId: String, attachmentUrl: String): Boolean
}

/**
 * PrescriptionRepository manages digital prescriptions.
 * Handles creation, viewing, and download of prescriptions.
 */
interface PrescriptionRepository : BaseRepository<Prescription, String> {
    /**
     * Finds prescriptions by patient ID.
     * @param patientId Patient's profile ID
     * @return List of patient's prescriptions
     */
    suspend fun findByPatientId(patientId: String): List<Prescription>
    
    /**
     * Finds prescriptions by doctor ID.
     * @param doctorId Prescribing doctor's ID
     * @return List of prescriptions by doctor
     */
    suspend fun findByDoctorId(doctorId: String): List<Prescription>
    
    /**
     * Finds prescription by medical record ID.
     * @param medicalRecordId Associated consultation record
     * @return Prescription or null
     */
    suspend fun findByMedicalRecordId(medicalRecordId: String): Prescription?
    
    /**
     * Marks prescription as filled at pharmacy.
     * @param prescriptionId Prescription ID
     * @return true if marked
     */
    suspend fun markAsFilled(prescriptionId: String): Boolean
    
    /**
     * Gets active (unexpired) prescriptions.
     * @param patientId Patient ID
     * @return List of valid prescriptions
     */
    suspend fun getActivePrescriptions(patientId: String): List<Prescription>
}

/**
 * MedicalClearanceRepository manages medical clearances.
 * Handles issuance and verification of OJT, sports, and general clearances.
 */
interface MedicalClearanceRepository : BaseRepository<MedicalClearance, String> {
    /**
     * Finds clearances by patient ID.
     * @param patientId Patient's profile ID
     * @return List of patient's clearances
     */
    suspend fun findByPatientId(patientId: String): List<MedicalClearance>
    
    /**
     * Finds clearances by type.
     * @param type Clearance type (OJT, Sports, etc.)
     * @return List of clearances of that type
     */
    suspend fun findByType(type: com.uni.health.domain.ClearanceType): List<MedicalClearance>
    
    /**
     * Finds clearances issued by specific staff.
     * @param issuerId Staff who issued clearance
     * @return List of clearances issued by staff
     */
    suspend fun findByIssuerId(issuerId: String): List<MedicalClearance>
    
    /**
     * Verifies clearance digital signature.
     * @param clearanceId Clearance ID
     * @return true if signature is valid
     */
    suspend fun verifySignature(clearanceId: String): Boolean
    
    /**
     * Gets valid (unexpired) clearances for patient.
     * @param patientId Patient ID
     * @return List of valid clearances
     */
    suspend fun getValidClearances(patientId: String): List<MedicalClearance>
    
    /**
     * Checks if patient has valid clearance of specific type.
     * @param patientId Patient ID
     * @param type Required clearance type
     * @return true if has valid clearance
     */
    suspend fun hasValidClearance(patientId: String, type: com.uni.health.domain.ClearanceType): Boolean
}

/**
 * MedicineInventoryRepository manages clinic medicine stock.
 * Tracks inventory levels, expiration dates, and generates alerts.
 */
interface MedicineInventoryRepository : BaseRepository<MedicineInventory, String> {
    /**
     * Finds low stock items.
     * @return List of items below minimum stock
     */
    suspend fun getLowStockItems(): List<MedicineInventory>
    
    /**
     * Finds expired items.
     * @return List of expired items
     */
    suspend fun getExpiredItems(): List<MedicineInventory>
    
    /**
     * Finds items expiring soon.
     * @param daysWithin Number of days to check
     * @return List of items expiring within specified days
     */
    suspend fun getExpiringSoon(daysWithin: Int = 30): List<MedicineInventory>
    
    /**
     * Searches inventory by medicine name.
     * @param query Medicine name or partial name
     * @return List of matching items
     */
    suspend fun searchByName(query: String): List<MedicineInventory>
    
    /**
     * Gets items by category.
     * @param category Item category
     * @return List of items in category
     */
    suspend fun getByCategory(category: String): List<MedicineInventory>
    
    /**
     * Updates stock quantity (after dispensing or restocking).
     * @param itemId Item ID
     * @param quantityChange Positive for restock, negative for dispensing
     * @return Updated item
     */
    suspend fun updateStock(itemId: String, quantityChange: Int): MedicineInventory?
    
    /**
     * Gets total inventory value (for reporting).
     * @return Total count of all items
     */
    suspend fun getTotalInventoryCount(): Int
}

/**
 * QueueEntryRepository manages live queue dashboard.
 * Tracks walk-in and scheduled patients in real-time.
 */
interface QueueEntryRepository : BaseRepository<QueueEntry, String> {
    /**
     * Gets current active queue.
     * @return List of patients currently in queue
     */
    suspend fun getCurrentQueue(): List<QueueEntry>
    
    /**
     * Gets next queue number.
     * @return Next sequential queue number
     */
    suspend fun getNextQueueNumber(): Int
    
    /**
     * Adds patient to queue.
     * @param patientId Patient ID
     * @param patientName Patient name
     * @param appointmentType Walk-in or Scheduled
     * @return Created queue entry
     */
    suspend fun addToQueue(
        patientId: String,
        patientName: String,
        appointmentType: String
    ): QueueEntry
    
    /**
     * Calls next patient in queue.
     * @param queueEntryId Queue entry ID
     * @return true if called
     */
    suspend fun callPatient(queueEntryId: String): Boolean
    
    /**
     * Marks patient as being seen.
     * @param queueEntryId Queue entry ID
     * @return true if updated
     */
    suspend fun startConsultation(queueEntryId: String): Boolean
    
    /**
     * Completes queue entry.
     * @param queueEntryId Queue entry ID
     * @return true if completed
     */
    suspend fun completeQueueEntry(queueEntryId: String): Boolean
    
    /**
     * Gets queue statistics for today.
     * @return Map of status to count
     */
    suspend fun getTodayStats(): Map<String, Int>
}

/**
 * HealthAnalyticsRepository generates campus health reports.
 * Provides analytics for tracking illnesses and health trends.
 */
interface HealthAnalyticsRepository {
    /**
     * Generates health analytics report.
     * @param startDate Start of period
     * @param endDate End of period
     * @return Generated report
     */
    suspend fun generateReport(startDate: Long, endDate: Long): HealthAnalyticsReport
    
    /**
     * Gets most common illnesses in period.
     * @param startDate Start timestamp
     * @param endDate End timestamp
     * @param limit Number of top illnesses
     * @return List of illness names with counts
     */
    suspend fun getCommonIllnesses(startDate: Long, endDate: Long, limit: Int = 10): Map<String, Int>
    
    /**
     * Gets consultation count by demographic.
     * @param startDate Start timestamp
     * @param endDate End timestamp
     * @param groupBy Group by "yearLevel" or "department"
     * @return Map of demographic to count
     */
    suspend fun getDemographicBreakdown(
        startDate: Long,
        endDate: Long,
        groupBy: String
    ): Map<String, Int>
    
    /**
     * Gets monthly trend data.
     * @param months Number of months to include
     * @return List of monthly trends
     */
    suspend fun getMonthlyTrends(months: Int = 12): List<com.uni.health.model.MonthlyTrend>
    
    /**
     * Gets total consultations in period.
     * @param startDate Start timestamp
     * @param endDate End timestamp
     * @return Total count
     */
    suspend fun getTotalConsultations(startDate: Long, endDate: Long): Int
}
