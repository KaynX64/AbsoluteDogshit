package util

import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.client.j2se.MatrixToImageWriter
import java.nio.file.FileSystems

/**
 * Utility object for QR Code generation.
 * Used for generating unique health pass QR codes for touchless check-ins.
 */
object QRCodeGenerator {
    
    /**
     * Generates a QR code image from the given content.
     * The QR code can contain user ID, appointment ID, or health pass data.
     * 
     * @param content The data to encode in the QR code
     * @param filePath The path where the QR code image will be saved
     * @param width Width of the QR code image in pixels
     * @param height Height of the QR code image in pixels
     */
    fun generateQRCode(content: String, filePath: String, width: Int = 300, height: Int = 300) {
        try {
            val qrWriter = QRCodeWriter()
            
            // Configure encoding hints for better QR code quality
            val hints = mapOf(
                EncodeHintType.CHARACTER_SET to "UTF-8",
                EncodeHintType.ERROR_CORRECTION to com.google.zxing.qrcode.decoder.ErrorCorrectionLevel.M
            )
            
            // Create the bit matrix for the QR code
            val bitMatrix = qrWriter.encode(content, BarcodeFormat.QR_CODE, width, height, hints)
            
            // Write the QR code to a PNG file
            val path = FileSystems.getDefault().getPath(filePath)
            MatrixToImageWriter.writeToPath(bitMatrix, "PNG", path)
            
            println("QR Code generated successfully at: $filePath")
        } catch (e: Exception) {
            println("Error generating QR code: ${e.message}")
            throw e
        }
    }
    
    /**
     * Generates a QR code for a student/staff health pass.
     * Contains encoded user information for quick verification.
     */
    fun generateHealthPassQR(userId: String, userName: String, bloodType: String?): String {
        // Create JSON-like content for the QR code
        // In production, this should be signed/encrypted for security
        val qrContent = buildString {
            append("{\"type\":\"HEALTH_PASS\"")
            append(",\"userId\":\"$userId\"")
            append(",\"name\":\"$userName\"")
            if (bloodType != null) {
                append(",\"bloodType\":\"$bloodType\"")
            }
            append(",\"timestamp\":${System.currentTimeMillis()}")
            append("}")
        }
        
        val fileName = "health_pass_${userId}_${System.currentTimeMillis()}.png"
        generateQRCode(qrContent, "data/qrcodes/$fileName")
        
        return fileName
    }
    
    /**
     * Generates a QR code for appointment check-in.
     * Scanning this QR code at the clinic will check in the patient.
     */
    fun generateAppointmentQR(appointmentId: String, patientName: String): String {
        val qrContent = buildString {
            append("{\"type\":\"APPOINTMENT\"")
            append(",\"appointmentId\":\"$appointmentId\"")
            append(",\"patient\":\"$patientName\"")
            append(",\"timestamp\":${System.currentTimeMillis()}")
            append("}")
        }
        
        val fileName = "appointment_${appointmentId}.png"
        generateQRCode(qrContent, "data/qrcodes/$fileName")
        
        return fileName
    }
}

/**
 * Simple encryption utility for data privacy compliance.
 * NOTE: This is a placeholder. In production, use proper encryption libraries
 * and follow Philippine Data Privacy Act requirements.
 */
object DataEncryption {
    
    /**
     * Encrypts sensitive data.
     * WARNING: This is a placeholder implementation!
     * In production, use AES-256 encryption with proper key management.
     */
    fun encrypt(data: String): String {
        // TODO: Implement proper encryption using javax.crypto.Cipher
        // Example: AES/CBC/PKCS5Padding with secure key storage
        return "ENCRYPTED:$data" // Placeholder
    }
    
    /**
     * Decrypts encrypted data.
     * WARNING: This is a placeholder implementation!
     */
    fun decrypt(encryptedData: String): String {
        // TODO: Implement proper decryption
        return encryptedData.removePrefix("ENCRYPTED:") // Placeholder
    }
    
    /**
     * Hashes data for integrity verification.
     * Used for digital signatures on medical clearances.
     */
    fun hash(data: String): String {
        // TODO: Use SHA-256 or better hashing algorithm
        return "HASH:${data.hashCode()}" // Placeholder
    }
}

/**
 * Validates data according to system requirements.
 */
object Validators {
    
    /**
     * Validates email format.
     */
    fun isValidEmail(email: String): Boolean {
        val emailRegex = "^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$".toRegex()
        return emailRegex.matches(email)
    }
    
    /**
     * Validates phone number format (Philippine format).
     */
    fun isValidPhilippinePhone(phone: String): Boolean {
        // Accepts formats like: 09171234567, +639171234567, 02-8123-4567
        val phoneRegex = "^(\\+63|0)?9\\d{9}|^(02)\\d{8}$".toRegex()
        return phoneRegex.matches(phone.replace("-", "").replace(" ", ""))
    }
    
    /**
     * Validates blood type.
     */
    fun isValidBloodType(bloodType: String?): Boolean {
        if (bloodType == null) return true // Blood type is optional
        val validTypes = listOf("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-")
        return bloodType.uppercase() in validTypes
    }
    
    /**
     * Checks if a date is in the future.
     */
    fun isFutureDate(timestamp: Long): Boolean {
        return timestamp > System.currentTimeMillis()
    }
}
