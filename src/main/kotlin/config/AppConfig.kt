package config

import model.*
import repository.*
import service.*

/**
 * Main configuration and dependency injection container for the University Health System.
 * This object initializes all repositories and services needed by the application.
 * 
 * In a production environment, consider using a proper DI framework like Koin or Kodein.
 */
object AppConfig {
    
    // Repositories - Data Access Layer
    val userRepository = UserRepository()
    val studentProfileRepository = StudentProfileRepository()
    val staffProfileRepository = StaffProfileRepository()
    val appointmentRepository = AppointmentRepository()
    val consultationRepository = ConsultationRecordRepository()
    val medicineInventoryRepository = MedicineInventoryRepository()
    val sosAlertRepository = SOSAlertRepository()
    val queueRepository = QueueRepository()
    val auditLogRepository = AuditLogRepository()
    
    // Services - Business Logic Layer
    lateinit var authService: AuthService
    lateinit var profileService: ProfileService
    lateinit var appointmentService: AppointmentService
    lateinit var emrService: EMRService
    lateinit var sosService: SOSService
    lateinit var inventoryService: InventoryService
    lateinit var analyticsService: AnalyticsService
    
    /**
     * Initializes all services with their dependencies.
     * Call this method during application startup.
     */
    fun initialize() {
        println("Initializing University Health System...")
        
        authService = AuthService(userRepository, auditLogRepository)
        profileService = ProfileService(
            studentProfileRepository,
            staffProfileRepository,
            auditLogRepository
        )
        appointmentService = AppointmentService(
            appointmentRepository,
            queueRepository,
            auditLogRepository
        )
        emrService = EMRService(consultationRepository, auditLogRepository)
        sosService = SOSService(sosAlertRepository, auditLogRepository)
        inventoryService = InventoryService(medicineInventoryRepository, auditLogRepository)
        analyticsService = AnalyticsService(
            consultationRepository,
            appointmentRepository,
            sosAlertRepository
        )
        
        println("System initialized successfully!")
        println("========================================")
    }
    
    /**
     * Seeds the database with sample data for demonstration.
     * In production, this would be replaced with actual user registration.
     */
    fun seedSampleData() {
        println("\nSeeding sample data...")
        
        // Create Admin User
        val admin = authService.registerUser(
            email = "admin@university.edu.ph",
            password = "admin123",
            firstName = "System",
            lastName = "Administrator",
            role = UserRole.ADMIN,
            phoneNumber = "09171234567",
            adminId = "SYSTEM"
        )
        println("Created Admin: ${admin.email}")
        
        // Create Doctor
        val doctor = authService.registerUser(
            email = "doctor@university.edu.ph",
            password = "doctor123",
            firstName = "Maria",
            lastName = "Santos",
            role = UserRole.DOCTOR,
            phoneNumber = "09179876543",
            adminId = admin.id
        )
        println("Created Doctor: Dr. ${doctor.lastName}")
        
        // Create Nurse
        val nurse = authService.registerUser(
            email = "nurse@university.edu.ph",
            password = "nurse123",
            firstName = "Juan",
            lastName = "Dela Cruz",
            role = UserRole.NURSE,
            phoneNumber = "09181234567",
            adminId = admin.id
        )
        println("Created Nurse: Nurse ${nurse.lastName}")
        
        // Create Student User
        val student = authService.registerUser(
            email = "student@university.edu.ph",
            password = "student123",
            firstName = "Jose",
            lastName = "Rizal",
            role = UserRole.STUDENT,
            phoneNumber = "09191234567",
            adminId = admin.id
        )
        println("Created Student: ${student.firstName} ${student.lastName}")
        
        // Create Student Health Profile
        val studentProfile = StudentProfile(
            userId = student.id,
            studentId = "2024-00001",
            course = "BS Computer Science",
            yearLevel = 3,
            bloodType = "O+",
            allergies = listOf("Penicillin", "Peanuts"),
            preExistingConditions = listOf("Asthma"),
            emergencyContactName = "Maria Rizal",
            emergencyContactNumber = "09201234567"
        )
        profileService.createStudentProfile(studentProfile, admin.id)
        println("Created Student Health Profile")
        
        // Create Staff User
        val staff = authService.registerUser(
            email = "staff@university.edu.ph",
            password = "staff123",
            firstName = "Andres",
            lastName = "Bonifacio",
            role = UserRole.STAFF,
            phoneNumber = "09211234567",
            adminId = admin.id
        )
        println("Created Staff: Prof. ${staff.lastName}")
        
        // Create Staff Health Profile
        val staffProfile = StaffProfile(
            userId = staff.id,
            staffId = "FAC-2024-001",
            department = "Computer Science Department",
            position = "Professor",
            bloodType = "A+",
            allergies = listOf(),
            preExistingConditions = listOf("Hypertension"),
            emergencyContactName = "Gregoria Bonifacio",
            emergencyContactNumber = "09221234567"
        )
        profileService.createStaffProfile(staffProfile, admin.id)
        println("Created Staff Health Profile")
        
        // Add Medicines to Inventory
        val medicines = listOf(
            MedicineInventory(
                id = "MED-001",
                name = "Paracetamol 500mg",
                genericName = "Acetaminophen",
                category = MedicineCategory.ANTIPYRETIC,
                quantityInStock = 500,
                unit = "tablets",
                minimumStockLevel = 100,
                expirationDate = System.currentTimeMillis() + (365 * 24 * 60 * 60 * 1000L),
                batchNumber = "PAR-2024-001",
                supplier = "PharmaCorp Philippines"
            ),
            MedicineInventory(
                id = "MED-002",
                name = "Amoxicillin 250mg",
                genericName = "Amoxicillin",
                category = MedicineCategory.ANTIBIOTIC,
                quantityInStock = 200,
                unit = "capsules",
                minimumStockLevel = 50,
                expirationDate = System.currentTimeMillis() + (180 * 24 * 60 * 60 * 1000L),
                batchNumber = "AMX-2024-001",
                supplier = "MediSupply Inc."
            ),
            MedicineInventory(
                id = "MED-003",
                name = "Cetirizine 10mg",
                genericName = "Cetirizine HCl",
                category = MedicineCategory.ANTIHISTAMINE,
                quantityInStock = 150,
                unit = "tablets",
                minimumStockLevel = 50,
                expirationDate = System.currentTimeMillis() + (270 * 24 * 60 * 60 * 1000L),
                batchNumber = "CET-2024-001",
                supplier = "PharmaCorp Philippines"
            ),
            MedicineInventory(
                id = "MED-004",
                name = "Salbutamol Inhaler",
                genericName = "Salbutamol",
                category = MedicineCategory.OTHER,
                quantityInStock = 30,
                unit = "inhalers",
                minimumStockLevel = 10,
                expirationDate = System.currentTimeMillis() + (400 * 24 * 60 * 60 * 1000L),
                batchNumber = "SAL-2024-001",
                supplier = "RespiCare Medical"
            ),
            MedicineInventory(
                id = "MED-005",
                name = "Gauze Pads (Sterile)",
                genericName = null,
                category = MedicineCategory.FIRST_AID,
                quantityInStock = 100,
                unit = "packs",
                minimumStockLevel = 20,
                expirationDate = System.currentTimeMillis() + (730 * 24 * 60 * 60 * 1000L),
                batchNumber = "GAU-2024-001",
                supplier = "MediSupply Inc."
            )
        )
        
        medicines.forEach { medicine ->
            inventoryService.addMedicine(medicine, admin.id)
        }
        println("Added ${medicines.size} medicines to inventory")
        
        println("\nSample data seeding completed!")
        println("========================================")
        println("\nLogin Credentials:")
        println("Admin:   admin@university.edu.ph / admin123")
        println("Doctor:  doctor@university.edu.ph / doctor123")
        println("Nurse:   nurse@university.edu.ph / nurse123")
        println("Student: student@university.edu.ph / student123")
        println("Staff:   staff@university.edu.ph / staff123")
        println("========================================\n")
    }
}
