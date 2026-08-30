package com.healthsys.university.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.Date

/**
 * User entity representing all users in the system (Students, Staff, Clinic Personnel, Admins)
 * This is the base user table with role-based access control
 * 
 * @property userId Unique identifier for each user
 * @property email User's email address (used for login)
 * @property passwordHash Hashed password for security (never store plain text passwords)
 * @property firstName User's first name
 * @property lastName User's last name
 * @property dateOfBirth User's date of birth
 * @property phoneNumber Contact number
 * @property role User role: STUDENT, STAFF, NURSE, DOCTOR, ADMIN, EMERGENCY_PERSONNEL
 * @property department Department/College (for students and staff)
 * @property course Course/Program (for students only)
 * @property yearLevel Academic year level (for students: 1-5)
 * @position Position/Designation (for staff and clinic personnel)
 * @property isActive Whether the account is currently active
 * @property createdAt Account creation timestamp
 * @property lastLogin Last login timestamp
 */
@Entity(tableName = "users")
data class User(
    @PrimaryKey(autoGenerate = true)
    val userId: Long = 0,
    
    val email: String,
    val passwordHash: String,
    
    val firstName: String,
    val lastName: String,
    val dateOfBirth: Date,
    val phoneNumber: String,
    
    // Role-based access control
    val role: UserRole,
    
    // Academic/Employment information
    val department: String?,
    val course: String?,
    val yearLevel: Int?,
    val position: String?,
    
    // Account status
    val isActive: Boolean = true,
    val isVerified: Boolean = false,
    
    // Timestamps
    val createdAt: Date = Date(),
    val lastLogin: Date? = null,
    val updatedAt: Date = Date()
)

/**
 * Enum defining all possible user roles in the system
 * Each role has specific permissions defined in RoleBasedAccessControl
 */
enum class UserRole {
    STUDENT,              // Can access health profile, schedule appointments, view prescriptions
    STAFF,                // Faculty members with similar access to students
    NURSE,                // Can view/edit EMR, manage queue, issue clearances
    DOCTOR,               // Full EMR access, can prescribe medication, sign clearances
    DENTIST,              // Specialized access for dental records
    ADMIN,                // System administration, user management, RBAC configuration
    EMERGENCY_PERSONNEL   // Access to SOS alerts and emergency response features
}
