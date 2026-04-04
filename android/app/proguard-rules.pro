# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# ============================================================
# React Native
# ============================================================
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}
-keepclassmembers @com.facebook.proguard.annotations.KeepGettersAndSetters class * {
  void set*(***);
  *** get*();
}

-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# ============================================================
# Vocdoni Passport Native Modules
# ============================================================
-keepclassmembers class com.vocdonipassport.acvm.AcvmWitnessModule$JsBridge {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep all native module classes
-keep class com.vocdonipassport.** { *; }

# ============================================================
# JMRTD / Passport Reading
# ============================================================
-keep class org.jmrtd.** { *; }
-keep class net.sf.scuba.** { *; }

# ============================================================
# SpongyCastle / BouncyCastle Crypto Provider
# ============================================================
# Keep all SpongyCastle classes (required for passport BAC authentication)
-keep class org.spongycastle.** { *; }
-keep interface org.spongycastle.** { *; }
-keepclassmembers class org.spongycastle.** { *; }

# Keep BouncyCastle classes
-keep class org.bouncycastle.** { *; }
-keep interface org.bouncycastle.** { *; }
-keepclassmembers class org.bouncycastle.** { *; }

# Keep JCE provider registration
-keep class * extends java.security.Provider { *; }
-keep class javax.crypto.** { *; }
-keep class javax.crypto.spec.** { *; }
-keep class java.security.** { *; }

# Don't warn about missing classes
-dontwarn org.spongycastle.**
-dontwarn org.bouncycastle.**
-dontwarn javax.naming.**

# ============================================================
# ML Kit / CameraX
# ============================================================
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# ============================================================
# General optimizations
# ============================================================
# Remove logging in release
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
}

# Keep source file names and line numbers for crash reports
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
