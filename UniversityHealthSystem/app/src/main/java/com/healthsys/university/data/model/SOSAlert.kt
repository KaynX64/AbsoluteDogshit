package com.healthsys.university.data.model

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.Date

/**
 * SOS Emergency Alert - One-tap emergency button system
 * Immediately sends user's location and profile to clinic response team
 * 
 * CRITICAL FEATURES:
 * - Instant alert transmission to all emergency responders
 * - Real-time location tracking during emergency
 * - Automatic notification to nearest clinic station
 * - Integration with campus security
 * 
 * SECURITY & PRIVACY:
 * - Location data is only transmitted when SOS is activated
 * - Alert history is retained for 90 days per policy
 * - False alarm reporting mechanism included
 * 
 * @property alertId Unique identifier
 * @property userId User who triggered the SOS
 * @property latitude GPS latitude coordinate
 * @property longitude GPS longitude coordinate
 * @property accuracy Accuracy of GPS location in meters
 * @property alertType MEDICAL_EMERGENCY, ACCIDENT, INJURY, OTHER
 * @property status ACTIVE, RESPONDING, RESOLVED, FALSE_ALARM
 * @property triggeredAt When the SOS button was pressed
 * @property respondedAt When emergency team acknowledged
 * @property resolvedAt When the situation was resolved
 * @property responderNotes Notes from emergency responders
 * @property isFalseAlarm Whether this was a false alarm
 */
@Entity(
    tableName = "sos_alerts",
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
        Index(value = ["status"]),
        Index(value = ["triggeredAt"])
    ]
)
data class SOSAlert(
    @PrimaryKey(autoGenerate = true)
    val alertId: Long = 0,
    
    val userId: Long,
    
    // Location data - Critical for emergency response
    val latitude: Double,
    val longitude: Double,
    val accuracy: Float,  // GPS accuracy in meters
    val locationProvider: String,  // "gps", "network", or "fused"
    
    // Alert details
    val alertType: SOSEmergencyType = SOSEmergencyType.MEDICAL_EMERGENCY,
    val userDescription: String?,  // Optional description from user
    
    // Status tracking
    var status: SOSStatus = SOSStatus.ACTIVE,
    
    // Timestamps
    val triggeredAt: Date = Date(),
    val respondedAt: Date? = null,
    val arrivedAt: Date? = null,
    val resolvedAt: Date? = null,
    
    // Response information
    val responderIds: String?,  // Comma-separated list of responder user IDs
    val responderNotes: String?,
    
    // False alarm tracking
    val isFalseAlarm: Boolean = false,
    val falseAlarmReason: String? = null
)

/**
 * Enum for types of SOS emergencies
 */
enum class SOSEmergencyType {
    MEDICAL_EMERGENCY,  // Sudden illness, cardiac arrest, etc.
    ACCIDENT,           // Physical accident/injury
    ALLERGIC_REACTION,  // Severe allergic reaction
    SEIZURE,           // Epileptic seizure
    INJURY,            // Physical injury
    MENTAL_HEALTH,     // Mental health crisis
    OTHER              // Other emergency situations
}

/**
 * Enum for SOS alert status lifecycle
 */
enum class SOSStatus {
    ACTIVE,         // Alert sent, awaiting response
    ACKNOWLEDGED,   // Emergency team has acknowledged
    RESPONDING,     // Team is en route to location
    ON_SCENE,       // Team has arrived at location
    RESOLVED,       // Situation handled
    FALSE_ALARM     // Determined to be false alarm
}
