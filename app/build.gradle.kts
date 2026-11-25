plugins {
    id("com.android.application")
}

android {
    namespace = "com.morvehtv.tv"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.morvehtv.app"
        minSdk = 19
        targetSdk = 34
        versionCode = 8
        versionName = "3.0"
        multiDexEnabled = true
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

dependencies {
    // ExoPlayer (Media3). La 1.4.x es la última que funciona desde Android 4.4.
    val media3 = "1.4.1"
    implementation("androidx.media3:media3-exoplayer:$media3")
    implementation("androidx.media3:media3-exoplayer-hls:$media3")
    implementation("androidx.media3:media3-exoplayer-dash:$media3")
    implementation("androidx.media3:media3-ui:$media3")
    implementation("androidx.multidex:multidex:2.0.1")
}
