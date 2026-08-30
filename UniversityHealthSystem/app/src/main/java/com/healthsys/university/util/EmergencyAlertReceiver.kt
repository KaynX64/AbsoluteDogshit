package com.healthsys.university.util

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * EmergencyAlertReceiver - Broadcast receiver for SOS emergency alerts
 * 
 * RESPONSIBILITIES:
 * - Listens for SOS_ALERT broadcasts from SOSEmergencyService
 * - Notifies all registered emergency responders
 * - Shows high-priority notification with patient location
 * - Can launch emergency response dashboard
 * 
 * RECEIVES ACTIONS:
 * - com.healthsys.university.SOS_ALERT: New emergency alert
 * - com.healthsys.university.SOS_LOCATION_UPDATE: Location update during active emergency
 * 
 * TARGET AUDIENCE:
 * - Clinic nurses and doctors
 * - Campus security personnel
 * - Emergency response team members
 */
class EmergencyAlertReceiver : BroadcastReceiver() {
    
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            "com.healthsys.university.SOS_ALERT" -> {
                // Handle new SOS emergency alert
                handleNewEmergencyAlert(context, intent)
            }
            "com.healthsys.university.SOS_LOCATION_UPDATE" -> {
                // Handle location update during ongoing emergency
                handleLocationUpdate(context, intent)
            }
        }
    }
    
    /**
     * Handle new emergency alert
     * Shows notification and alerts all responders
     */
    private fun handleNewEmergencyAlert(context: Context, intent: Intent) {
        val alertId = intent.getLongExtra("alert_id", -1)
        val latitude = intent.getDoubleExtra("latitude", 0.0)
        val longitude = intent.getDoubleExtra("longitude", 0.0)
        val accuracy = intent.getFloatExtra("accuracy", 0f)
        val timestamp = intent.getLongExtra("timestamp", System.currentTimeMillis())
        
        // Show emergency notification to responders
        showEmergencyNotification(
            context = context,
            alertId = alertId,
            latitude = latitude,
            longitude = longitude,
            accuracy = accuracy
        )
        
        // TODO: Send push notification via Firebase Cloud Messaging
        // TODO: Send SMS to on-call emergency personnel
        // TODO: Log alert to central monitoring system
    }
    
    /**
     * Handle location update during ongoing emergency
     * Updates notification with new location
     */
    private fun handleLocationUpdate(context: Context, intent: Intent) {
        val alertId = intent.getLongExtra("alert_id", -1)
        val latitude = intent.getDoubleExtra("latitude", 0.0)
        val longitude = intent.getDoubleExtra("longitude", 0.0)
        val accuracy = intent.getFloatExtra("accuracy", 0f)
        
        // Update existing notification with new location
        updateEmergencyNotification(
            context = context,
            alertId = alertId,
            latitude = latitude,
            longitude = longitude,
            accuracy = accuracy
        )
    }
    
    /**
     * Show high-priority emergency notification
     * This notification will appear on lock screen and make sound
     */
    private fun showEmergencyNotification(
        context: Context,
        alertId: Long,
        latitude: Double,
        longitude: Double,
        accuracy: Float
    ) {
        // Create intent to open emergency response dashboard
        val dashboardIntent = Intent(context, EmergencyResponseActivity::class.java).apply {
            putExtra("alert_id", alertId)
            putExtra("latitude", latitude)
            putExtra("longitude", longitude)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        
        val pendingIntent = android.app.PendingIntent.getActivity(
            context,
            alertId.toInt(),
            dashboardIntent,
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )
        
        // Build emergency notification
        val notification = androidx.core.app.NotificationCompat.Builder(
            context,
            SOSEmergencyService.CHANNEL_ID
        )
            .setContentTitle("🚨 SOS Emergency Alert")
            .setContentText("Student/Staff needs immediate medical attention")
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_MAX)
            .setCategory(androidx.core.app.NotificationCompat.CATEGORY_ALARM)
            .setVisibility(androidx.core.app.NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(false)
            .setContentIntent(pendingIntent)
            .setVibrate(longArrayOf(0, 500, 200, 500, 200, 500))
            .build()
        
        // Show notification
        val notificationManager = androidx.core.app.NotificationManagerCompat.from(context)
        notificationManager.notify(alertId.toInt(), notification)
    }
    
    /**
     * Update existing emergency notification with new location
     */
    private fun updateEmergencyNotification(
        context: Context,
        alertId: Long,
        latitude: Double,
        longitude: Double,
        accuracy: Float
    ) {
        // Re-show notification with updated location data
        // In production, this would update the existing notification
        showEmergencyNotification(context, alertId, latitude, longitude, accuracy)
    }
}

/**
 * Placeholder activity for emergency response dashboard
 * In production, this would be a full-featured activity showing:
 * - Map with patient location
 * - Patient health profile (blood type, allergies, etc.)
 * - Navigation to patient location
 * - Communication tools with other responders
 */
class EmergencyResponseActivity : android.app.Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Get alert data from intent
        val alertId = intent.getLongExtra("alert_id", -1)
        val latitude = intent.getDoubleExtra("latitude", 0.0)
        val longitude = intent.getDoubleExtra("longitude", 0.0)
        
        // TODO: Implement emergency response dashboard UI
        // - Show map with patient location
        // - Display patient health profile
        // - Provide navigation
        // - Enable communication with other responders
    }
}
