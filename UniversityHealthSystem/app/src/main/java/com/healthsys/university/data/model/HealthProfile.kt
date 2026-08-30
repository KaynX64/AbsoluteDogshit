package com.healthsys.university.data.model

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.Date

/**
 * Digital Health Profile - Stores comprehensive health information for students and staff
 * This is a core component of the EMR (Electronic Medical Records) system
 * 
 * COMPLIANCE: All data in this table must be encrypted at rest per Philippine Data Privacy Act of 2012
 * Access to this data is controlled through Role-Based Access Control (RBAC)
 * 
 * @property profileId Unique identifier for the health profile
 * @property userId Reference to the User entity (foreign key)
 * @property bloodType ABO and Rh blood type (e.g., "A+", "O-", "B+")
 * @property allergies JSON array or text description of known allergies
 * @property preExistingConditions JSON array or text of chronic conditions/illnesses
 * @property currentMedications List of medications currently being taken
 * @property familyMedicalHistory Significant family medical history
 * @property lastCheckup Date of last medical consultation
 * @property vaccinationRecords JSON array of vaccination records
 * @property emergencyContactName Name of emergency contact person
 * @property emergencyContactNumber Phone number of emergency contact
 * @property emergencyContactRelationship Relationship to the emergency contact
 * @property healthInsuranceProvider Health insurance provider name
 * @property healthInsurancePolicyNumber Policy number if applicable
 * @property isDonor Organ donor status
 * @property specialNeeds Any special accommodations needed during treatment
 * @property profileCreatedAt When the health profile was first created
 * @property profileUpdatedAt Last update timestamp
 */
@Entity(
    tableName = "health_profiles",
    foreignKeys = [
        ForeignKey(
            entity = User::class,
            parentColumns = ["userId"],
            childColumns = ["userId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index(value = ["userId"], unique = true)]
)
data class HealthProfile(
    @PrimaryKey(autoGenerate = true)
    val profileId: Long = 0,
    
    val userId: Long,
    
    // Basic health information
    val bloodType: String?,
    val heightCm: Double?,
    val weightKg: Double?,
    
    // Medical history - These fields should be ENCRYPTED in production
    val allergies: String?,  // Store as JSON or delimited string
    val preExistingConditions: String?,  // Store as JSON or delimited string
    val currentMedications: String?,
    val familyMedicalHistory: String?,
    
    // Records
    val vaccinationRecords: String?,  // Store as JSON
    val lastCheckup: Date?,
    
    // Emergency contact information
    val emergencyContactName: String?,
    val emergencyContactNumber: String?,
    val emergencyContactRelationship: String?,
    
    // Insurance information
    val healthInsuranceProvider: String?,
    val healthInsurancePolicyNumber: String?,
    
    // Additional information
    val isOrganDonor: Boolean = false,
    val specialNeeds: String?,
    
    // Timestamps
    val profileCreatedAt: Date = Date(),
    val profileUpdatedAt: Date = Date()
)
