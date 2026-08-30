package com.healthsys.university.data.local

import androidx.room.TypeConverter
import java.util.Date

/**
 * Converters - Type converters for Room database
 * 
 * Room cannot store certain types directly (Date, Enum, List, etc.)
 * These converters transform complex types to/from primitive types that Room can store
 * 
 * TYPES CONVERTED:
 * - Date ↔ Long (timestamp in milliseconds)
 * - Enum ↔ String (enum name)
 * - List<String> ↔ String (comma-separated)
 * - Boolean ↔ Int (0 or 1)
 */
class Converters {
    
    /**
     * Convert Date to Long (timestamp in milliseconds since epoch)
     * Used when storing Date fields in the database
     */
    @TypeConverter
    fun fromTimestamp(value: Long?): Date? {
        return value?.let { Date(it) }
    }
    
    /**
     * Convert Long (timestamp) back to Date
     * Used when retrieving Date fields from the database
     */
    @TypeConverter
    fun dateToTimestamp(date: Date?): Long? {
        return date?.time
    }
    
    /**
     * Convert Enum to String (enum name)
     * Used for storing enum values like UserRole, AppointmentStatus, etc.
     */
    @TypeConverter
    fun fromEnum(value: Enum<*>): String {
        return value.name
    }
    
    /**
     * Convert String back to Enum
     * @param T The enum class type
     * @param value The string representation of the enum
     * @return The enum value or null if not found
     */
    @TypeConverter
    inline fun <reified T : Enum<T>> toEnum(value: String): T? {
        return try {
            enumValueOf<T>(value.uppercase())
        } catch (e: IllegalArgumentException) {
            null
        }
    }
    
    /**
     * Convert List<String> to comma-separated String
     * Used for storing simple string lists
     * 
     * NOTE: For complex objects, use JSON serialization instead
     */
    @TypeConverter
    fun fromStringList(list: List<String>?): String? {
        return list?.joinToString(",")
    }
    
    /**
     * Convert comma-separated String back to List<String>
     */
    @TypeConverter
    fun toStringList(value: String?): List<String>? {
        return value?.split(",")?.map { it.trim() }
    }
    
    /**
     * Convert Boolean to Int (0 or 1)
     * Some databases prefer integer booleans
     */
    @TypeConverter
    fun fromBoolean(value: Boolean): Int {
        return if (value) 1 else 0
    }
    
    /**
     * Convert Int back to Boolean
     */
    @TypeConverter
    fun toBoolean(value: Int): Boolean {
        return value != 0
    }
}
