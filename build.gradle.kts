// University Health Management System - Multiplatform Build Configuration
// Supports: PC (Desktop), Phone/Tablet (Android), and Web browsers

plugins {
    kotlin("multiplatform") version "1.9.20" apply false
    id("com.android.application") version "8.1.0" apply false
    id("org.jetbrains.compose") version "1.5.10" apply false
}

allprojects {
    repositories {
        google()
        mavenCentral()
        maven("https://maven.pkg.jetbrains.space/public/p/compose/dev")
    }
}
