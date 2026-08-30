package com.healthsys.university.data.local.dao

import androidx.room.*
import com.healthsys.university.data.model.User
import com.healthsys.university.data.model.UserRole
import kotlinx.coroutines.flow.Flow

/**
 * UserDao - Data Access Object for User entity
 * 
 * Provides all database operations for user management including:
 * - CRUD operations (Create, Read, Update, Delete)
 * - Authentication queries (login by email)
 * - Role-based queries (get users by role)
 * - Search functionality
 * 
 * All methods support coroutines for asynchronous database access
 */
@Dao
interface UserDao {
    
    // ==================== INSERT OPERATIONS ====================
    
    /**
     * Insert a new user into the database
     * @param user User object to insert
     * @return Row ID of the inserted user
     */
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertUser(user: User): Long
    
    /**
     * Insert multiple users at once (batch insert)
     * Useful for initial data seeding or bulk imports
     * @param users List of User objects to insert
     */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertAllUsers(users: List<User>)
    
    // ==================== UPDATE OPERATIONS ====================
    
    /**
     * Update an existing user's information
     * @param user User object with updated values
     */
    @Update
    suspend fun updateUser(user: User)
    
    /**
     * Update specific fields of a user (partial update)
     * @param userId ID of the user to update
     * @param lastLogin New last login timestamp
     */
    @Query("UPDATE users SET lastLogin = :lastLogin, updatedAt = CURRENT_TIMESTAMP WHERE userId = :userId")
    suspend fun updateLastLogin(userId: Long, lastLogin: Long)
    
    /**
     * Activate or deactivate a user account
     * @param userId ID of the user
     * @param isActive New active status
     */
    @Query("UPDATE users SET isActive = :isActive, updatedAt = CURRENT_TIMESTAMP WHERE userId = :userId")
    suspend fun updateUserActiveStatus(userId: Long, isActive: Boolean)
    
    // ==================== DELETE OPERATIONS ====================
    
    /**
     * Delete a user from the database
     * NOTE: This will cascade delete related health profiles, appointments, etc.
     * @param user User object to delete
     */
    @Delete
    suspend fun deleteUser(user: User)
    
    /**
     * Delete user by ID
     * @param userId ID of the user to delete
     */
    @Query("DELETE FROM users WHERE userId = :userId")
    suspend fun deleteUserById(userId: Long)
    
    // ==================== QUERY OPERATIONS ====================
    
    /**
     * Get a user by their unique ID
     * @param userId The user's ID
     * @return User object or null if not found
     */
    @Query("SELECT * FROM users WHERE userId = :userId LIMIT 1")
    suspend fun getUserById(userId: Long): User?
    
    /**
     * Get a user by email address (for authentication)
     * @param email User's email address
     * @return User object or null if not found
     */
    @Query("SELECT * FROM users WHERE email = :email LIMIT 1")
    suspend fun getUserByEmail(email: String): User?
    
    /**
     * Get all users with a specific role
     * @param role The UserRole to filter by
     * @return List of users with that role
     */
    @Query("SELECT * FROM users WHERE role = :role ORDER BY lastName, firstName")
    suspend fun getUsersByRole(role: UserRole): List<User>
    
    /**
     * Get all active users (not deleted/deactivated)
     * @return List of active users
     */
    @Query("SELECT * FROM users WHERE isActive = 1 ORDER BY createdAt DESC")
    suspend fun getAllActiveUsers(): List<User>
    
    /**
     * Search users by name (first name or last name)
     * @param query Search string (supports partial matches)
     * @return List of matching users
     */
    @Query("""
        SELECT * FROM users 
        WHERE (firstName LIKE '%' || :query || '%' OR lastName LIKE '%' || :query || '%')
        AND isActive = 1
        ORDER BY lastName, firstName
    """)
    suspend fun searchUsersByName(query: String): List<User>
    
    /**
     * Get count of users by role
     * @param role The UserRole to count
     * @return Number of users with that role
     */
    @Query("SELECT COUNT(*) FROM users WHERE role = :role AND isActive = 1")
    suspend fun countUsersByRole(role: UserRole): Int
    
    /**
     * Get total count of all active users
     * @return Total number of active users
     */
    @Query("SELECT COUNT(*) FROM users WHERE isActive = 1")
    suspend fun getTotalActiveUsers(): Int
    
    // ==================== FLOW OPERATIONS (LiveData alternative) ====================
    
    /**
     * Observe a user by ID as a Flow
     * Automatically emits new values when the user data changes
     * @param userId The user's ID
     * @return Flow of User objects
     */
    @Query("SELECT * FROM users WHERE userId = :userId LIMIT 1")
    fun observeUserById(userId: Long): Flow<User?>
    
    /**
     * Observe all active users as a Flow
     * @return Flow of user lists
     */
    @Query("SELECT * FROM users WHERE isActive = 1 ORDER BY lastName, firstName")
    fun observeAllActiveUsers(): Flow<List<User>>
    
    /**
     * Observe users by role as a Flow
     * @param role The UserRole to filter by
     * @return Flow of user lists
     */
    @Query("SELECT * FROM users WHERE role = :role AND isActive = 1 ORDER BY lastName, firstName")
    fun observeUsersByRole(role: UserRole): Flow<List<User>>
    
    // ==================== AUTHENTICATION ====================
    
    /**
     * Verify user credentials for login
     * @param email User's email
     * @param passwordHash Hashed password to verify
     * @return User object if credentials match, null otherwise
     * 
     * SECURITY NOTE: Password should be hashed using bcrypt or Argon2 before comparison
     * Never store or compare plain text passwords
     */
    @Query("SELECT * FROM users WHERE email = :email AND passwordHash = :passwordHash AND isActive = 1 LIMIT 1")
    suspend fun authenticateUser(email: String, passwordHash: String): User?
    
    /**
     * Check if an email is already registered
     * @param email Email address to check
     * @return true if email exists, false otherwise
     */
    @Query("SELECT EXISTS(SELECT 1 FROM users WHERE email = :email LIMIT 1)")
    suspend fun isEmailRegistered(email: String): Boolean
}
