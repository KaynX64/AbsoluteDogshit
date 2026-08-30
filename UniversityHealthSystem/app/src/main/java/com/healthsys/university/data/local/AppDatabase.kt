package com.healthsys.university.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.healthsys.university.data.model.*

/**
 * AppDatabase - Main Room database for the University Health System
 * 
 * This database stores all local data including:
 * - User accounts and authentication
 * - Health profiles (encrypted)
 * - QR Health Passes
 * - Appointments
 * - SOS Alerts
 * - Prescriptions
 * - Medical Clearances
 * - Electronic Medical Records (EMR)
 * - Medicine Inventory
 * 
 * DATA PRIVACY & SECURITY:
 * - All sensitive health data must be encrypted before storage
 * - Database is encrypted using SQLCipher in production
 * - Access is controlled through Role-Based Access Control (RBAC)
 * - Audit logging is enabled for all data access
 * - Complies with Philippine Data Privacy Act of 2012
 * 
 * DATABASE VERSIONING:
 * - Increment version number when schema changes
 * - Provide migration strategies for each version change
 * - Current version: 1 (initial release)
 */
@Database(
    entities = [
        // User Management
        User::class,
        
        // Student/Staff Health Module
        HealthProfile::class,
        QRHealthPass::class,
        Appointment::class,
        SOSAlert::class,
        Prescription::class,
        MedicalClearance::class,
        
        // Clinic & EMR Module
        ElectronicMedicalRecord::class,
        MedicineInventory::class,
        InventoryTransaction::class
    ],
    version = 1,
    exportSchema = true  // Export schema for version control
)
@TypeConverters(Converters::class)  // Custom type converters for Date, Enum, etc.
abstract class AppDatabase : RoomDatabase() {
    
    /**
     * DAO accessors - Each method returns the corresponding Data Access Object
     * These DAOs provide type-safe database operations
     */
    
    // User Management DAOs
    abstract fun userDao(): UserDao
    abstract fun healthProfileDao(): HealthProfileDao
    
    // Appointment & Queue Management DAOs
    abstract fun appointmentDao(): AppointmentDao
    abstract fun qrHealthPassDao(): QRHealthPassDao
    
    // Emergency Response DAOs
    abstract fun sosAlertDao(): SOSAlertDao
    
    // Medical Records DAOs
    abstract fun prescriptionDao(): PrescriptionDao
    abstract fun medicalClearanceDao(): MedicalClearanceDao
    abstract fun emrDao(): ElectronicMedicalRecordDao
    
    // Inventory Management DAOs
    abstract fun medicineInventoryDao(): MedicineInventoryDao
    abstract fun inventoryTransactionDao(): InventoryTransactionDao
    
    /**
     * Singleton pattern implementation for database instance
     * Uses double-checked locking for thread safety
     * 
     * NOTE: In production, use Dependency Injection (Hilt/Dagger) instead
     */
    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null
        
        fun getDatabase(context: android.content.Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = androidx.room.Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "university_health_system.db"
                )
                // Add migrations here when schema changes
                // .addMigrations(MIGRATION_1_2)
                
                // Enable WAL for better performance
                .setJournalMode(JournalMode.WRITE_AHEAD_LOGGING)
                
                // Allow queries on main thread only for debugging (disable in production)
                .allowMainThreadQueries()  // REMOVE IN PRODUCTION
                
                .build()
                INSTANCE = instance
                instance
            }
        }
        
        /**
         * Close the database connection
         * Call this when the application is terminated
         */
        fun closeDatabase() {
            INSTANCE?.close()
            INSTANCE = null
        }
    }
}
