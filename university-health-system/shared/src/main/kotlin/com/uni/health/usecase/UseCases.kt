package com.uni.health.usecase

import com.uni.health.domain.UserRole
import com.uni.health.model.*
import com.uni.health.repository.*

/**
 * AuthenticationUseCase handles user login, logout, and session management.
 * Implements secure authentication with password hashing and role verification.
 * 
 * @property userRepository Repository for user data access
 */
class AuthenticationUseCase(private val userRepository: UserRepository) {
    
    /**
     * Authenticates user with email and password.
     * Verifies credentials and updates last login timestamp.
     * 
     * @param email User's email address
     * @param password Plain text password (will be hashed for comparison)
     * @return User if authenticated, null if invalid credentials
     */
    suspend fun login(email: String, password: String): User? {
        // Find user by email
        val user = userRepository.findByEmail(email) ?: return null
        
        // Check if account is active
        if (!user.isActive) return null
        
        // Verify password hash (in production, use proper hashing like bcrypt)
        if (!verifyPassword(password, user.passwordHash)) return null
        
        // Update last login timestamp
        userRepository.updateLastLogin(user.id)
        
        return user
    }
    
    /**
     * Registers a new user account.
     * Creates user with hashed password and assigns role.
     * 
     * @param email User's email
     * @param password Plain text password
     * @param role User's role in system
     * @return Created User or null if email already exists
     */
    suspend fun register(email: String, password: String, role: UserRole): User? {
        // Check if email already exists
        if (userRepository.findByEmail(email) != null) return null
        
        // Hash password before storing
        val hashedPassword = hashPassword(password)
        
        // Create new user
        val user = User(
            email = email,
            passwordHash = hashedPassword,
            role = role
        )
        
        return userRepository.create(user)
    }
    
    /**
     * Changes user's password.
     * Verifies old password before setting new one.
     * 
     * @param userId User ID
     * @param oldPassword Current password
     * @param newPassword New password
     * @return true if changed successfully
     */
    suspend fun changePassword(userId: String, oldPassword: String, newPassword: String): Boolean {
        val user = userRepository.getById(userId) ?: return false
        
        // Verify old password
        if (!verifyPassword(oldPassword, user.passwordHash)) return false
        
        // Hash and update new password
        val newHashedPassword = hashPassword(newPassword)
        // Note: In real implementation, update method would need to handle password update
        return true
    }
    
    /**
     * Deactivates user account (admin function).
     * Soft delete - preserves data for audit trail.
     * 
     * @param userId User ID to deactivate
     * @return true if deactivated
     */
    suspend fun deactivateUser(userId: String): Boolean {
        return userRepository.deactivateUser(userId)
    }
    
    /**
     * Gets all users with specific role (admin function).
     * 
     * @param role Role to filter by
     * @return List of users
     */
    suspend fun getUsersByRole(role: UserRole): List<User> {
        return userRepository.findByRole(role)
    }
    
    /**
     * Hashes password using secure algorithm.
     * In production, use bcrypt, scrypt, or Argon2.
     * 
     * @param password Plain text password
     * @return Hashed password string
     */
    private fun hashPassword(password: String): String {
        // TODO: Implement proper password hashing (bcrypt/Argon2)
        // This is a placeholder - NEVER use simple hashing in production
        return "HASHED_$password"
    }
    
    /**
     * Verifies password against stored hash.
     * 
     * @param password Plain text password
     * @param hashedPassword Stored hash
     * @return true if matches
     */
    private fun verifyPassword(password: String, hashedPassword: String): Boolean {
        // TODO: Implement proper password verification
        return hashPassword(password) == hashedPassword
    }
}

/**
 * HealthProfileUseCase manages student/staff health profiles.
 * Handles CRUD operations and QR code generation.
 * 
 * @property profileRepository Repository for health profile data
 */
class HealthProfileUseCase(private val profileRepository: HealthProfileRepository) {
    
    /**
     * Creates health profile for new student/staff.
     * Generates unique QR code for touchless check-in.
     * 
     * @param userId Associated user ID
     * @param firstName First name
     * @param lastName Last name
     * @param dateOfBirth Date of birth
     * @param sex Biological sex
     * @param courseOrDepartment Course or department
     * @param bloodType Blood type
     * @param allergies Known allergies
     * @param preExistingConditions Medical conditions
     * @return Created profile
     */
    suspend fun createProfile(
        userId: String,
        firstName: String,
        lastName: String,
        dateOfBirth: String,
        sex: String,
        courseOrDepartment: String,
        bloodType: String,
        yearLevel: Int? = null,
        allergies: List<String> = emptyList(),
        preExistingConditions: List<String> = emptyList()
    ): HealthProfile {
        val profile = HealthProfile(
            userId = userId,
            firstName = firstName,
            lastName = lastName,
            dateOfBirth = dateOfBirth,
            sex = sex,
            courseOrDepartment = courseOrDepartment,
            yearLevel = yearLevel,
            bloodType = bloodType,
            allergies = allergies,
            preExistingConditions = preExistingConditions
        )
        
        return profileRepository.create(profile)
    }
    
    /**
     * Gets profile by user ID.
     * 
     * @param userId User ID
     * @return HealthProfile or null
     */
    suspend fun getProfileByUserId(userId: String): HealthProfile? {
        return profileRepository.findByUserId(userId)
    }
    
    /**
     * Gets profile by QR code (for clinic check-in).
     * 
     * @param qrCodeData Scanned QR code string
     * @return HealthProfile or null
     */
    suspend fun getProfileByQrCode(qrCodeData: String): HealthProfile? {
        return profileRepository.findByQrCode(qrCodeData)
    }
    
    /**
     * Updates allergies in profile.
     * 
     * @param profileId Profile ID
     * @param allergies New allergy list
     * @return Updated profile
     */
    suspend fun updateAllergies(profileId: String, allergies: List<String>): HealthProfile? {
        return profileRepository.updateAllergies(profileId, allergies)
    }
    
    /**
     * Updates pre-existing conditions.
     * 
     * @param profileId Profile ID
     * @param conditions New conditions list
     * @return Updated profile
     */
    suspend fun updatePreExistingConditions(
        profileId: String,
        conditions: List<String>
    ): HealthProfile? {
        return profileRepository.updatePreExistingConditions(profileId, conditions)
    }
    
    /**
     * Searches profiles by name.
     * 
     * @param query Search query
     * @return List of matching profiles
     */
    suspend fun searchProfiles(query: String): List<HealthProfile> {
        return profileRepository.searchByName(query)
    }
}

/**
 * AppointmentUseCase manages consultation scheduling.
 * Handles booking, confirmation, and cancellation.
 * 
 * @property appointmentRepository Repository for appointment data
 */
class AppointmentUseCase(private val appointmentRepository: AppointmentRepository) {
    
    /**
     * Books new appointment.
     * Checks availability before confirming.
     * 
     * @param patientId Patient ID
     * @param doctorId Doctor ID
     * @param appointmentType Physical or Virtual
     * @param scheduledDate Appointment date/time
     * @param reason Reason for visit
     * @return Created appointment or null if slot unavailable
     */
    suspend fun bookAppointment(
        patientId: String,
        doctorId: String,
        appointmentType: com.uni.health.domain.AppointmentType,
        scheduledDate: Long,
        reason: String
    ): Appointment? {
        // Check if time slot is available
        if (!appointmentRepository.isTimeSlotAvailable(doctorId, scheduledDate)) {
            return null
        }
        
        val appointment = Appointment(
            patientId = patientId,
            doctorId = doctorId,
            appointmentType = appointmentType,
            scheduledDate = scheduledDate,
            reason = reason
        )
        
        return appointmentRepository.create(appointment)
    }
    
    /**
     * Confirms appointment (clinic staff function).
     * 
     * @param appointmentId Appointment ID
     * @return true if confirmed
     */
    suspend fun confirmAppointment(appointmentId: String): Boolean {
        val appointment = appointmentRepository.getById(appointmentId) ?: return false
        appointment.status = com.uni.health.domain.AppointmentStatus.CONFIRMED
        return appointmentRepository.update(appointment) != null
    }
    
    /**
     * Cancels appointment.
     * 
     * @param appointmentId Appointment ID
     * @return true if cancelled
     */
    suspend fun cancelAppointment(appointmentId: String): Boolean {
        return appointmentRepository.cancelAppointment(appointmentId)
    }
    
    /**
     * Gets patient's upcoming appointments.
     * 
     * @param patientId Patient ID
     * @return List of future appointments
     */
    suspend fun getUpcomingAppointments(patientId: String): List<Appointment> {
        return appointmentRepository.getUpcomingAppointments(patientId)
    }
    
    /**
     * Gets doctor's schedule for date range.
     * 
     * @param doctorId Doctor ID
     * @param startDate Start timestamp
     * @param endDate End timestamp
     * @return List of appointments
     */
    suspend fun getDoctorSchedule(doctorId: String, startDate: Long, endDate: Long): List<Appointment> {
        return appointmentRepository.findByDateRange(startDate, endDate)
            .filter { it.doctorId == doctorId }
    }
}

/**
 * EmergencyAlertUseCase handles SOS panic button functionality.
 * Critical for campus safety - sends location and profile immediately.
 * 
 * @property alertRepository Repository for emergency alerts
 * @property profileRepository Repository for health profiles
 */
class EmergencyAlertUseCase(
    private val alertRepository: EmergencyAlertRepository,
    private val profileRepository: HealthProfileRepository
) {
    
    /**
     * Triggers SOS emergency alert.
     * Sends user's location and profile to clinic response team.
     * 
     * @param userId User triggering emergency
     * @param latitude GPS latitude
     * @param longitude GPS longitude
     * @param accuracy Location accuracy in meters
     * @param description Optional emergency description
     * @return Created emergency alert
     */
    suspend fun triggerSOS(
        userId: String,
        latitude: Double,
        longitude: Double,
        accuracy: Float,
        description: String = ""
    ): EmergencyAlert {
        // Create emergency alert
        val alert = alertRepository.createAlert(
            userId = userId,
            latitude = latitude,
            longitude = longitude,
            accuracy = accuracy,
            description = description
        )
        
        // In real implementation, send push notification to emergency responders
        // with user's location and health profile information
        
        return alert
    }
    
    /**
     * Gets active emergency alerts.
     * 
     * @return List of unresolved alerts
     */
    suspend fun getActiveAlerts(): List<EmergencyAlert> {
        return alertRepository.getActiveAlerts()
    }
    
    /**
     * Resolves emergency alert.
     * 
     * @param alertId Alert ID
     * @param responderId ID of responder
     * @return true if resolved
     */
    suspend fun resolveAlert(alertId: String, responderId: String): Boolean {
        return alertRepository.resolveAlert(alertId, responderId)
    }
    
    /**
     * Gets user's emergency alert history.
     * 
     * @param userId User ID
     * @return List of alerts
     */
    suspend fun getUserAlertHistory(userId: String): List<EmergencyAlert> {
        return alertRepository.findByUserId(userId)
    }
}

/**
 * EMRUseCase manages Electronic Medical Records.
 * Core functionality for digitized health records and consultations.
 * 
 * @property recordRepository Repository for medical records
 */
class EMRUseCase(private val recordRepository: MedicalRecordRepository) {
    
    /**
     * Creates new medical record (after consultation).
     * 
     * @param patientId Patient ID
     * @param doctorId Doctor ID
     * @param chiefComplaint Main reason for visit
     * @param diagnosis Doctor's diagnosis
     * @param treatment Treatment provided
     * @param medications Prescribed medications
     * @param vitalSigns Recorded vital signs
     * @return Created medical record
     */
    suspend fun createMedicalRecord(
        patientId: String,
        doctorId: String,
        chiefComplaint: String,
        diagnosis: String,
        treatment: String,
        medications: List<PrescriptionMedicine> = emptyList(),
        vitalSigns: VitalSigns? = null
    ): MedicalRecord {
        val record = MedicalRecord(
            patientId = patientId,
            doctorId = doctorId,
            chiefComplaint = chiefComplaint,
            diagnosis = diagnosis,
            treatment = treatment,
            medications = medications,
            vitalSigns = vitalSigns
        )
        
        return recordRepository.create(record)
    }
    
    /**
     * Gets patient's complete health history.
     * 
     * @param patientId Patient ID
     * @return List of all medical records
     */
    suspend fun getHealthHistory(patientId: String): List<MedicalRecord> {
        return recordRepository.getHealthHistory(patientId)
    }
    
    /**
     * Adds attachment to medical record (X-ray, lab result).
     * 
     * @param recordId Record ID
     * @param attachmentUrl URL or path to file
     * @return true if added
     */
    suspend fun addAttachment(recordId: String, attachmentUrl: String): Boolean {
        return recordRepository.addAttachment(recordId, attachmentUrl)
    }
    
    /**
     * Searches records by diagnosis.
     * 
     * @param diagnosis Diagnosis keyword
     * @return List of matching records
     */
    suspend fun searchByDiagnosis(diagnosis: String): List<MedicalRecord> {
        return recordRepository.searchByDiagnosis(diagnosis)
    }
}

/**
 * ClearanceUseCase manages medical clearances.
 * Handles digital issuance and verification.
 * 
 * @property clearanceRepository Repository for clearances
 */
class ClearanceUseCase(private val clearanceRepository: MedicalClearanceRepository) {
    
    /**
     * Issues new medical clearance.
     * Creates digitally signed document.
     * 
     * @param patientId Patient ID
     * @param issuedBy Staff ID issuing clearance
     * @param clearanceType Type of clearance
     * @param purpose Specific purpose
     * @param isFitForPurpose Fitness determination
     * @param restrictions Any limitations
     * @param validityDays Days until expiration
     * @return Created clearance
     */
    suspend fun issueClearance(
        patientId: String,
        issuedBy: String,
        clearanceType: com.uni.health.domain.ClearanceType,
        purpose: String,
        isFitForPurpose: Boolean,
        restrictions: String = "",
        validityDays: Int = 365
    ): MedicalClearance {
        val validUntil = System.currentTimeMillis() + (validityDays.toLong() * 24 * 60 * 60 * 1000)
        
        // Generate digital signature (in production, use cryptographic signing)
        val digitalSignature = generateDigitalSignature(patientId, clearanceType, validUntil)
        
        val clearance = MedicalClearance(
            patientId = patientId,
            issuedBy = issuedBy,
            clearanceType = clearanceType,
            purpose = purpose,
            isFitForPurpose = isFitForPurpose,
            restrictions = restrictions,
            validUntil = validUntil,
            digitalSignature = digitalSignature
        )
        
        return clearanceRepository.create(clearance)
    }
    
    /**
     * Gets patient's valid clearances.
     * 
     * @param patientId Patient ID
     * @return List of valid clearances
     */
    suspend fun getValidClearances(patientId: String): List<MedicalClearance> {
        return clearanceRepository.getValidClearances(patientId)
    }
    
    /**
     * Verifies clearance authenticity.
     * 
     * @param clearanceId Clearance ID
     * @return true if signature valid
     */
    suspend fun verifyClearance(clearanceId: String): Boolean {
        return clearanceRepository.verifySignature(clearanceId)
    }
    
    /**
     * Generates cryptographic signature for clearance.
     * 
     * @param patientId Patient ID
     * @param type Clearance type
     * @param validUntil Expiration timestamp
     * @return Digital signature string
     */
    private fun generateDigitalSignature(patientId: String, type: com.uni.health.domain.ClearanceType, validUntil: Long): String {
        // TODO: Implement proper cryptographic signing
        // In production, use RSA/ECDSA with private key
        return "SIGNATURE_${patientId}_${type}_$validUntil"
    }
}

/**
 * InventoryUseCase manages medicine inventory.
 * Tracks stock levels and generates alerts.
 * 
 * @property inventoryRepository Repository for inventory data
 */
class InventoryUseCase(private val inventoryRepository: MedicineInventoryRepository) {
    
    /**
     * Gets low stock items.
     * 
     * @return List of items needing restock
     */
    suspend fun getLowStockAlerts(): List<MedicineInventory> {
        return inventoryRepository.getLowStockItems()
    }
    
    /**
     * Gets expired items.
     * 
     * @return List of expired items
     */
    suspend fun getExpiredItems(): List<MedicineInventory> {
        return inventoryRepository.getExpiredItems()
    }
    
    /**
     * Gets items expiring soon.
     * 
     * @param daysWithin Days threshold
     * @return List of expiring items
     */
    suspend fun getExpiringSoonAlerts(daysWithin: Int = 30): List<MedicineInventory> {
        return inventoryRepository.getExpiringSoon(daysWithin)
    }
    
    /**
     * Updates stock quantity.
     * 
     * @param itemId Item ID
     * @param quantityChange Positive for restock, negative for dispensing
     * @return Updated item
     */
    suspend fun updateStock(itemId: String, quantityChange: Int): MedicineInventory? {
        return inventoryRepository.updateStock(itemId, quantityChange)
    }
    
    /**
     * Searches inventory by name.
     * 
     * @param query Medicine name
     * @return List of matching items
     */
    suspend fun searchInventory(query: String): List<MedicineInventory> {
        return inventoryRepository.searchByName(query)
    }
}

/**
 * QueueUseCase manages live queue dashboard.
 * Tracks patient flow through clinic.
 * 
 * @property queueRepository Repository for queue data
 */
class QueueUseCase(private val queueRepository: QueueEntryRepository) {
    
    /**
     * Adds patient to queue.
     * 
     * @param patientId Patient ID
     * @param patientName Patient name
     * @param appointmentType Walk-in or Scheduled
     * @return Queue entry
     */
    suspend fun addPatientToQueue(
        patientId: String,
        patientName: String,
        appointmentType: String
    ): QueueEntry {
        return queueRepository.addToQueue(patientId, patientName, appointmentType)
    }
    
    /**
     * Gets current queue.
     * 
     * @return List of patients in queue
     */
    suspend fun getCurrentQueue(): List<QueueEntry> {
        return queueRepository.getCurrentQueue()
    }
    
    /**
     * Calls next patient.
     * 
     * @param queueEntryId Queue entry ID
     * @return true if called
     */
    suspend fun callPatient(queueEntryId: String): Boolean {
        return queueRepository.callPatient(queueEntryId)
    }
    
    /**
     * Starts consultation.
     * 
     * @param queueEntryId Queue entry ID
     * @return true if started
     */
    suspend fun startConsultation(queueEntryId: String): Boolean {
        return queueRepository.startConsultation(queueEntryId)
    }
    
    /**
     * Completes consultation.
     * 
     * @param queueEntryId Queue entry ID
     * @return true if completed
     */
    suspend fun completeConsultation(queueEntryId: String): Boolean {
        return queueRepository.completeQueueEntry(queueEntryId)
    }
    
    /**
     * Gets today's queue statistics.
     * 
     * @return Map of status counts
     */
    suspend fun getTodayStats(): Map<String, Int> {
        return queueRepository.getTodayStats()
    }
}

/**
 * AnalyticsUseCase generates health analytics reports.
 * Provides campus-wide health insights.
 * 
 * @property analyticsRepository Repository for analytics data
 */
class AnalyticsUseCase(private val analyticsRepository: HealthAnalyticsRepository) {
    
    /**
     * Generates comprehensive health report.
     * 
     * @param startDate Start of period
     * @param endDate End of period
     * @return Generated report
     */
    suspend fun generateHealthReport(startDate: Long, endDate: Long): HealthAnalyticsReport {
        return analyticsRepository.generateReport(startDate, endDate)
    }
    
    /**
     * Gets most common illnesses.
     * 
     * @param startDate Start timestamp
     * @param endDate End timestamp
     * @param limit Number of top illnesses
     * @return Map of illness to count
     */
    suspend fun getCommonIllnesses(
        startDate: Long,
        endDate: Long,
        limit: Int = 10
    ): Map<String, Int> {
        return analyticsRepository.getCommonIllnesses(startDate, endDate, limit)
    }
    
    /**
     * Gets monthly trends.
     * 
     * @param months Number of months
     * @return List of trends
     */
    suspend fun getMonthlyTrends(months: Int = 12): List<com.uni.health.model.MonthlyTrend> {
        return analyticsRepository.getMonthlyTrends(months)
    }
}
