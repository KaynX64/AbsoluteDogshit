plugins {
    kotlin("multiplatform") version "1.9.20"
    id("com.android.library") version "8.1.0"
}

group = "com.uni.health"
version = "1.0.0"

kotlin {
    // Desktop (JVM) target for PC
    jvm("desktop")
    
    // Android target for phones and tablets
    androidTarget {
        compilations.all {
            kotlinOptions {
                jvmTarget = "17"
            }
        }
    }
    
    sourceSets {
        val commonMain by getting {
            dependencies {
                // Kotlinx Coroutines for async operations
                implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
                
                // Kotlinx Serialization for JSON handling
                implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.0")
                
                // Ktor Client for network requests (API calls)
                implementation("io.ktor:ktor-client-core:2.3.5")
                
                // UUID generation for unique IDs
                implementation("com.benasher44:uuid:0.8.1")
            }
        }
        
        val desktopMain by getting {
            dependencies {
                // Ktor Client for JVM/Desktop
                implementation("io.ktor:ktor-client-cio:2.3.5")
            }
        }
        
        val androidMain by getting {
            dependencies {
                // Ktor Client for Android
                implementation("io.ktor:ktor-client-android:2.3.5")
            }
        }
    }
}

android {
    namespace = "com.uni.health.shared"
    compileSdk = 34
    defaultConfig {
        minSdk = 24
    }
}
