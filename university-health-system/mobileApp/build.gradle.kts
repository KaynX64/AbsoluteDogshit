plugins {
    id("com.android.application") version "8.1.0"
    kotlin("android") version "1.9.20"
}

android {
    namespace = "com.uni.health.mobile"
    compileSdk = 34
    
    defaultConfig {
        applicationId = "com.uni.health.mobile"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
    }
    
    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    
    kotlinOptions {
        jvmTarget = "17"
    }
    
    buildFeatures {
        compose = true
    }
    
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.4"
    }
}

dependencies {
    // Include shared module for common business logic
    implementation(project(":shared"))
    
    // Jetpack Compose for Mobile UI (Android phones and tablets)
    implementation("androidx.compose.ui:ui:1.5.4")
    implementation("androidx.compose.material3:material3:1.1.2")
    implementation("androidx.compose.ui:ui-tooling-preview:1.5.4")
    
    // ZXing for QR Code scanning
    implementation("com.google.zxing:core:3.5.1")
    implementation("me.dm7.barcodescanner:zxing:1.9.13")
    
    // Kotlinx Coroutines for async operations
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    
    // Room Database for local storage
    implementation("androidx.room:room-runtime:2.6.0")
    annotationProcessor("androidx.room:room-compiler:2.6.0")
    
    // Lifecycle components
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.6.2")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.6.2")
    
    // Navigation
    implementation("androidx.navigation:navigation-compose:2.7.5")
    
    // CameraX for QR code scanning
    implementation("androidx.camera:camera-camera2:1.3.0")
    implementation("androidx.camera:camera-lifecycle:1.3.0")
    implementation("androidx.camera:camera-view:1.3.0")
    
    // Location services for SOS feature
    implementation("com.google.android.gms:play-services-location:21.0.1")
}
