// University Health Management System - Multiplatform Application Module
// This module uses Kotlin Multiplatform to support PC (Desktop), Android (Phone/Tablet), and Web

plugins {
    kotlin("multiplatform")
    id("com.android.application")
    id("org.jetbrains.compose")
}

group = "com.university.health"
version = "1.0.0"

// Kotlin Multiplatform Configuration
kotlin {
    // Desktop target for PC (Windows, macOS, Linux)
    jvm("desktop") {
        compilations.all {
            kotlinOptions.jvmTarget = "17"
        }
        withJava()
    }
    
    // Android target for Phones and Tablets
    androidTarget {
        compilations.all {
            kotlinOptions.jvmTarget = "17"
        }
        publishLibraryVariants("release", "debug")
    }
    
    // Web target using Kotlin/JS for browser access
    js(IR) {
        browser {
            binaries.executable()
            distribution {
                directory = file("$buildRoot/webDistribution")
            }
        }
    }
    
    sourceSets {
        // Common source set - shared code across all platforms
        val commonMain by getting {
            dependencies {
                // Compose Multiplatform for shared UI
                implementation(compose.runtime)
                implementation(compose.foundation)
                implementation(compose.material3)
                implementation(compose.ui)
                
                // Kotlin coroutines for async operations
                implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
                
                // JSON serialization for data storage and API calls
                implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.0")
                
                // Date/time handling
                implementation("org.jetbrains.kotlinx:kotlinx-datetime:0.4.1")
                
                // Logging
                implementation("io.github.microutils:kotlin-logging-js:3.0.5")
            }
        }
        
        val commonTest by getting {
            dependencies {
                implementation(kotlin("test"))
            }
        }
        
        // Desktop-specific dependencies
        val desktopMain by getting {
            dependencies {
                // Compose Desktop runtime
                implementation(compose.desktop.currentOs)
                
                // QR Code generation for desktop
                implementation("com.google.zxing:core:3.5.1")
                implementation("com.google.zxing:javase:3.5.1")
                
                // File handling and system integration
                implementation("net.java.dev.jna:jna:5.13.0")
            }
        }
        
        // Android-specific dependencies
        val androidMain by getting {
            dependencies {
                // AndroidX libraries
                implementation("androidx.activity:activity-compose:1.8.0")
                implementation("androidx.core:core-ktx:1.12.0")
                
                // Camera for QR scanning on mobile
                implementation("com.google.mlkit:barcode-scanning:17.2.0")
                
                // Location services for SOS feature
                implementation("com.google.android.gms:play-services-location:21.0.1")
                
                // Biometric authentication
                implementation("androidx.biometric:biometric:1.1.0")
            }
        }
        
        // Web-specific dependencies
        val jsMain by getting {
            dependencies {
                // Browser APIs
                implementation(npm("qrcode", "1.5.3"))
                
                // HTTP client for web API calls
                implementation("io.ktor:ktor-client-core:2.3.6")
                implementation("io.ktor:ktor-client-js:2.3.6")
            }
        }
    }
}

// Android configuration
android {
    namespace = "com.university.health"
    compileSdk = 34
    
    defaultConfig {
        applicationId = "com.university.health"
        minSdk = 24  // Android 7.0+ for broader device support
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        
        // Support for phones and tablets
        vectorDrawables.useSupportLibrary = true
    }
    
    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            isDebuggable = true
        }
    }
    
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    
    buildFeatures {
        compose = true
    }
    
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.4"
    }
}

// Compose Desktop configuration
compose.desktop {
    application {
        mainClass = "com.university.health.MainKt"
        
        nativeDistributions {
            targetFormats(
                org.jetbrains.compose.desktop.application.dsl.TargetFormat.Dmg,
                org.jetbrains.compose.desktop.application.dsl.TargetFormat.Msi,
                org.jetbrains.compose.desktop.application.dsl.TargetFormat.Deb
            )
            packageName = "UniversityHealthSystem"
            packageVersion = "1.0.0"
            
            // Include app icon
            // windows {
            //     iconFile.set(file("src/commonMain/resources/icon.ico"))
            // }
            // macOS {
            //     iconFile.set(file("src/commonMain/resources/icon.icns"))
            // }
        }
    }
}
