package com.uni.health.desktop

import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import androidx.compose.runtime.*
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.uni.health.presentation.SessionManager
import com.uni.health.domain.UserRole

/**
 * Main entry point for the Desktop application.
 * Runs on PC (Windows, Mac, Linux) using Compose Multiplatform.
 */
fun main() = application {
    // Application state
    val sessionManager = remember { SessionManager() }
    
    Window(
        onCloseRequest = ::exitApplication,
        title = "University Health System",
        state = rememberWindowState(width = 1200.dp, height = 800.dp)
    ) {
        // Main application UI
        AppContent(sessionManager = sessionManager)
    }
}

/**
 * Main application content with navigation based on user role.
 * 
 * @param sessionManager Manages user authentication state
 */
@Composable
fun AppContent(sessionManager: SessionManager) {
    var isLoggedIn by remember { mutableStateOf(sessionManager.isLoggedIn()) }
    
    MaterialTheme {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
            if (!isLoggedIn) {
                // Show login screen
                LoginScreen(
                    onLoginSuccess = { user ->
                        sessionManager.setCurrentUser(user)
                        isLoggedIn = true
                    }
                )
            } else {
                // Show main dashboard based on user role
                val currentUser = sessionManager.getCurrentUser()
                when (currentUser?.role) {
                    UserRole.STUDENT, UserRole.STAFF -> StudentStaffDashboard(sessionManager)
                    UserRole.NURSE -> NurseDashboard(sessionManager)
                    UserRole.DOCTOR, UserRole.DENTIST -> DoctorDashboard(sessionManager)
                    UserRole.ADMIN -> AdminDashboard(sessionManager)
                    UserRole.EMERGENCY -> EmergencyDashboard(sessionManager)
                    null -> LoginScreen(onLoginSuccess = { user ->
                        sessionManager.setCurrentUser(user)
                        isLoggedIn = true
                    })
                }
            }
        }
    }
}

/**
 * Login screen for user authentication.
 */
@Composable
fun LoginScreen(onLoginSuccess: (com.uni.health.model.User) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "University Health System",
            style = MaterialTheme.typography.headlineLarge,
            modifier = Modifier.padding(bottom = 32.dp)
        )
        
        Card(
            modifier = Modifier.width(400.dp),
            elevation = CardDefaults.cardElevation(defaultElevation = 4.dp)
        ) {
            Column(
                modifier = Modifier.padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = "Sign In",
                    style = MaterialTheme.typography.titleLarge
                )
                
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Email") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Password") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation()
                )
                
                if (errorMessage != null) {
                    Text(
                        text = errorMessage!!,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
                
                Button(
                    onClick = {
                        isLoading = true
                        // TODO: Implement actual authentication
                        // Simulate login for demo
                        kotlinx.coroutines.GlobalScope.launch {
                            kotlinx.coroutines.delay(1000)
                            // Mock successful login
                            val mockUser = com.uni.health.model.User(
                                email = email,
                                passwordHash = "hashed",
                                role = UserRole.STUDENT
                            )
                            isLoading = false
                            onLoginSuccess(mockUser)
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !isLoading
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            color = MaterialTheme.colorScheme.onPrimary
                        )
                    } else {
                        Text("Sign In")
                    }
                }
            }
        }
    }
}

/**
 * Dashboard for students and staff.
 * Shows health profile, appointments, prescriptions, and SOS button.
 */
@Composable
fun StudentStaffDashboard(sessionManager: SessionManager) {
    var selectedTab by remember { mutableStateOf(0) }
    val tabs = listOf("Profile", "Appointments", "Prescriptions", "Clearances")
    
    Column {
        // Top app bar with logout
        TopAppBar(
            title = { Text("Student/Staff Portal") },
            actions = {
                TextButton(onClick = { sessionManager.logout() }) {
                    Text("Logout")
                }
            }
        )
        
        // Tab row
        TabRow(selectedTabIndex = selectedTab) {
            tabs.forEachIndexed { index, title ->
                Tab(
                    selected = selectedTab == index,
                    onClick = { selectedTab = index },
                    text = { Text(title) }
                )
            }
        }
        
        // Tab content
        Box(modifier = Modifier.fillMaxSize()) {
            when (selectedTab) {
                0 -> ProfileTab()
                1 -> AppointmentsTab()
                2 -> PrescriptionsTab()
                3 -> ClearancesTab()
            }
        }
        
        // SOS Panic Button (always visible)
        SOSButton()
    }
}

/**
 * Dashboard for nurses.
 * Shows queue management, patient records, inventory.
 */
@Composable
fun NurseDashboard(sessionManager: SessionManager) {
    var selectedTab by remember { mutableStateOf(0) }
    val tabs = listOf("Queue", "Patient Records", "Inventory", "Issue Clearance")
    
    Column {
        TopAppBar(
            title = { Text("Nurse Dashboard") },
            actions = {
                TextButton(onClick = { sessionManager.logout() }) {
                    Text("Logout")
                }
            }
        )
        
        TabRow(selectedTabIndex = selectedTab) {
            tabs.forEachIndexed { index, title ->
                Tab(
                    selected = selectedTab == index,
                    onClick = { selectedTab = index },
                    text = { Text(title) }
                )
            }
        }
        
        Box(modifier = Modifier.fillMaxSize()) {
            when (selectedTab) {
                0 -> QueueManagementTab()
                1 -> PatientRecordsTab()
                2 -> InventoryTab()
                3 -> IssueClearanceTab()
            }
        }
    }
}

/**
 * Dashboard for doctors and dentists.
 * Shows EMR, appointments, prescriptions, analytics.
 */
@Composable
fun DoctorDashboard(sessionManager: SessionManager) {
    var selectedTab by remember { mutableStateOf(0) }
    val tabs = listOf("Patients", "EMR", "Appointments", "Analytics")
    
    Column {
        TopAppBar(
            title = { Text("Doctor Dashboard") },
            actions = {
                TextButton(onClick = { sessionManager.logout() }) {
                    Text("Logout")
                }
            }
        )
        
        TabRow(selectedTabIndex = selectedTab) {
            tabs.forEachIndexed { index, title ->
                Tab(
                    selected = selectedTab == index,
                    onClick = { selectedTab = index },
                    text = { Text(title) }
                )
            }
        }
        
        Box(modifier = Modifier.fillMaxSize()) {
            when (selectedTab) {
                0 -> PatientListTab()
                1 -> EMRTab()
                2 -> DoctorAppointmentsTab()
                3 -> AnalyticsTab()
            }
        }
    }
}

/**
 * Dashboard for admin.
 * Shows user management, system settings, compliance.
 */
@Composable
fun AdminDashboard(sessionManager: SessionManager) {
    var selectedTab by remember { mutableStateOf(0) }
    val tabs = listOf("Users", "Roles", "System Logs", "Compliance")
    
    Column {
        TopAppBar(
            title = { Text("Admin Dashboard") },
            actions = {
                TextButton(onClick = { sessionManager.logout() }) {
                    Text("Logout")
                }
            }
        )
        
        TabRow(selectedTabIndex = selectedTab) {
            tabs.forEachIndexed { index, title ->
                Tab(
                    selected = selectedTab == index,
                    onClick = { selectedTab = index },
                    text = { Text(title) }
                )
            }
        }
        
        Box(modifier = Modifier.fillMaxSize()) {
            when (selectedTab) {
                0 -> UserManagementTab()
                1 -> RoleManagementTab()
                2 -> SystemLogsTab()
                3 -> ComplianceTab()
            }
        }
    }
}

/**
 * Dashboard for emergency personnel.
 * Shows active alerts, location mapping.
 */
@Composable
fun EmergencyDashboard(sessionManager: SessionManager) {
    Column {
        TopAppBar(
            title = { Text("Emergency Response Dashboard") },
            actions = {
                TextButton(onClick = { sessionManager.logout() }) {
                    Text("Logout")
                }
            }
        )
        
        Box(modifier = Modifier.fillMaxSize()) {
            ActiveAlertsTab()
        }
    }
}

// Placeholder tab composables - implement full UI in production
@Composable fun ProfileTab() { Box(Modifier.fillMaxSize()) { Text("Health Profile") } }
@Composable fun AppointmentsTab() { Box(Modifier.fillMaxSize()) { Text("My Appointments") } }
@Composable fun PrescriptionsTab() { Box(Modifier.fillMaxSize()) { Text("My Prescriptions") } }
@Composable fun ClearancesTab() { Box(Modifier.fillMaxSize()) { Text("My Clearances") } }
@Composable fun QueueManagementTab() { Box(Modifier.fillMaxSize()) { Text("Live Queue Dashboard") } }
@Composable fun PatientRecordsTab() { Box(Modifier.fillMaxSize()) { Text("Patient Records") } }
@Composable fun InventoryTab() { Box(Modifier.fillMaxSize()) { Text("Medicine Inventory") } }
@Composable fun IssueClearanceTab() { Box(Modifier.fillMaxSize()) { Text("Issue Clearance") } }
@Composable fun PatientListTab() { Box(Modifier.fillMaxSize()) { Text("Patient List") } }
@Composable fun EMRTab() { Box(Modifier.fillMaxSize()) { Text("Electronic Medical Records") } }
@Composable fun DoctorAppointmentsTab() { Box(Modifier.fillMaxSize()) { Text("My Schedule") } }
@Composable fun AnalyticsTab() { Box(Modifier.fillMaxSize()) { Text("Health Analytics") } }
@Composable fun UserManagementTab() { Box(Modifier.fillMaxSize()) { Text("User Management") } }
@Composable fun RoleManagementTab() { Box(Modifier.fillMaxSize()) { Text("Role Management") } }
@Composable fun SystemLogsTab() { Box(Modifier.fillMaxSize()) { Text("System Logs") } }
@Composable fun ComplianceTab() { Box(Modifier.fillMaxSize()) { Text("Data Privacy Compliance") } }
@Composable fun ActiveAlertsTab() { Box(Modifier.fillMaxSize()) { Text("Active Emergency Alerts") } }

/**
 * SOS Panic Button - always visible for emergencies.
 * One-tap button that sends location and profile to clinic.
 */
@Composable
fun SOSButton() {
    var isPressed by remember { mutableStateOf(false) }
    
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        contentAlignment = Alignment.BottomEnd
    ) {
        FloatingActionButton(
            onClick = {
                isPressed = true
                // TODO: Trigger SOS alert with location
                // In production: get location, create alert, send to server
            },
            containerColor = MaterialTheme.colorScheme.error,
            contentColor = MaterialTheme.colorScheme.onError
        ) {
            Text("SOS", style = MaterialTheme.typography.titleMedium)
        }
    }
}
