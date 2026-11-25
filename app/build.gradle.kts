plugins {
    id("com.android.application")
}

android {
    namespace = "com.morvehtv.tv"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.morvehtv.tv"
        minSdk = 19
        targetSdk = 34
        versionCode = 3
        versionName = "1.2"
    }

    signingConfigs {
        create("morvehtv") {
            storeFile = rootProject.file("morvehtv.jks")
            storePassword = "morvehtv2026"
            keyAlias = "morvehtv"
            keyPassword = "morvehtv2026"
            enableV1Signing = true
            enableV2Signing = true
            enableV3Signing = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Si falta el archivo de firma, compila igualmente con la clave de prueba.
            signingConfig = if (rootProject.file("morvehtv.jks").exists())
                signingConfigs.getByName("morvehtv")
            else
                signingConfigs.getByName("debug")
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
