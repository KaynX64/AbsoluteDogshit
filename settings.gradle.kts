// University Health Management System - Project Settings
// Multiplatform configuration for PC, Android, and Web

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
        maven("https://maven.pkg.jetbrains.space/public/p/compose/dev")
    }

    plugins {
        kotlin("multiplatform") version "1.9.20"
        id("com.android.application") version "8.1.0"
        id("org.jetbrains.compose") version "1.5.10"
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven("https://maven.pkg.jetbrains.space/public/p/compose/dev")
    }
}

rootProject.name = "UniversityHealthSystem"
include(":app")
