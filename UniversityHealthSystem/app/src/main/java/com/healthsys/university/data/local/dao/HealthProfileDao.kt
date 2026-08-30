package com.healthsys.university.data.local.dao

import androidx.room.*
import com.healthsys.university.data.model.HealthProfile
import kotlinx.coroutines.flow.Flow

/**
 * HealthProfileDao - Data Access Object for HealthProfile entity
 * 
 * Provides database operations for managing student/staff health profiles
 * including CRUD operations and health data queries
 */
@Dao
interface HealthProfileDao {
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProfile(profile: HealthProfile): Long
    
    @Update
    suspend fun updateProfile(profile: HealthProfile)
    
    @Delete
    suspend fun deleteProfile(profile: HealthProfile)
    
    @Query("SELECT * FROM health_profiles WHERE userId = :userId LIMIT 1")
    suspend fun getProfileByUserId(userId: Long): HealthProfile?
    
    @Query("SELECT * FROM health_profiles WHERE profileId = :profileId LIMIT 1")
    suspend fun getProfileById(profileId: Long): HealthProfile?
    
    @Query("SELECT * FROM health_profiles ORDER BY profileUpdatedAt DESC")
    suspend fun getAllProfiles(): List<HealthProfile>
    
    @Query("SELECT * FROM health_profiles WHERE userId = :userId LIMIT 1")
    fun observeProfileByUserId(userId: Long): Flow<HealthProfile?>
}
