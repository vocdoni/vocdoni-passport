package com.vocdonipassport.acvm;

import android.util.Log;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;

/**
 * On-device Noir/ACVM witness (compressed stack) via native Rust {@code libacvm_witness_jni.so}.
 */
public class AcvmWitnessModule extends ReactContextBaseJavaModule {
    private static final String TAG = "AcvmWitness";
    /** Brillig (e.g. RSA-4096) needs a large stack; default ~1 MiB JVM thread stacks often overflow. */
    private static final long WITNESS_THREAD_STACK = 32L * 1024 * 1024;
    private final Object solveLock = new Object();
    private boolean busy;

    public AcvmWitnessModule(ReactApplicationContext ctx) {
        super(ctx);
    }

    @Override
    public String getName() {
        return "AcvmWitness";
    }

    @ReactMethod
    public void solveFromFile(String path, Promise promise) {
        if (!AcvmWitnessNative.isAvailable()) {
            promise.reject(
                    "E_NATIVE_MISSING",
                    "libacvm_witness_jni.so is not loaded. Build crates/acvm-witness-jni from vocdoni-passport-prover and place it under android/app/src/main/jniLibs/<abi>/");
            return;
        }
        synchronized (solveLock) {
            if (busy) {
                promise.reject("E_BUSY", "Another witness solve is in progress");
                return;
            }
            busy = true;
        }
        Thread t = new Thread(null, () -> runSolve(path, promise), "AcvmWitness", WITNESS_THREAD_STACK);
        t.start();
    }

    private void runSolve(String path, Promise promise) {
        try {
            byte[] raw = Files.readAllBytes(Paths.get(path));
            String json = new String(raw, StandardCharsets.UTF_8);
            if (json.isEmpty()) {
                promise.reject("E_READ", "empty witness payload file");
                return;
            }
            String b64 = AcvmWitnessNative.solvePayloadJsonToWitnessB64(json);
            if (b64 == null) {
                String detail = AcvmWitnessNative.getLastErrorMessage();
                promise.reject(
                        "E_ACVM",
                        detail != null && !detail.isEmpty()
                                ? detail
                                : "Native witness solve failed");
                return;
            }
            promise.resolve(b64);
        } catch (Exception e) {
            Log.e(TAG, "solveFromFile", e);
            promise.reject("E_READ", e.getMessage() != null ? e.getMessage() : "read failed", e);
        } finally {
            synchronized (solveLock) {
                busy = false;
            }
        }
    }
}
