package com.healthsys.university.data.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.Date

/**
 * Medicine Inventory - Tracks stock levels of clinic medicines and first-aid supplies
 * Features automatic alerts for low stock and expiration dates
 * 
 * INVENTORY MANAGEMENT FEATURES:
 * - Real-time stock level tracking
 * - Automatic low-stock alerts (configurable threshold)
 * - Expiration date monitoring with advance warnings
 * - Batch/lot number tracking
 * - Supplier management
 * - Purchase order generation
 * - Usage analytics
 * 
 * COMPLIANCE:
 * - Follows Philippine FDA guidelines for medicine storage
 * - Controlled substances have additional tracking
 * - Temperature-sensitive items have special flags
 * 
 * @property medicineId Unique identifier
 * @property name Generic or brand name of medicine/supply
 * @property category MEDICATION, FIRST_AID, MEDICAL_SUPPLY, EQUIPMENT
 * @property description Detailed description
 * @property quantityInStock Current stock quantity
 * @property unitOfMeasurement Unit (tablets, bottles, boxes, pieces)
 * @property reorderLevel Minimum stock level before reorder alert
 * @property reorderQuantity Suggested reorder quantity
 * @property unitPrice Price per unit
 * @property supplierName Supplier/manufacturer name
 * @property supplierContact Supplier contact information
 * @property batchNumber Current batch/lot number
 * @property expirationDate When the medicine expires
 * @property isControlled Whether this is a controlled substance
 * @property storageRequirements Special storage requirements (e.g., refrigeration)
 * @property locationInClinic Where it's stored in the clinic
 * @property lastRestocked Date of last restocking
 * @property isActive Whether this item is currently being tracked
 */
@Entity(tableName = "medicine_inventory")
data class MedicineInventory(
    @PrimaryKey(autoGenerate = true)
    val medicineId: Long = 0,
    
    // Basic information
    val name: String,
    val genericName: String?,  // Generic name if brand name is used
    val category: MedicineCategory,
    val description: String?,
    
    // Stock management
    var quantityInStock: Int,
    val unitOfMeasurement: String,  // e.g., "tablets", "bottles", "boxes"
    val reorderLevel: Int,  // Alert when stock falls below this
    val reorderQuantity: Int,  // Suggested order quantity
    
    // Pricing & Supplier
    val unitPrice: Double?,
    val supplierName: String?,
    val supplierContact: String?,
    
    // Batch & Expiration
    val batchNumber: String?,
    val expirationDate: Date?,
    val isExpiringSoon: Boolean = false,  // Flagged when within 90 days of expiry
    
    // Special handling
    val isControlledSubstance: Boolean = false,
    val requiresRefrigeration: Boolean = false,
    val storageRequirements: String?,
    
    // Location tracking
    val locationInClinic: String?,  // e.g., "Cabinet A, Shelf 3"
    
    // Timestamps
    val lastRestocked: Date? = null,
    val createdAt: Date = Date(),
    val updatedAt: Date = Date(),
    
    // Status
    val isActive: Boolean = true
)

/**
 * Enum for medicine/supply categories
 */
enum class MedicineCategory {
    MEDICATION,         // Prescription and OTC medicines
    FIRST_AID,          // First aid supplies (bandages, antiseptics)
    MEDICAL_SUPPLY,     // General medical supplies (gloves, syringes)
    EQUIPMENT,          // Medical equipment (thermometers, BP apparatus)
    VACCINE,           // Vaccines and immunizations
    LABORATORY,        // Lab reagents and supplies
    DENTAL,            // Dental-specific supplies
    EMERGENCY          // Emergency medications and supplies
}

/**
 * Entity for tracking inventory transactions (stock in/out)
 * Provides audit trail for all inventory movements
 */
@Entity(
    tableName = "inventory_transactions",
    primaryKeys = ["transactionId"]
)
data class InventoryTransaction(
    @PrimaryKey(autoGenerate = true)
    val transactionId: Long = 0,
    
    val medicineId: Long,
    val transactionType: TransactionType,  // IN, OUT, ADJUSTMENT, EXPIRED
    val quantity: Int,
    val previousQuantity: Int,
    val newQuantity: Int,
    
    val performedBy: Long,  // User ID who performed the transaction
    val reason: String?,    // Reason for transaction
    val referenceId: Long?, // Reference to prescription, appointment, etc.
    
    val transactionDate: Date = Date(),
    val notes: String?
)

/**
 * Enum for inventory transaction types
 */
enum class TransactionType {
    STOCK_IN,         // New stock received
    STOCK_OUT,        // Stock dispensed/used
    ADJUSTMENT,       // Manual adjustment (correction)
    EXPIRED,          // Removed due to expiration
    DAMAGED,          // Removed due to damage
    RETURNED          // Returned to supplier
}
