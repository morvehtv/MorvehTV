plugins {
    id("com.android.application")
}

android {
    namespace = "com.morvehtv.tv"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.morvehtv.tv"
        minSdk = 21
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Firmado con la clave de depuración para poder instalarlo directamente en la tele.
            // Para publicarlo en Google Play, crea tu propia clave (ver README).
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
}
