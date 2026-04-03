package com.vocdonipassport.barretenberg;

import android.app.ActivityManager;
import android.content.Context;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import android.util.Base64;
import android.util.Log;
import java.io.File;

public class BarretenbergModule extends ReactContextBaseJavaModule {
    private static final String TAG = "Barretenberg";
    private static boolean nativeLoaded = false;

    static {
        try {
            System.loadLibrary("barretenberg_jni");
            nativeLoaded = true;
            Log.i(TAG, "libbarretenberg_jni.so loaded");
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "Failed to load native lib: " + e.getMessage());
        }
    }

    public BarretenbergModule(ReactApplicationContext ctx) {
        super(ctx);
        if (nativeLoaded) {
            try {
                configureRuntimeProfile(ctx);
                File crsDir = new File(ctx.getFilesDir(), "bb-crs");
                crsDir.mkdirs();
                nativeSetCrsPath(crsDir.getAbsolutePath());
            } catch (Exception e) {
                Log.w(TAG, "Failed to set CRS path: " + e.getMessage());
            }
        }
    }

    @Override public String getName() { return "Barretenberg"; }

    private void configureRuntimeProfile(Context ctx) {
        long totalMemBytes = 0L;
        int cpuCount = Runtime.getRuntime().availableProcessors();
        try {
            ActivityManager activityManager = (ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE);
            if (activityManager != null) {
                ActivityManager.MemoryInfo memoryInfo = new ActivityManager.MemoryInfo();
                activityManager.getMemoryInfo(memoryInfo);
                totalMemBytes = memoryInfo.totalMem;
            }
        } catch (Throwable e) {
            Log.w(TAG, "Could not read device memory: " + e.getMessage());
        }

        try {
            nativeConfigureRuntime(totalMemBytes, cpuCount);
            Log.i(TAG, "Configured native runtime for totalMemBytes=" + totalMemBytes + " cpuCount=" + cpuCount);
        } catch (Throwable e) {
            Log.w(TAG, "Failed to configure runtime profile: " + e.getMessage(), e);
        }
    }

    /**
     * Point native CRS_PATH at the directory that contains bn254_g1.dat / bn254_g2.dat / grumpkin_g1.flat.dat.
     * Call after JS has finished downloading CRS (same path as {@code ensureCrsFilesForCircuits}).
     */
    @ReactMethod
    public void setCrsPath(String path) {
        if (!nativeLoaded || path == null || path.isEmpty()) {
            return;
        }
        try {
            nativeSetCrsPath(path);
        } catch (Throwable e) {
            Log.e(TAG, "setCrsPath failed: " + e.getMessage(), e);
        }
    }

    @ReactMethod
    public void isLoaded(Promise promise) { promise.resolve(nativeLoaded); }

    @ReactMethod
    public void bbapi(String inputBase64, Promise promise) {
        if (!nativeLoaded) { promise.reject("NOT_LOADED", "Native library not loaded"); return; }
        if (inputBase64 == null || inputBase64.isEmpty()) { promise.reject("INVALID", "Empty input"); return; }
        try {
            byte[] input = Base64.decode(inputBase64, Base64.NO_WRAP);
            Log.i(TAG, "bbapi decode ok, input bytes=" + input.length);
            byte[] output = nativeBbapi(input);
            if (output == null || output.length == 0) {
                Log.e(TAG, "bbapi returned empty output");
                promise.reject("EMPTY", "Empty output");
                return;
            }
            Log.i(TAG, "bbapi success, output bytes=" + output.length);
            promise.resolve(Base64.encodeToString(output, Base64.NO_WRAP));
        } catch (Throwable e) {
            String msg = e.toString();
            if (e.getMessage() != null && !e.getMessage().isEmpty()) {
                msg = e.getClass().getName() + ": " + e.getMessage();
            }
            Log.e(TAG, "bbapi error: " + msg, e);
            promise.reject("BBAPI_ERROR", msg, e);
        }
    }

    private native void nativeSetCrsPath(String path);
    private native void nativeConfigureRuntime(long totalMemBytes, int cpuCount);
    private native byte[] nativeBbapi(byte[] input);
}
