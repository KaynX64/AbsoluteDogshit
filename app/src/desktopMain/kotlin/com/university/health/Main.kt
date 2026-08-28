package com.university.health

import androidx.compose.ui.window.Window
import androidx.compose.ui.window.application
import androidx.compose.ui.window.rememberWindowState
import androidx.compose.ui.unit.dp
import com.university.health.ui.UniversityHealthApp

/**
 * Desktop Application Entry Point for PC (Windows, macOS, Linux)
 * 
 * This is the main function that runs when users launch the desktop application.
 * It creates a native window and renders the Compose UI.
 * 
 * Platform-specific features:
 * - Native window management
 * - File system access for QR code generation
 * - System tray integration (can be added)
 * - Keyboard shortcuts
 */
fun main() = application {
    // Configure window state for desktop
    val windowState = rememberWindowState(
        width = 1200.dp,  // Wider window for PC
        height = 800.dp   // Taller window for PC
    )
    
    Window(
        onCloseRequest = ::exitApplication,
        title = "🏥 University Health Management System",
        state = windowState
    ) {
        // Render the shared multiplatform UI
        UniversityHealthApp()
    }
}
