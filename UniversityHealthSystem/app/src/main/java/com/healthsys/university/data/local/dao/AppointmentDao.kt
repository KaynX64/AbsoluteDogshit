package com.healthsys.university.data.local.dao

import androidx.room.*
import com.healthsys.university.data.model.Appointment
import com.healthsys.university.data.model.AppointmentStatus
import kotlinx.coroutines.flow.Flow

/**
 * AppointmentDao - Data Access Object for Appointment entity
 * 
 * Manages consultation scheduling including:
 * - Booking appointments
 * - Queue management for Live Queue Dashboard
 * - Status updates
 */
@Dao
interface AppointmentDao {
    
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertAppointment(appointment: Appointment): Long
    
    @Update
    suspend fun updateAppointment(appointment: Appointment)
    
    @Delete
    suspend fun deleteAppointment(appointment: Appointment)
    
    @Query("SELECT * FROM appointments WHERE appointmentId = :appointmentId LIMIT 1")
    suspend fun getAppointmentById(appointmentId: Long): Appointment?
    
    @Query("SELECT * FROM appointments WHERE userId = :userId ORDER BY scheduledDate DESC")
    suspend fun getAppointmentsByPatientId(userId: Long): List<Appointment>
    
    @Query("SELECT * FROM appointments WHERE providerId = :providerId ORDER BY scheduledDate DESC")
    suspend fun getAppointmentsByProviderId(providerId: Long): List<Appointment>
    
    @Query("""
        SELECT * FROM appointments 
        WHERE status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS')
        ORDER BY scheduledDate ASC
    """)
    suspend fun getActiveQueue(): List<Appointment>
    
    @Query("""
        SELECT * FROM appointments 
        WHERE DATE(scheduledDate / 1000, 'unixepoch') = DATE(:date / 1000, 'unixepoch')
        ORDER BY scheduledDate ASC
    """)
    suspend fun getAppointmentsByDate(date: Long): List<Appointment>
    
    @Query("""
        SELECT * FROM appointments 
        WHERE userId = :userId AND status = :status
        ORDER BY scheduledDate DESC
    """)
    suspend fun getAppointmentsByPatientAndStatus(userId: Long, status: AppointmentStatus): List<Appointment>
    
    @Query("SELECT * FROM appointments WHERE userId = :userId ORDER BY scheduledDate DESC LIMIT 1")
    suspend fun getLatestAppointment(userId: Long): Appointment?
    
    @Query("SELECT * FROM appointments WHERE providerId = :providerId AND status = 'IN_PROGRESS' LIMIT 1")
    suspend fun getCurrentConsultation(providerId: Long): Appointment?
    
    @Query("""
        UPDATE appointments 
        SET status = :status, updatedAt = CURRENT_TIMESTAMP
        WHERE appointmentId = :appointmentId
    """)
    suspend fun updateAppointmentStatus(appointmentId: Long, status: AppointmentStatus)
    
    @Query("""
        UPDATE appointments 
        SET checkInTime = CURRENT_TIMESTAMP, status = 'CHECKED_IN', updatedAt = CURRENT_TIMESTAMP
        WHERE appointmentId = :appointmentId
    """)
    suspend fun checkInPatient(appointmentId: Long)
    
    @Query("SELECT COUNT(*) FROM appointments WHERE status = 'PENDING' OR status = 'CONFIRMED'")
    suspend fun getQueueCount(): Int
    
    @Query("SELECT * FROM appointments WHERE userId = :userId ORDER BY scheduledDate DESC")
    fun observeAppointmentsByPatient(userId: Long): Flow<List<Appointment>>
    
    @Query("""
        SELECT * FROM appointments 
        WHERE status IN ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS')
        ORDER BY scheduledDate ASC
    """)
    fun observeActiveQueue(): Flow<List<Appointment>>
}
