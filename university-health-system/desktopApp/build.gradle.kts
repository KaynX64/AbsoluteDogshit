plugins {
    kotlin("jvm") version "1.9.20"
    application
}

group = "com.uni.health"
version = "1.0.0"

dependencies {
    // Include shared module for common business logic
    implementation(project(":shared"))
    
    // Compose Multiplatform for Desktop UI (PC, Mac, Linux)
    implementation(compose.desktop.currentOs)
    implementation("org.jetbrains.compose.ui:ui:1.5.10")
    implementation("org.jetbrains.compose.material3:material3:1.5.10")
    
    // ZXing for QR Code generation and scanning
    implementation("com.google.zxing:core:3.5.1")
    implementation("com.github.kenglxn.QRGen:javase:2.6.0")
    
    // Kotlinx Coroutines for async operations
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")
    
    // Ktor Server for local API (optional, if needed)
    implementation("io.ktor:ktor-server-core:2.3.5")
    implementation("io.ktor:ktor-server-netty:2.3.5")
    
    // SQLite for local database storage
    implementation("org.xerial:sqlite-jdbc:3.43.0.0")
    
    // Logging
    implementation("ch.qos.logback:logback-classic:1.4.11")
}

application {
    mainClass.set("com.uni.health.desktop.MainDesktopKt")
}

compose.desktop {
    application {
        mainClass = "com.uni.health.desktop.MainDesktopKt"
        
        nativeDistributions {
            targetFormats(
                org.jetbrains.compose.desktop.application.dsl.TargetFormat.Dmg,
                org.jetbrains.compose.desktop.application.dsl.TargetFormat.Msi,
                org.jetbrains.compose.desktop.application.dsl.TargetFormat.Deb
            )
            packageName = "UniversityHealthSystem"
            packageVersion = "1.0.0"
        }
    }
}
