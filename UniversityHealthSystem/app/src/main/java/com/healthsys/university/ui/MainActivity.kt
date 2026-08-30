package com.healthsys.university.ui

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.navigation.fragment.NavHostFragment
import androidx.navigation.ui.setupWithNavController
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.google.android.material.navigation.NavigationBarView
import com.healthsys.university.R
import com.healthsys.university.databinding.ActivityMainBinding

/**
 * MainActivity - Main entry point of the University Health System application
 * 
 * RESPONSIBILITIES:
 * - Hosts the main navigation structure (Bottom Navigation)
 * - Determines which module to show based on user role
 * - Manages app-level UI state
 * 
 * NAVIGATION FLOW:
 * - On launch: Check if user is authenticated
 * - If not authenticated → Navigate to LoginActivity
 * - If authenticated → Load appropriate module based on role:
 *   - STUDENT/STAFF → StudentModuleActivity or StaffModuleActivity
 *   - NURSE/DOCTOR/DENTIST → ClinicModuleActivity
 *   - ADMIN → AdminModuleActivity
 *   - EMERGENCY_PERSONNEL → Emergency response dashboard
 * 
 * MATERIAL YOU THEMING:
 * - Uses Material Design 3 components
 * - Dynamic color support (Android 12+)
 * - Consistent color scheme across all screens
 */
class MainActivity : AppCompatActivity() {
    
    // ViewBinding for type-safe view access
    private lateinit var binding: ActivityMainBinding
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Initialize ViewBinding
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        // Setup toolbar as ActionBar
        setSupportActionBar(binding.toolbar)
        
        // Check authentication status and route to appropriate module
        checkAuthenticationAndRoute()
    }
    
    /**
     * Check if user is authenticated and route to appropriate module
     * 
     * AUTHENTICATION FLOW:
     * 1. Check SharedPreferences/EncryptedDataStore for auth token
     * 2. If no token → Launch LoginActivity
     * 3. If token exists → Validate token
     * 4. Get user role from token/user object
     * 5. Launch appropriate module activity
     */
    private fun checkAuthenticationAndRoute() {
        // TODO: Implement authentication check
        // For now, navigate to login
        // In production:
        // val isAuthenticated = AuthManager.isAuthenticated(this)
        // if (!isAuthenticated) {
        //     startActivity(Intent(this, LoginActivity::class.java))
        //     finish()
        //     return
        // }
        // val userRole = AuthManager.getCurrentUserRole(this)
        // routeToModule(userRole)
    }
    
    /**
     * Route user to appropriate module based on their role
     * @param role User's role (STUDENT, STAFF, NURSE, DOCTOR, ADMIN, etc.)
     */
    /*
    private fun routeToModule(role: UserRole) {
        val intent = when (role) {
            UserRole.STUDENT -> Intent(this, StudentModuleActivity::class.java)
            UserRole.STAFF -> Intent(this, StaffModuleActivity::class.java)
            UserRole.NURSE, UserRole.DOCTOR, UserRole.DENTIST -> {
                Intent(this, ClinicModuleActivity::class.java)
            }
            UserRole.ADMIN -> Intent(this, AdminModuleActivity::class.java)
            UserRole.EMERGENCY_PERSONNEL -> Intent(this, EmergencyDashboardActivity::class.java)
        }
        startActivity(intent)
        finish()  // Close MainActivity so back button doesn't return here
    }
    */
    
    override fun onBackPressed() {
        // Show confirmation dialog before exiting app
        // Prevent accidental app closure
        val currentTime = System.currentTimeMillis()
        if (currentTime - backPressedTime < 2000) {
            super.onBackPressed()
            finishAffinity()  // Close all activities
        } else {
            // Show toast message "Press back again to exit"
            // backPressedTime = currentTime
        }
    }
    
    companion object {
        private const val TAG = "MainActivity"
        private var backPressedTime: Long = 0
    }
}
