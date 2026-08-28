package com.university.health.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.university.health.model.*

/**
 * Main App Screen - Multiplatform University Health System
 * 
 * This is the shared UI component that works on:
 * - PC/Desktop (Windows, macOS, Linux)
 * - Android (Phones and Tablets)
 * - Web (Browsers)
 * 
 * The UI automatically adapts to screen size and platform capabilities.
 */
@Composable
fun UniversityHealthApp() {
    // State for navigation between screens
    var currentScreen by remember { mutableStateOf(Screen.HOME) }
    
    // State for user authentication
    var currentUser by remember { mutableStateOf<User?>(null) }
    
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Color(0xFF1976D2),  // University Blue
            secondary = Color(0xFF4CAF50), // Health Green
            tertiary = Color(0xFFF44336)   // Emergency Red
        )
    ) {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Top App Bar - Shows app title and user info
                TopAppBar(
                    title = { 
                        Text(
                            "🏥 University Health System",
                            fontWeight = FontWeight.Bold
                        ) 
                    },
                    actions = {
                        if (currentUser != null) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.End,
                                modifier = Modifier.padding(end = 16.dp)
                            ) {
                                Icon(
                                    Icons.Default.Person,
                                    contentDescription = "User",
                                    modifier = Modifier.size(24.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    "${currentUser!!.firstName} ${currentUser!!.lastName}",
                                    fontSize = 14.sp
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Chip(
                                    onClick = { /* Logout */ },
                                    colors = ChipDefaults.chipColors(
                                        containerColor = MaterialTheme.colorScheme.primaryContainer
                                    )
                                ) {
                                    Text(currentUser!!.role.name, fontSize = 12.sp)
                                }
                            }
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        titleContentColor = Color.White
                    )
                )
                
                // Main Content Area
                Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                    when (currentScreen) {
                        Screen.HOME -> HomeScreen(
                            user = currentUser,
                            onNavigate = { currentScreen = it },
                            onLogin = { user -> currentUser = user }
                        )
                        Screen.PROFILE -> ProfileScreen(user = currentUser)
                        Screen.APPOINTMENTS -> AppointmentsScreen(user = currentUser)
                        Screen.EMR -> EMRScreen(user = currentUser)
                        Screen.SOS -> SOSScreen(user = currentUser)
                        Screen.INVENTORY -> InventoryScreen()
                        Screen.QUEUE -> QueueDashboardScreen()
                        Screen.ADMIN -> AdminScreen()
                    }
                }
                
                // Bottom Navigation Bar - Only shown on mobile/tablet
                // On desktop, this would be a side navigation rail
                if (currentUser != null) {
                    NavigationBar(
                        containerColor = MaterialTheme.colorScheme.surface
                    ) {
                        getNavigationItems(currentUser!!.role).forEach { item ->
                            NavigationBarItem(
                                icon = { Icon(item.icon, contentDescription = item.label) },
                                label = { Text(item.label, fontSize = 12.sp) },
                                selected = currentScreen == item.screen,
                                onClick = { currentScreen = item.screen },
                                colors = NavigationBarItemDefaults.colors(
                                    indicatorColor = MaterialTheme.colorScheme.primaryContainer
                                )
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * Navigation items based on user role.
 * Different roles see different navigation options.
 */
private fun getNavigationItems(role: UserRole): List<NavigationItem> {
    return when (role) {
        UserRole.STUDENT, UserRole.STAFF -> listOf(
            NavigationItem(Screen.HOME, Icons.Default.Home, "Home"),
            NavigationItem(Screen.PROFILE, Icons.Default.Person, "Profile"),
            NavigationItem(Screen.APPOINTMENTS, Icons.Default.CalendarToday, "Appointments"),
            NavigationItem(Screen.SOS, Icons.Default.Warning, "SOS")
        )
        UserRole.DOCTOR, UserRole.DENTIST -> listOf(
            NavigationItem(Screen.HOME, Icons.Default.Home, "Home"),
            NavigationItem(Screen.EMR, Icons.Default.Description, "EMR"),
            NavigationItem(Screen.QUEUE, Icons.Default.Queue, "Queue"),
            NavigationItem(Screen.APPOINTMENTS, Icons.Default.CalendarToday, "Schedule")
        )
        UserRole.NURSE -> listOf(
            NavigationItem(Screen.HOME, Icons.Default.Home, "Home"),
            NavigationItem(Screen.EMR, Icons.Default.Description, "Records"),
            NavigationItem(Screen.INVENTORY, Icons.Default.Inventory, "Inventory"),
            NavigationItem(Screen.QUEUE, Icons.Default.Queue, "Queue")
        )
        UserRole.ADMIN -> listOf(
            NavigationItem(Screen.HOME, Icons.Default.Home, "Home"),
            NavigationItem(Screen.ADMIN, Icons.Default.Settings, "Admin"),
            NavigationItem(Screen.QUEUE, Icons.Default.Queue, "Queue")
        )
        UserRole.EMERGENCY_PERSONNEL -> listOf(
            NavigationItem(Screen.HOME, Icons.Default.Home, "Home"),
            NavigationItem(Screen.SOS, Icons.Default.Warning, "Alerts")
        )
    }
}

/**
 * Navigation item data class.
 */
private data class NavigationItem(
    val screen: Screen,
    val icon: ImageVector,
    val label: String
)

/**
 * Screen enumeration for navigation.
 */
enum class Screen {
    HOME, PROFILE, APPOINTMENTS, EMR, SOS, INVENTORY, QUEUE, ADMIN
}

/**
 * Home Screen - Dashboard showing quick actions and notifications.
 * Adapts layout based on device type (PC vs Phone/Tablet).
 */
@Composable
fun HomeScreen(
    user: User?,
    onNavigate: (Screen) -> Unit,
    onLogin: (User) -> Unit
) {
    if (user == null) {
        // Login Screen
        LoginScreen(onLogin = onLogin)
    } else {
        // Dashboard
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Welcome Message
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.primaryContainer
                    )
                ) {
                    Column(modifier = Modifier.padding(24.dp)) {
                        Text(
                            "Welcome back, ${user.firstName}!",
                            fontSize = 24.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                        Text(
                            "Role: ${user.role.name}",
                            fontSize = 16.sp,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    }
                }
            }
            
            // Quick Actions based on role
            item {
                Text("Quick Actions", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            }
            
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    when (user.role) {
                        UserRole.STUDENT, UserRole.STAFF -> {
                            ActionCard(Icons.Default.CalendarToday, "Book Appointment", onClick = { onNavigate(Screen.APPOINTMENTS) })
                            ActionCard(Icons.Default.Person, "My Profile", onClick = { onNavigate(Screen.PROFILE) })
                            ActionCard(Icons.Default.Warning, "SOS Emergency", color = Color.Red, onClick = { onNavigate(Screen.SOS) })
                        }
                        UserRole.DOCTOR, UserRole.DENTIST -> {
                            ActionCard(Icons.Default.Description, "View EMR", onClick = { onNavigate(Screen.EMR) })
                            ActionCard(Icons.Default.Queue, "Queue Dashboard", onClick = { onNavigate(Screen.QUEUE) })
                            ActionCard(Icons.Default.CalendarToday, "My Schedule", onClick = { onNavigate(Screen.APPOINTMENTS) })
                        }
                        UserRole.NURSE -> {
                            ActionCard(Icons.Default.Inventory, "Inventory", onClick = { onNavigate(Screen.INVENTORY) })
                            ActionCard(Icons.Default.Queue, "Queue", onClick = { onNavigate(Screen.QUEUE) })
                            ActionCard(Icons.Default.Description, "Records", onClick = { onNavigate(Screen.EMR) })
                        }
                        else -> {
                            ActionCard(Icons.Default.Home, "Dashboard", onClick = { onNavigate(Screen.HOME) })
                        }
                    }
                }
            }
            
            // Notifications/Alerts
            item {
                Text("Recent Notifications", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            }
            
            items(3) { index ->
                NotificationCard(
                    title = "Notification ${index + 1}",
                    message = "This is a sample notification for the university health system.",
                    time = "${index + 1} hour(s) ago"
                )
            }
        }
    }
}

/**
 * Login Screen for user authentication.
 */
@Composable
fun LoginScreen(onLogin: (User) -> Unit) {
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
            "🏥 University Health System",
            fontSize = 28.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(bottom = 32.dp)
        )
        
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
            leadingIcon = { Icon(Icons.Default.Email, contentDescription = "Email") }
        )
        
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Password") },
            modifier = Modifier.fillMaxWidth().padding(bottom = 24.dp),
            leadingIcon = { Icon(Icons.Default.Lock, contentDescription = "Password") }
        )
        
        Button(
            onClick = {
                // Demo login - in production, call actual authentication service
                val demoUser = User(
                    id = "DEMO-001",
                    email = email,
                    passwordHash = "hashed",
                    firstName = "Demo",
                    lastName = "User",
                    role = UserRole.STUDENT,
                    phoneNumber = "09171234567"
                )
                onLogin(demoUser)
            },
            modifier = Modifier.fillMaxWidth().height(50.dp)
        ) {
            Text("Login", fontSize = 16.sp)
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Text(
            "Demo credentials:\nstudent@university.edu.ph / student123\ndoctor@university.edu.ph / doctor123",
            fontSize = 12.sp,
            color = Color.Gray
        )
    }
}

/**
 * Profile Screen - Displays user's digital health profile.
 */
@Composable
fun ProfileScreen(user: User?) {
    if (user == null) {
        Text("Please login to view profile")
        return
    }
    
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text("Digital Health Profile", fontWeight = FontWeight.Bold, fontSize = 20.sp)
        }
        
        item {
            ProfileInfoCard("Personal Information", """
                Name: ${user.firstName} ${user.lastName}
                Email: ${user.email}
                Role: ${user.role.name}
                Phone: ${user.phoneNumber}
            """.trimIndent())
        }
        
        item {
            ProfileInfoCard("Medical Information", """
                Blood Type: O+ (Sample)
                Allergies: Penicillin, Peanuts
                Pre-existing Conditions: Asthma
            """.trimIndent())
        }
        
        item {
            ProfileInfoCard("Emergency Contact", """
                Name: Maria Rizal
                Phone: 09201234567
                Relationship: Mother
            """.trimIndent())
        }
    }
}

/**
 * Appointments Screen - Consultation Scheduler.
 */
@Composable
fun AppointmentsScreen(user: User?) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text("Consultation Scheduler", fontWeight = FontWeight.Bold, fontSize = 20.sp)
        }
        
        item {
            Button(
                onClick = { /* Open booking dialog */ },
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.Add, contentDescription = "Add")
                Spacer(modifier = Modifier.width(8.dp))
                Text("Book New Appointment")
            }
        }
        
        item {
            Text("Upcoming Appointments", fontWeight = FontWeight.Bold)
        }
        
        items(3) { index ->
            AppointmentCard(
                doctorName = "Dr. Santos",
                date = "Dec ${28 + index}, 2024",
                time = "${9 + index}:00 AM",
                type = if (index % 2 == 0) "Physical" else "Virtual",
                status = AppointmentStatus.SCHEDULED
            )
        }
    }
}

/**
 * EMR Screen - Electronic Medical Records viewer.
 */
@Composable
fun EMRScreen(user: User?) {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text("Electronic Medical Records", fontWeight = FontWeight.Bold, fontSize = 20.sp)
        }
        
        item {
            OutlinedTextField(
                value = "",
                onValueChange = { },
                label = { Text("Search patient records...") },
                modifier = Modifier.fillMaxWidth(),
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = "Search") }
            )
        }
        
        item {
            Text("Recent Consultations", fontWeight = FontWeight.Bold)
        }
        
        items(5) { index ->
            ConsultationRecordCard(
                patientName = "Patient ${index + 1}",
                diagnosis = "Sample Diagnosis ${index + 1}",
                date = "Dec ${20 + index}, 2024"
            )
        }
    }
}

/**
 * SOS Screen - Emergency Panic Button.
 * Critical feature for campus emergencies.
 */
@Composable
fun SOSScreen(user: User?) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            "EMERGENCY SOS",
            fontWeight = FontWeight.Bold,
            fontSize = 24.sp,
            color = Color.Red
        )
        
        Spacer(modifier = Modifier.height(32.dp))
        
        Text(
            "Tap the button below to send an emergency alert\nwith your location to the clinic response team.",
            modifier = Modifier.padding(horizontal = 32.dp)
        )
        
        Spacer(modifier = Modifier.height(48.dp))
        
        // Large SOS Button
        Button(
            onClick = { /* Trigger SOS alert */ },
            modifier = Modifier
                .size(200.dp)
                .background(Color.Red, shape = MaterialTheme.shapes.large),
            colors = ButtonDefaults.buttonColors(
                containerColor = Color.Red
            )
        ) {
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                Icon(
                    Icons.Default.Warning,
                    contentDescription = "SOS",
                    modifier = Modifier.size(64.dp),
                    tint = Color.White
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    "SOS",
                    fontSize = 32.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
            }
        }
        
        Spacer(modifier = Modifier.height(32.dp))
        
        Text(
            "Your location will be sent to emergency responders",
            fontSize = 14.sp,
            color = Color.Gray
        )
    }
}

/**
 * Inventory Screen - Medicine Inventory Management.
 */
@Composable
fun InventoryScreen() {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text("Medicine Inventory", fontWeight = FontWeight.Bold, fontSize = 20.sp)
        }
        
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                StatCard("Total Items", "500")
                StatCard("Low Stock", "12", Color Orange)
                StatCard("Expiring Soon", "5", Color.Red)
            }
        }
        
        item {
            Text("Stock Levels", fontWeight = FontWeight.Bold)
        }
        
        items(5) { index ->
            MedicineInventoryRow(
                name = "Medicine ${index + 1}",
                stock = (100 - index * 15).toString(),
                unit = "tablets",
                isLowStock = index > 3
            )
        }
    }
}

/**
 * Queue Dashboard Screen - Live patient queue management.
 */
@Composable
fun QueueDashboardScreen() {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text("Live Queue Dashboard", fontWeight = FontWeight.Bold, fontSize = 20.sp)
        }
        
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                StatCard("Waiting", "8")
                StatCard("Being Attended", "3")
                StatCard("Completed Today", "45")
            }
        }
        
        item {
            Text("Current Queue", fontWeight = FontWeight.Bold)
        }
        
        items(5) { index ->
            QueueEntryCard(
                queueNumber = index + 1,
                patientName = "Patient ${index + 1}",
                waitTime = "${15 + index * 5} mins",
                priority = if (index == 0) PriorityLevel.EMERGENCY else if (index == 1) PriorityLevel.URGENT else PriorityLevel.NORMAL
            )
        }
    }
}

/**
 * Admin Screen - System administration.
 */
@Composable
fun AdminScreen() {
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            Text("System Administration", fontWeight = FontWeight.Bold, fontSize = 20.sp)
        }
        
        item {
            AdminOptionCard(Icons.Default.People, "User Management", "Manage users and roles")
            AdminOptionCard(Icons.Default.Security, "Access Control", "Configure permissions")
            AdminOptionCard(Icons.Default.Storage, "Data Privacy", "Compliance settings")
            AdminOptionCard(Icons.Default.Analytics, "Health Analytics", "View reports")
            AdminOptionCard(Icons.Default.LogoDev, "Audit Logs", "View system logs")
        }
    }
}

// Reusable UI Components

@Composable
fun ActionCard(icon: ImageVector, label: String, color: Color = Color.Blue, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .weight(1f)
            .height(120.dp)
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = color.copy(alpha = 0.1f)
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(icon, contentDescription = label, tint = color, modifier = Modifier.size(40.dp))
            Spacer(modifier = Modifier.height(8.dp))
            Text(label, fontWeight = FontWeight.Medium)
        }
    }
}

@Composable
fun NotificationCard(title: String, message: String, time: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(4.dp))
            Text(message, fontSize = 14.sp)
            Spacer(modifier = Modifier.height(8.dp))
            Text(time, fontSize = 12.sp, color = Color.Gray)
        }
    }
}

@Composable
fun ProfileInfoCard(title: String, content: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Spacer(modifier = Modifier.height(8.dp))
            Text(content, fontSize = 14.sp)
        }
    }
}

@Composable
fun AppointmentCard(doctorName: String, date: String, time: String, type: String, status: AppointmentStatus) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("Dr. $doctorName", fontWeight = FontWeight.Bold)
                Text("$date at $time")
                Text(type, fontSize = 12.sp, color = Color.Gray)
            }
            Chip(
                onClick = { },
                colors = ChipDefaults.chipColors(
                    containerColor = when (status) {
                        AppointmentStatus.SCHEDULED -> Color.Green
                        AppointmentStatus.CANCELLED -> Color.Red
                        else -> Color.Gray
                    }
                )
            ) {
                Text(status.name)
            }
        }
    }
}

@Composable
fun ConsultationRecordCard(patientName: String, diagnosis: String, date: String) {
    Card(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(patientName, fontWeight = FontWeight.Bold)
            Text(diagnosis, fontSize = 14.sp)
            Text(date, fontSize = 12.sp, color = Color.Gray)
        }
    }
}

@Composable
fun StatCard(label: String, value: String, color: Color = Color.Blue) {
    Card(
        modifier = Modifier.weight(1f),
        colors = CardDefaults.cardColors(
            containerColor = color.copy(alpha = 0.1f)
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(value, fontWeight = FontWeight.Bold, fontSize = 24.sp, color = color)
            Text(label, fontSize = 12.sp)
        }
    }
}

@Composable
fun MedicineInventoryRow(name: String, stock: String, unit: String, isLowStock: Boolean) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (isLowStock) Color.Red.copy(alpha = 0.1f) else MaterialTheme.colorScheme.surface
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(name, fontWeight = FontWeight.Medium)
            Row {
                Text(stock, fontWeight = FontWeight.Bold, color = if (isLowStock) Color.Red else Color.Unspecified)
                Text(" $unit", color = Color.Gray)
            }
        }
    }
}

@Composable
fun QueueEntryCard(queueNumber: Int, patientName: String, waitTime: String, priority: PriorityLevel) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = when (priority) {
                PriorityLevel.EMERGENCY -> Color.Red.copy(alpha = 0.1f)
                PriorityLevel.URGENT -> Color Orange.copy(alpha = 0.1f)
                else -> MaterialTheme.colorScheme.surface
            }
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .background(
                            when (priority) {
                                PriorityLevel.EMERGENCY -> Color.Red
                                PriorityLevel.URGENT -> Color Orange
                                else -> Color.Gray
                            },
                            shape = MaterialTheme.shapes.small
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Text("#$queueNumber", color = Color.White, fontWeight = FontWeight.Bold)
                }
                Spacer(modifier = Modifier.width(16.dp))
                Column {
                    Text(patientName, fontWeight = FontWeight.Medium)
                    Text("Wait time: $waitTime", fontSize = 12.sp, color = Color.Gray)
                }
            }
            Chip(
                onClick = { },
                colors = ChipDefaults.chipColors(
                    containerColor = when (priority) {
                        PriorityLevel.EMERGENCY -> Color.Red
                        PriorityLevel.URGENT -> Color Orange
                        else -> Color.Gray
                    }
                )
            ) {
                Text(priority.name, color = Color.White)
            }
        }
    }
}

@Composable
fun AdminOptionCard(icon: ImageVector, title: String, description: String) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { },
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(icon, contentDescription = title, modifier = Modifier.size(40.dp))
            Spacer(modifier = Modifier.width(16.dp))
            Column {
                Text(title, fontWeight = FontWeight.Bold)
                Text(description, fontSize = 12.sp, color = Color.Gray)
            }
        }
    }
}
