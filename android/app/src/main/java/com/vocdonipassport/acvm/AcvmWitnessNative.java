package com.vocdonipassport.acvm;

import android.util.Base64;
import android.util.Log;

/**
 * JNI bridge to {@code libacvm_witness_jni.so} (Rust ACVM).
 */
public final class AcvmWitnessNative {
    private static final String TAG = "AcvmWitnessNative";
    private static final boolean LOADED;
    private static final ThreadLocal<String> lastError = new ThreadLocal<>();

    static {
        boolean ok = false;
        try {
            System.loadLibrary("acvm_witness_jni");
            ok = true;
        } catch (UnsatisfiedLinkError e) {
            Log.w(TAG, "acvm_witness_jni not loaded: " + e.getMessage());
        }
        LOADED = ok;
    }

    private AcvmWitnessNative() {}

    public static boolean isAvailable() {
        return LOADED;
    }

    /**
     * Message from the last failed {@link #solvePayloadJsonToWitnessB64} on this thread, then cleared.
     */
    public static String getLastErrorMessage() {
        String s = lastError.get();
        lastError.remove();
        return s != null ? s : "";
    }

    /** Returns gzipped serialized witness bytes; may throw if the solver fails. */
    public static native byte[] nativeSolveFromJsonUtf8(String jsonUtf8);

    /**
     * Base64 (no wrap) of compressed witness bytes for Barretenberg.
     * Returns null if native is unavailable or the call fails.
     */
    public static String solvePayloadJsonToWitnessB64(String jsonUtf8) {
        lastError.remove();
        if (!LOADED) {
            lastError.set("libacvm_witness_jni not loaded");
            return null;
        }
        if (jsonUtf8 == null || jsonUtf8.isEmpty()) {
            lastError.set("empty JSON payload");
            return null;
        }
        try {
            byte[] compressed = nativeSolveFromJsonUtf8(jsonUtf8);
            if (compressed == null || compressed.length == 0) {
                lastError.set("native returned empty witness bytes");
                return null;
            }
            return Base64.encodeToString(compressed, Base64.NO_WRAP);
        } catch (Throwable t) {
            Log.e(TAG, "solvePayloadJsonToWitnessB64", t);
            String msg = t.getMessage();
            lastError.set(msg != null && !msg.isEmpty() ? msg : t.getClass().getSimpleName());
            return null;
        }
    }
}
