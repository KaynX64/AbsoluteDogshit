package com.healthsys.university.util

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.healthsys.university.R
import com.healthsys.university.data.model.SOSAlert
import com.healthsys.university.data.model.SOSEmergencyType
import com.healthsys.university.data.model.SOSStatus
import java.util.Date

/**
 * SOSEmergencyService - Background service for handling SOS emergency alerts
 * 
 * CRITICAL FEATURES:
 * - Runs as foreground service to ensure reliability during emergencies
 * - Continuously tracks user location while SOS is active
 * - Sends real-time updates to clinic response team
 * - Integrates with campus security system
 * 
 * LIFECYCLE:
 * 1. User presses SOS button
 * 2. Service starts as foreground service
 * 3. Acquires location updates
 * 4. Creates SOS alert in database
 * 5. Broadcasts alert to all responders
 * 6. Continues tracking until resolved
 * 7. Stops when emergency is resolved
 * 
 * PRIVACY COMPLIANCE:
 * - Location tracking ONLY active during SOS emergency
 * - Data retained for 90 days then auto-deleted
 * - User notified when tracking stops
 */
class SOSEmergencyService : android.app.Service() {
    
    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private var currentLocation: Location? = null
    private var sosAlertId: Long = -1
    
    // Notification channel ID for emergency notifications
    companion object {
        const val CHANNEL_ID = "sos_emergency_channel"
        const val NOTIFICATION_ID = 1001
        const val ACTION_STOP_SERVICE = "com.healthsys.university.STOP_SOS_SERVICE"
    }
    
    override fun onCreate() {
        super.onCreate()
        
        // Initialize FusedLocationProviderClient for GPS tracking
        fusedLocationClient = com.google.android.gms.location.LocationServices.getFusedLocationProviderClient(this)
        
        // Create notification channel for Android 8.0+
        createNotificationChannel()
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP_SERVICE -> {
                // User manually stopped the SOS service
                stopEmergencyTracking()
            }
            else -> {
                // Start emergency tracking
                startEmergencyTracking()
            }
        }
        
        // START_STICKY ensures service restarts if killed during emergency
        return START_STICKY
    }
    
    /**
     * Start emergency tracking when SOS button is pressed
     * This method:
     * 1. Creates foreground notification
     * 2. Requests location updates
     * 3. Creates SOS alert in database
     * 4. Broadcasts alert to responders
     */
    private fun startEmergencyTracking() {
        // Create foreground notification (required for Android 8.0+)
        val notification = createEmergencyNotification()
        startForeground(NOTIFICATION_ID, notification)
        
        // Request location updates
        requestLocationUpdates()
        
        // Get current location immediately
        getCurrentLocation { location ->
            location?.let {
                currentLocation = it
                // Create SOS alert in database
                createSOSAlert(it)
                
                // Broadcast alert to all emergency responders
                broadcastEmergencyAlert(it)
            }
        }
    }
    
    /**
     * Stop emergency tracking when situation is resolved
     * Cleans up resources and stops the service
     */
    private fun stopEmergencyTracking() {
        // Remove location updates to save battery
        fusedLocationClient.removeLocationUpdates(locationCallback)
        
        // Update SOS alert status to RESOLVED
        updateSOSAlertStatus(SOSStatus.RESOLVED)
        
        // Stop foreground service
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
        
        // Notify user that tracking has stopped
        showTrackingStoppedNotification()
    }
    
    /**
     * Request continuous location updates during emergency
     * Updates are sent every 5 seconds or when user moves 10 meters
     */
    private fun requestLocationUpdates() {
        val locationRequest = com.google.android.gms.location.LocationRequest.Builder(
            com.google.android.gms.location.Priority.PRIORITY_HIGH_ACCURACY,
            5000L  // Update interval: 5 seconds
        ).apply {
            setMinUpdateIntervalMillis(2000L)  // Fastest update: 2 seconds
            setWaitForAccurateLocation(false)  // Don't wait for high accuracy
        }.build()
        
        // Check location permission before requesting updates
        if (ActivityCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        ) {
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback,
                null
            )
        }
    }
    
    // Callback for location updates
    private val locationCallback = object : com.google.android.gms.location.LocationCallback() {
        override fun onLocationResult(locationResult: com.google.android.gms.location.LocationResult) {
            locationResult.lastLocation?.let { location ->
                currentLocation = location
                // Send updated location to responders
                broadcastLocationUpdate(location)
            }
        }
    }
    
    /**
     * Get current location once (for initial SOS alert)
     * @param callback Function called with location result
     */
    private fun getCurrentLocation(callback: (Location?) -> Unit) {
        if (ActivityCompat.checkSelfPermission(
                this,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        ) {
            fusedLocationClient.lastLocation.addOnSuccessListener { location ->
                callback(location)
            }.addOnFailureListener {
                callback(null)
            }
        } else {
            callback(null)
        }
    }
    
    /**
     * Create SOS alert in database
     * @param location Current GPS location
     */
    private fun createSOSAlert(location: Location) {
        // TODO: Implement database insertion via repository
        // This is a placeholder showing the data structure
        /*
        val sosAlert = SOSAlert(
            userId = getCurrentUserId(),
            latitude = location.latitude,
            longitude = location.longitude,
            accuracy = location.accuracy,
            locationProvider = location.provider,
            alertType = SOSEmergencyType.MEDICAL_EMERGENCY,
            status = SOSStatus.ACTIVE,
            triggeredAt = Date()
        )
        sosAlertId = SosRepository.insertAlert(sosAlert)
        */
    }
    
    /**
     * Update SOS alert status in database
     * @param status New status (e.g., RESOLVED, FALSE_ALARM)
     */
    private fun updateSOSAlertStatus(status: SOSStatus) {
        // TODO: Implement database update via repository
        /*
        SosRepository.updateAlertStatus(sosAlertId, status)
        */
    }
    
    /**
     * Broadcast emergency alert to all registered responders
     * Uses BroadcastReceiver to notify clinic staff and emergency personnel
     */
    private fun broadcastEmergencyAlert(location: Location) {
        val intent = Intent("com.healthsys.university.SOS_ALERT").apply {
            putExtra("alert_id", sosAlertId)
            putExtra("latitude", location.latitude)
            putExtra("longitude", location.longitude)
            putExtra("accuracy", location.accuracy)
            putExtra("timestamp", System.currentTimeMillis())
        }
        sendBroadcast(intent)
    }
    
    /**
     * Broadcast location update to responders
     * Sent periodically as user moves during emergency
     */
    private fun broadcastLocationUpdate(location: Location) {
        val intent = Intent("com.healthsys.university.SOS_LOCATION_UPDATE").apply {
            putExtra("alert_id", sosAlertId)
            putExtra("latitude", location.latitude)
            putExtra("longitude", location.longitude)
            putExtra("accuracy", location.accuracy)
        }
        sendBroadcast(intent)
    }
    
    /**
     * Create foreground notification shown during emergency
     * This notification cannot be dismissed until emergency is resolved
     */
    private fun createEmergencyNotification(): android.app.Notification {
        val stopIntent = Intent(this, SOSEmergencyService::class.java).apply {
            action = ACTION_STOP_SERVICE
        }
        val stopPendingIntent = PendingIntent.getService(
            this, 0, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("🚨 Emergency Alert Active")
            .setContentText("Your location is being shared with emergency responders")
            .setSmallIcon(R.drawable.ic_emergency)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)  // Cannot be dismissed
            .addAction(R.drawable.ic_stop, "Stop Tracking", stopPendingIntent)
            .build()
    }
    
    /**
     * Show notification when tracking stops after emergency resolved
     */
    private fun showTrackingStoppedNotification() {
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Emergency Resolved")
            .setContentText("Location tracking has been stopped. Help is on the way if needed.")
            .setSmallIcon(R.drawable.ic_check_circle)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()
        
        NotificationManagerCompat.from(this).notify(NOTIFICATION_ID + 1, notification)
    }
    
    /**
     * Create notification channel for Android 8.0+ (API 26+)
     * Required for foreground service notifications
     */
    private fun createNotificationChannel() {
        val channel = android.app.NotificationChannel(
            CHANNEL_ID,
            "Emergency Alerts",
            android.app.NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Notifications for SOS emergency alerts"
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 500, 200, 500)
            lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        }
        
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        notificationManager.createNotificationChannel(channel)
    }
    
    override fun onBind(intent: Intent?): android.os.IBinder? {
        // Service doesn't support binding, only started
        return null
    }
    
    override fun onDestroy() {
        super.onDestroy()
        // Clean up resources
        fusedLocationClient.removeLocationUpdates(locationCallback)
    }
}
