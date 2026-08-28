package com.university.health

import android.app.Application
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.university.health.ui.UniversityHealthApp

/**
 * Android Application Entry Point for Phones and Tablets
 * 
 * This is the main Activity that runs when users launch the Android app.
 * It sets up the Compose UI and handles Android-specific lifecycle events.
 * 
 * Platform-specific features:
 * - Touch-optimized interface
 * - Camera integration for QR scanning
 * - GPS location for SOS feature
 * - Biometric authentication support
 * - Push notifications
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Enable edge-to-edge display for modern Android devices
        enableEdgeToEdge()
        
        // Set the Compose UI content
        setContent {
            UniversityHealthApp()
        }
    }
}

/**
 * Android Application class for initialization.
 * Used for setting up app-wide services and configurations.
 */
class HealthApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        // Initialize app-wide services here
        // Example: Setup analytics, crash reporting, etc.
    }
}
