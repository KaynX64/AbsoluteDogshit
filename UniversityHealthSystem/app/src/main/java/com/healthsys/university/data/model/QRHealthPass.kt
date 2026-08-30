package com.healthsys.university.data.model

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.Date
import java.util.UUID

/**
 * QR Code Health Pass - Generates unique QR codes for touchless clinic check-ins
 * Each QR code is time-limited and single-use for security
 * 
 * SECURITY NOTES:
 * - QR codes expire after 24 hours to prevent unauthorized reuse
 * - Each code can only be scanned once (isUsed flag)
 * - Contains encrypted user ID and timestamp
 * - Clinic staff must verify identity before proceeding with consultation
 * 
 * @property qrCodeId Unique identifier
 * @property userId Reference to the user who generated the QR code
 * @property qrCodeData The actual QR code data (encrypted string or UUID)
 * @property generatedAt When the QR code was created
 * @property expiresAt When the QR code becomes invalid (24 hours from generation)
 * @property isUsed Whether the QR code has been scanned/used
 * @property usedAt Timestamp when the QR code was scanned
 * @property checkInLocation Location where QR was scanned (clinic branch)
 */
@Entity(
    tableName = "qr_health_passes",
    foreignKeys = [
        ForeignKey(
            entity = User::class,
            parentColumns = ["userId"],
            childColumns = ["userId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index(value = ["userId"]),
        Index(value = ["qrCodeData"], unique = true)
    ]
)
data class QRHealthPass(
    @PrimaryKey(autoGenerate = true)
    val qrCodeId: Long = 0,
    
    val userId: Long,
    
    // Unique QR code data - should be a cryptographically secure random UUID
    val qrCodeData: String = UUID.randomUUID().toString(),
    
    // Timestamps
    val generatedAt: Date = Date(),
    val expiresAt: Date,  // Set to generatedAt + 24 hours
    
    // Usage tracking
    val isUsed: Boolean = false,
    val usedAt: Date? = null,
    val checkInLocation: String? = null,  // e.g., "Main Campus Clinic", "North Building Infirmary"
    
    // Status: ACTIVE, EXPIRED, USED, REVOKED
    val status: QRCodeStatus = QRCodeStatus.ACTIVE
)

/**
 * Enum representing the status of a QR Health Pass
 */
enum class QRCodeStatus {
    ACTIVE,     // QR code is valid and can be scanned
    EXPIRED,    // QR code has passed its expiration time
    USED,       // QR code has been successfully scanned
    REVOKED     // QR code has been manually invalidated
}
