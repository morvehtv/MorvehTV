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
        versionCode = 2
        versionName = "1.1"
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
            signingConfig = signingConfigs.getByName("morvehtv")
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
