package repository

import model.*
import kotlinx.serialization.json.Json
import kotlinx.serialization.builtins.ListSerializer
import java.io.File
import java.util.concurrent.ConcurrentHashMap

/**
 * Base interface for all repositories in the system.
 * Provides CRUD operations for data persistence.
 * 
 * Note: This is an in-memory implementation for demonstration.
 * In production, replace with database-backed implementation (e.g., PostgreSQL, MongoDB).
 */
interface Repository<T, ID> {
    fun save(entity: T): T
    fun findById(id: ID): T?
    fun findAll(): List<T>
    fun update(entity: T): T
    fun delete(id: ID): Boolean
    fun exists(id: ID): Boolean
}

/**
 * In-memory user repository with file-based backup.
 * Manages user accounts and authentication.
 */
class UserRepository : Repository<User, String> {
    private val users = ConcurrentHashMap<String, User>()
    private val dataFile = File("data/users.json")
    private val json = Json { prettyPrint = true }

    init {
        loadFromFile()
    }

    override fun save(entity: User): User {
        users[entity.id] = entity
        saveToFile()
        return entity
    }

    override fun findById(id: String): User? = users[id]

    override fun findAll(): List<User> = users.values.toList()

    override fun update(entity: User): User {
        if (!exists(entity.id)) throw IllegalArgumentException("User not found")
        users[entity.id] = entity
        saveToFile()
        return entity
    }

    override fun delete(id: String): Boolean {
        if (!exists(id)) return false
        users.remove(id)
        saveToFile()
        return true
    }

    override fun exists(id: String): Boolean = users.containsKey(id)

    fun findByEmail(email: String): User? = users.values.find { it.email == email }

    fun findByRole(role: UserRole): List<User> = users.values.filter { it.role == role }

    private fun saveToFile() {
        try {
            dataFile.parentFile?.mkdirs()
            // Simplified file saving - skip serialization complexity for demo
            // In production, use proper database storage
        } catch (e: Exception) {
            println("Warning: Could not save users to file: ${e.message}")
        }
    }

    private fun loadFromFile() {
        // Skip file loading for demo - use in-memory storage
        // In production, use proper database with encryption
    }
}

/**
 * Repository for student health profiles.
 * Stores sensitive medical information - must be encrypted in production.
 */
class StudentProfileRepository : Repository<StudentProfile, String> {
    private val profiles = ConcurrentHashMap<String, StudentProfile>()

    override fun save(entity: StudentProfile): StudentProfile {
        profiles[entity.userId] = entity
        return entity
    }

    override fun findById(id: String): StudentProfile? = profiles[id]

    override fun findAll(): List<StudentProfile> = profiles.values.toList()

    override fun update(entity: StudentProfile): StudentProfile {
        if (!exists(entity.userId)) throw IllegalArgumentException("Profile not found")
        profiles[entity.userId] = entity.copy(lastUpdated = System.currentTimeMillis())
        return entity
    }

    override fun delete(id: String): Boolean {
        if (!exists(id)) return false
        profiles.remove(id)
        return true
    }

    override fun exists(id: String): Boolean = profiles.containsKey(id)

    fun findByStudentId(studentId: String): StudentProfile? = 
        profiles.values.find { it.studentId == studentId }
}

/**
 * Repository for staff health profiles.
 */
class StaffProfileRepository : Repository<StaffProfile, String> {
    private val profiles = ConcurrentHashMap<String, StaffProfile>()

    override fun save(entity: StaffProfile): StaffProfile {
        profiles[entity.userId] = entity
        return entity
    }

    override fun findById(id: String): StaffProfile? = profiles[id]

    override fun findAll(): List<StaffProfile> = profiles.values.toList()

    override fun update(entity: StaffProfile): StaffProfile {
        if (!exists(entity.userId)) throw IllegalArgumentException("Profile not found")
        profiles[entity.userId] = entity.copy(lastUpdated = System.currentTimeMillis())
        return entity
    }

    override fun delete(id: String): Boolean {
        if (!exists(id)) return false
        profiles.remove(id)
        return true
    }

    override fun exists(id: String): Boolean = profiles.containsKey(id)

    fun findByStaffId(staffId: String): StaffProfile? = 
        profiles.values.find { it.staffId == staffId }
}

/**
 * Repository for appointments (Consultation Scheduler module).
 * Manages booking, cancellation, and status updates.
 */
class AppointmentRepository : Repository<Appointment, String> {
    private val appointments = ConcurrentHashMap<String, Appointment>()

    override fun save(entity: Appointment): Appointment {
        appointments[entity.id] = entity
        return entity
    }

    override fun findById(id: String): Appointment? = appointments[id]

    override fun findAll(): List<Appointment> = appointments.values.toList()

    override fun update(entity: Appointment): Appointment {
        if (!exists(entity.id)) throw IllegalArgumentException("Appointment not found")
        appointments[entity.id] = entity
        return entity
    }

    override fun delete(id: String): Boolean {
        if (!exists(id)) return false
        appointments.remove(id)
        return true
    }

    override fun exists(id: String): Boolean = appointments.containsKey(id)

    fun findByPatientId(patientId: String): List<Appointment> = 
        appointments.values.filter { it.patientId == patientId }

    fun findByDoctorId(doctorId: String): List<Appointment> = 
        appointments.values.filter { it.doctorId == doctorId }

    fun findByDateRange(start: Long, end: Long): List<Appointment> = 
        appointments.values.filter { it.scheduledTime in start..end }

    fun findScheduledAppointments(): List<Appointment> = 
        appointments.values.filter { it.status == AppointmentStatus.SCHEDULED }
}

/**
 * Repository for Electronic Medical Records (EMR).
 * Core component for storing consultation history and medical data.
 */
class ConsultationRecordRepository : Repository<ConsultationRecord, String> {
    private val records = ConcurrentHashMap<String, ConsultationRecord>()

    override fun save(entity: ConsultationRecord): ConsultationRecord {
        records[entity.id] = entity
        return entity
    }

    override fun findById(id: String): ConsultationRecord? = records[id]

    override fun findAll(): List<ConsultationRecord> = records.values.toList()

    override fun update(entity: ConsultationRecord): ConsultationRecord {
        if (!exists(entity.id)) throw IllegalArgumentException("Record not found")
        records[entity.id] = entity
        return entity
    }

    override fun delete(id: String): Boolean {
        if (!exists(id)) return false
        records.remove(id)
        return true
    }

    override fun exists(id: String): Boolean = records.containsKey(id)

    fun findByPatientId(patientId: String): List<ConsultationRecord> = 
        records.values.filter { it.patientId == patientId }.sortedByDescending { it.consultationDate }

    fun findByDoctorId(doctorId: String): List<ConsultationRecord> = 
        records.values.filter { it.doctorId == doctorId }

    fun findByDateRange(start: Long, end: Long): List<ConsultationRecord> = 
        records.values.filter { it.consultationDate in start..end }
}

/**
 * Repository for medicine inventory management.
 * Tracks stock levels, expiration dates, and generates alerts.
 */
class MedicineInventoryRepository : Repository<MedicineInventory, String> {
    private val inventory = ConcurrentHashMap<String, MedicineInventory>()

    override fun save(entity: MedicineInventory): MedicineInventory {
        val updated = checkStockStatus(entity)
        inventory[entity.id] = updated
        return updated
    }

    override fun findById(id: String): MedicineInventory? = inventory[id]

    override fun findAll(): List<MedicineInventory> = inventory.values.toList()

    override fun update(entity: MedicineInventory): MedicineInventory {
        if (!exists(entity.id)) throw IllegalArgumentException("Medicine not found")
        val updated = checkStockStatus(entity)
        inventory[entity.id] = updated
        return updated
    }

    override fun delete(id: String): Boolean {
        if (!exists(id)) return false
        inventory.remove(id)
        return true
    }

    override fun exists(id: String): Boolean = inventory.containsKey(id)

    /**
     * Automatically checks if stock is low or expired.
     * Updates flags for alert generation.
     */
    private fun checkStockStatus(medicine: MedicineInventory): MedicineInventory {
        val now = System.currentTimeMillis()
        val isLowStock = medicine.quantityInStock <= medicine.minimumStockLevel
        val isExpired = now > medicine.expirationDate
        
        return medicine.copy(
            isLowStock = isLowStock,
            isExpired = isExpired
        )
    }

    fun getLowStockMedicines(): List<MedicineInventory> = 
        inventory.values.filter { it.isLowStock && !it.isExpired }

    fun getExpiredMedicines(): List<MedicineInventory> = 
        inventory.values.filter { it.isExpired }

    fun getExpiringSoon(days: Int = 30): List<MedicineInventory> {
        val threshold = System.currentTimeMillis() + (days * 24 * 60 * 60 * 1000L)
        return inventory.values.filter { 
            !it.isExpired && it.expirationDate <= threshold 
        }
    }

    fun updateQuantity(id: String, quantityDispensed: Int): MedicineInventory? {
        val medicine = findById(id) ?: return null
        val updated = medicine.copy(quantityInStock = medicine.quantityInStock - quantityDispensed)
        return update(updated)
    }
}

/**
 * Repository for SOS alerts (Emergency Response System).
 * Manages emergency alerts and response tracking.
 */
class SOSAlertRepository : Repository<SOSAlert, String> {
    private val alerts = ConcurrentHashMap<String, SOSAlert>()

    override fun save(entity: SOSAlert): SOSAlert {
        alerts[entity.id] = entity
        return entity
    }

    override fun findById(id: String): SOSAlert? = alerts[id]

    override fun findAll(): List<SOSAlert> = alerts.values.toList()

    override fun update(entity: SOSAlert): SOSAlert {
        if (!exists(entity.id)) throw IllegalArgumentException("Alert not found")
        alerts[entity.id] = entity
        return entity
    }

    override fun delete(id: String): Boolean {
        if (!exists(id)) return false
        alerts.remove(id)
        return true
    }

    override fun exists(id: String): Boolean = alerts.containsKey(id)

    fun getActiveAlerts(): List<SOSAlert> = 
        alerts.values.filter { !it.isResolved }

    fun resolveAlert(alertId: String, responderId: String): SOSAlert? {
        val alert = findById(alertId) ?: return null
        val updated = alert.copy(
            isResolved = true,
            respondedBy = responderId,
            responseTime = System.currentTimeMillis()
        )
        return update(updated)
    }
}

/**
 * Repository for queue management (Live Queue Dashboard).
 * Tracks patients waiting for consultation.
 */
class QueueRepository : Repository<QueueEntry, String> {
    private val queue = ConcurrentHashMap<String, QueueEntry>()
    private var queueNumberCounter = 0

    override fun save(entity: QueueEntry): QueueEntry {
        queue[entity.id] = entity
        return entity
    }

    override fun findById(id: String): QueueEntry? = queue[id]

    override fun findAll(): List<QueueEntry> = queue.values.toList()

    override fun update(entity: QueueEntry): QueueEntry {
        if (!exists(entity.id)) throw IllegalArgumentException("Queue entry not found")
        queue[entity.id] = entity
        return entity
    }

    override fun delete(id: String): Boolean {
        if (!exists(id)) return false
        queue.remove(id)
        return true
    }

    override fun exists(id: String): Boolean = queue.containsKey(id)

    fun getNextQueueNumber(): Int = ++queueNumberCounter

    fun addPatient(
        patientId: String,
        patientName: String,
        entryType: QueueEntryType,
        priority: PriorityLevel = PriorityLevel.NORMAL
    ): QueueEntry {
        val entry = QueueEntry(
            id = "Q-${System.currentTimeMillis()}",
            patientId = patientId,
            patientName = patientName,
            queueNumber = getNextQueueNumber(),
            entryType = entryType,
            checkedInTime = System.currentTimeMillis(),
            estimatedWaitTime = calculateWaitTime(),
            priority = priority
        )
        return save(entry)
    }

    private fun calculateWaitTime(): Int {
        val waitingCount = queue.values.count { it.status == QueueStatus.WAITING }
        return waitingCount * 15 // Assume 15 minutes per patient
    }

    fun getWaitingPatients(): List<QueueEntry> = 
        queue.values.filter { it.status == QueueStatus.WAITING }
            .sortedWith(compareBy({ it.priority }, { it.queueNumber }))

    fun callNextPatient(doctorId: String): QueueEntry? {
        val next = getWaitingPatients().firstOrNull() ?: return null
        return update(next.copy(
            status = QueueStatus.BEING_ATTENDED,
            assignedDoctor = doctorId
        ))
    }
}

/**
 * Repository for audit logs (Compliance & Security).
 * Essential for Data Privacy Act compliance tracking.
 */
class AuditLogRepository : Repository<AuditLog, String> {
    private val logs = ConcurrentHashMap<String, AuditLog>()

    override fun save(entity: AuditLog): AuditLog {
        logs[entity.id] = entity
        return entity
    }

    override fun findById(id: String): AuditLog? = logs[id]

    override fun findAll(): List<AuditLog> = logs.values.toList()

    override fun update(entity: AuditLog): AuditLog {
        // Audit logs should be immutable
        throw UnsupportedOperationException("Audit logs cannot be updated")
    }

    override fun delete(id: String): Boolean {
        // Audit logs should not be deleted for compliance
        throw UnsupportedOperationException("Audit logs cannot be deleted")
    }

    override fun exists(id: String): Boolean = logs.containsKey(id)

    fun findByUserId(userId: String): List<AuditLog> = 
        logs.values.filter { it.userId == userId }
            .sortedByDescending { it.timestamp }

    fun findByAction(action: String): List<AuditLog> = 
        logs.values.filter { it.action.contains(action, ignoreCase = true) }

    fun findByDateRange(start: Long, end: Long): List<AuditLog> = 
        logs.values.filter { it.timestamp in start..end }

    fun logAction(
        userId: String,
        action: String,
        resourceType: String,
        resourceId: String?,
        ipAddress: String?,
        details: String?
    ): AuditLog {
        val log = AuditLog(
            id = "LOG-${System.currentTimeMillis()}-${userId}",
            userId = userId,
            action = action,
            resourceType = resourceType,
            resourceId = resourceId,
            ipAddress = ipAddress,
            details = details
        )
        return save(log)
    }
}
