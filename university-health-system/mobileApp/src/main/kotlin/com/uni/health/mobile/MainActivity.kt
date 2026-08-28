package com.uni.health.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.uni.health.presentation.SessionManager
import com.uni.health.domain.UserRole

/**
 * Main Activity for the Mobile application.
 * Runs on Android phones and tablets using Jetpack Compose.
 */
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        val sessionManager = SessionManager()
        
        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    MobileAppContent(sessionManager = sessionManager)
                }
            }
        }
    }
}

/**
 * Main mobile app content with navigation based on user role.
 */
@Composable
fun MobileAppContent(sessionManager: SessionManager) {
    var isLoggedIn by remember { mutableStateOf(sessionManager.isLoggedIn()) }
    
    if (!isLoggedIn) {
        MobileLoginScreen(
            onLoginSuccess = { user ->
                sessionManager.setCurrentUser(user)
                isLoggedIn = true
            }
        )
    } else {
        val currentUser = sessionManager.getCurrentUser()
        when (currentUser?.role) {
            UserRole.STUDENT, UserRole.STAFF -> MobileStudentStaffDashboard(sessionManager)
            UserRole.NURSE -> MobileNurseDashboard(sessionManager)
            UserRole.DOCTOR, UserRole.DENTIST -> MobileDoctorDashboard(sessionManager)
            UserRole.ADMIN -> MobileAdminDashboard(sessionManager)
            UserRole.EMERGENCY -> MobileEmergencyDashboard(sessionManager)
            null -> MobileLoginScreen(onLoginSuccess = { user ->
                sessionManager.setCurrentUser(user)
                isLoggedIn = true
            })
        }
    }
}

/**
 * Mobile-optimized login screen.
 */
@Composable
fun MobileLoginScreen(onLoginSuccess: (com.uni.health.model.User) -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "University Health System",
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(bottom = 32.dp)
        )
        
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Button(
            onClick = {
                // TODO: Implement actual authentication
                val mockUser = com.uni.health.model.User(
                    email = email,
                    passwordHash = "hashed",
                    role = UserRole.STUDENT
                )
                onLoginSuccess(mockUser)
            },
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Sign In")
        }
    }
}

/**
 * Mobile dashboard for students and staff.
 * Optimized for phone and tablet screens.
 */
@Composable
fun MobileStudentStaffDashboard(sessionManager: SessionManager) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Health Portal") },
                actions = {
                    IconButton(onClick = { sessionManager.logout() }) {
                        Icon(
                            androidx.compose.material.icons.Icons.Default.Close,
                            contentDescription = "Logout"
                        )
                    }
                }
            )
        },
        floatingActionButton = {
            // SOS Button always accessible
            FloatingActionButton(
                onClick = {
                    // TODO: Trigger SOS with location
                },
                containerColor = MaterialTheme.colorScheme.error
            ) {
                Text("SOS")
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .padding(16.dp)
        ) {
            // Quick access cards
            HealthProfileCard()
            Spacer(modifier = Modifier.height(16.dp))
            AppointmentsCard()
            Spacer(modifier = Modifier.height(16.dp))
            PrescriptionsCard()
            Spacer(modifier = Modifier.height(16.dp))
            ClearancesCard()
        }
    }
}

/**
 * Mobile dashboard for nurses.
 */
@Composable
fun MobileNurseDashboard(sessionManager: SessionManager) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Nurse Dashboard") },
                actions = {
                    IconButton(onClick = { sessionManager.logout() }) {
                        Icon(
                            androidx.compose.material.icons.Icons.Default.Close,
                            contentDescription = "Logout"
                        )
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .padding(16.dp)
        ) {
            QueueDashboardCard()
            Spacer(modifier = Modifier.height(16.dp))
            InventoryAlertsCard()
        }
    }
}

/**
 * Mobile dashboard for doctors.
 */
@Composable
fun MobileDoctorDashboard(sessionManager: SessionManager) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Doctor Dashboard") },
                actions = {
                    IconButton(onClick = { sessionManager.logout() }) {
                        Icon(
                            androidx.compose.material.icons.Icons.Default.Close,
                            contentDescription = "Logout"
                        )
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .padding(16.dp)
        ) {
            TodayAppointmentsCard()
            Spacer(modifier = Modifier.height(16.dp))
            PatientQueueCard()
        }
    }
}

/**
 * Mobile dashboard for admin.
 */
@Composable
fun MobileAdminDashboard(sessionManager: SessionManager) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Admin Dashboard") },
                actions = {
                    IconButton(onClick = { sessionManager.logout() }) {
                        Icon(
                            androidx.compose.material.icons.Icons.Default.Close,
                            contentDescription = "Logout"
                        )
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .padding(16.dp)
        ) {
            UserManagementCard()
            Spacer(modifier = Modifier.height(16.dp))
            SystemStatusCard()
        }
    }
}

/**
 * Mobile dashboard for emergency personnel.
 */
@Composable
fun MobileEmergencyDashboard(sessionManager: SessionManager) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Emergency Response") },
                actions = {
                    IconButton(onClick = { sessionManager.logout() }) {
                        Icon(
                            androidx.compose.material.icons.Icons.Default.Close,
                            contentDescription = "Logout"
                        )
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .padding(paddingValues)
                .padding(16.dp)
        ) {
            ActiveAlertsCard()
        }
    }
}

// Placeholder card composables - implement full UI in production
@Composable fun HealthProfileCard() { Card { Modifier.padding(16.dp); Text("Health Profile") } }
@Composable fun AppointmentsCard() { Card { Modifier.padding(16.dp); Text("Appointments") } }
@Composable fun PrescriptionsCard() { Card { Modifier.padding(16.dp); Text("Prescriptions") } }
@Composable fun ClearancesCard() { Card { Modifier.padding(16.dp); Text("Clearances") } }
@Composable fun QueueDashboardCard() { Card { Modifier.padding(16.dp); Text("Queue Dashboard") } }
@Composable fun InventoryAlertsCard() { Card { Modifier.padding(16.dp); Text("Inventory Alerts") } }
@Composable fun TodayAppointmentsCard() { Card { Modifier.padding(16.dp); Text("Today's Appointments") } }
@Composable fun PatientQueueCard() { Card { Modifier.padding(16.dp); Text("Patient Queue") } }
@Composable fun UserManagementCard() { Card { Modifier.padding(16.dp); Text("User Management") } }
@Composable fun SystemStatusCard() { Card { Modifier.padding(16.dp); Text("System Status") } }
@Composable fun ActiveAlertsCard() { Card { Modifier.padding(16.dp); Text("Active Alerts") } }

@Composable
fun Card(content: @Composable () -> Unit) {
    androidx.compose.material3.Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = androidx.compose.material3.CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        content()
    }
}
