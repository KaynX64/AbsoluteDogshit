package com.uni.health.presentation

import com.uni.health.domain.UserRole
import com.uni.health.model.*
import com.uni.health.usecase.*

/**
 * QRCodeGenerator provides QR code generation functionality.
 * Used for generating Health Pass QR codes for touchless check-in.
 * 
 * This is a platform-specific implementation that would be different
 * for Desktop (Java) and Mobile (Android).
 */
interface QRCodeGenerator {
    /**
     * Generates QR code image from data string.
     * 
     * @param data Data to encode in QR code
     * @param size Size in pixels
     * @return Image data or byte array
     */
    suspend fun generateQRCode(data: String, size: Int = 300): Any?
    
    /**
     * Generates QR code for health profile.
     * Encodes user's QR code data for clinic check-in.
     * 
     * @param profile Health profile
     * @return QR code image
     */
    suspend fun generateHealthPassQR(profile: HealthProfile): Any? {
        return generateQRCode(profile.qrCodeData)
    }
}

/**
 * EncryptionService provides data encryption for privacy compliance.
 * Implements encryption per Philippine Data Privacy Act of 2012.
 * All medical records must be encrypted at rest and in transit.
 */
interface EncryptionService {
    /**
     * Encrypts sensitive data.
     * 
     * @param plainText Data to encrypt
     * @param key Encryption key
     * @return Encrypted data
     */
    suspend fun encrypt(plainText: String, key: String): String
    
    /**
     * Decrypts encrypted data.
     * 
     * @param encryptedData Encrypted data
     * @param key Decryption key
     * @return Original plain text
     */
    suspend fun decrypt(encryptedData: String, key: String): String
    
    /**
     * Encrypts health profile (all sensitive fields).
     * 
     * @param profile Profile to encrypt
     * @return Encrypted profile
     */
    suspend fun encryptProfile(profile: HealthProfile): HealthProfile
    
    /**
     * Decrypts health profile.
     * 
     * @param profile Encrypted profile
     * @return Decrypted profile
     */
    suspend fun decryptProfile(profile: HealthProfile): HealthProfile
}

/**
 * NotificationService handles push notifications and alerts.
 * Used for appointment reminders, emergency alerts, and stock notifications.
 */
interface NotificationService {
    /**
     * Sends push notification to user.
     * 
     * @param userId Recipient user ID
     * @param title Notification title
     * @param message Notification body
     * @param data Additional payload data
     */
    suspend fun sendPushNotification(userId: String, title: String, message: String, data: Map<String, String> = emptyMap())
    
    /**
     * Sends SMS notification.
     * 
     * @param phoneNumber Recipient phone number
     * @param message SMS content
     */
    suspend fun sendSMS(phoneNumber: String, message: String)
    
    /**
     * Sends email notification.
     * 
     * @param email Recipient email
     * @param subject Email subject
     * @param body Email content
     */
    suspend fun sendEmail(email: String, subject: String, body: String)
    
    /**
     * Sends emergency alert to response team.
     * Critical notification for SOS events.
     * 
     * @param alert Emergency alert
     * @param profile User's health profile
     */
    suspend fun sendEmergencyAlert(alert: EmergencyAlert, profile: HealthProfile)
    
    /**
     * Sends appointment reminder.
     * 
     * @param appointment Appointment details
     * @param patientName Patient name
     */
    suspend fun sendAppointmentReminder(appointment: Appointment, patientName: String)
    
    /**
     * Sends low stock alert to clinic staff.
     * 
     * @param item Low stock inventory item
     */
    suspend fun sendLowStockAlert(item: MedicineInventory)
}

/**
 * LocationService provides GPS location functionality.
 * Used for SOS panic button to send user's location.
 */
interface LocationService {
    /**
     * Gets current device location.
     * 
     * @return LocationData with coordinates
     */
    suspend fun getCurrentLocation(): LocationData?
    
    /**
     * Starts continuous location tracking.
     * For emergency situations requiring live tracking.
     * 
     * @param callback Callback for location updates
     */
    fun startTracking(callback: (LocationData) -> Unit)
    
    /**
     * Stops location tracking.
     */
    fun stopTracking()
}

/**
 * LocationData represents GPS coordinates.
 */
data class LocationData(
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float,
    val timestamp: Long = System.currentTimeMillis()
)

/**
 * FileStorageService handles file uploads and downloads.
 * Used for storing prescriptions, clearances, and medical attachments.
 */
interface FileStorageService {
    /**
     * Uploads file to storage.
     * 
     * @param fileData File bytes
     * @param fileName Original filename
     * @param mimeType File MIME type
     * @return URL or path to stored file
     */
    suspend fun uploadFile(fileData: ByteArray, fileName: String, mimeType: String): String
    
    /**
     * Downloads file from storage.
     * 
     * @param fileUrl URL or path to file
     * @return File bytes
     */
    suspend fun downloadFile(fileUrl: String): ByteArray
    
    /**
     * Deletes file from storage.
     * 
     * @param fileUrl URL or path to file
     * @return true if deleted
     */
    suspend fun deleteFile(fileUrl: String): Boolean
    
    /**
     * Generates PDF from prescription.
     * 
     * @param prescription Prescription data
     * @return PDF file URL
     */
    suspend fun generatePrescriptionPDF(prescription: Prescription): String
    
    /**
     * Generates PDF from medical clearance.
     * 
     * @param clearance Clearance data
     * @return PDF file URL
     */
    suspend fun generateClearancePDF(clearance: MedicalClearance): String
}

/**
 * PermissionManager handles role-based access control.
 * Ensures users can only access data they're authorized for.
 */
class PermissionManager {
    
    /**
     * Checks if user has required role.
     * 
     * @param user User to check
     * @param requiredRole Required role
     * @return true if user has role
     */
    fun hasRole(user: User?, requiredRole: UserRole): Boolean {
        return user?.role == requiredRole
    }
    
    /**
     * Checks if user has any of the required roles.
     * 
     * @param user User to check
     * @param requiredRoles List of acceptable roles
     * @return true if user has any required role
     */
    fun hasAnyRole(user: User?, requiredRoles: List<UserRole>): Boolean {
        return user?.role in requiredRoles
    }
    
    /**
     * Checks if user can access medical record.
     * Only doctor who created it or admin can access.
     * 
     * @param user User requesting access
     * @param record Medical record
     * @return true if authorized
     */
    fun canAccessMedicalRecord(user: User, record: MedicalRecord): Boolean {
        return user.role == UserRole.ADMIN || 
               user.role == UserRole.DOCTOR && record.doctorId == user.id ||
               user.role == UserRole.NURSE
    }
    
    /**
     * Checks if user can view health profile.
     * 
     * @param viewer User requesting access
     * @param profile Profile to access
     * @return true if authorized
     */
    fun canViewProfile(viewer: User, profile: HealthProfile): Boolean {
        return viewer.role == UserRole.ADMIN ||
               viewer.role == UserRole.DOCTOR ||
               viewer.role == UserRole.NURSE ||
               viewer.id == profile.userId // Own profile
    }
    
    /**
     * Checks if user can issue medical clearance.
     * Only doctors and authorized nurses can issue.
     * 
     * @param user User attempting to issue
     * @return true if authorized
     */
    fun canIssueClearance(user: User): Boolean {
        return user.role == UserRole.DOCTOR || user.role == UserRole.NURSE
    }
    
    /**
     * Checks if user can manage inventory.
     * Only clinic staff and admin can manage.
     * 
     * @param user User attempting to manage
     * @return true if authorized
     */
    fun canManageInventory(user: User): Boolean {
        return user.role == UserRole.ADMIN ||
               user.role == UserRole.DOCTOR ||
               user.role == UserRole.NURSE
    }
    
    /**
     * Checks if user can view analytics.
     * Only admin and head clinic staff can view.
     * 
     * @param user User requesting access
     * @return true if authorized
     */
    fun canViewAnalytics(user: User): Boolean {
        return user.role == UserRole.ADMIN || user.role == UserRole.DOCTOR
    }
    
    /**
     * Checks if user can respond to emergencies.
     * Emergency personnel, doctors, nurses can respond.
     * 
     * @param user User attempting to respond
     * @return true if authorized
     */
    fun canRespondToEmergency(user: User): Boolean {
        return user.role == UserRole.EMERGENCY ||
               user.role == UserRole.DOCTOR ||
               user.role == UserRole.NURSE ||
               user.role == UserRole.ADMIN
    }
}

/**
 * SessionManager handles user sessions and authentication state.
 */
class SessionManager {
    private var currentUser: User? = null
    
    /**
     * Gets current logged-in user.
     */
    fun getCurrentUser(): User? = currentUser
    
    /**
     * Sets current user after successful login.
     */
    fun setCurrentUser(user: User?) {
        currentUser = user
    }
    
    /**
     * Checks if user is logged in.
     */
    fun isLoggedIn(): Boolean = currentUser != null
    
    /**
     * Logs out current user.
     */
    fun logout() {
        currentUser = null
    }
    
    /**
     * Checks if current user has specific role.
     */
    fun hasRole(role: UserRole): Boolean {
        return currentUser?.role == role
    }
}
