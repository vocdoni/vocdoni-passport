package com.vocdonipassport.mrzscanner;

import android.app.Activity;
import android.content.Intent;
import android.util.Log;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

/**
 * RN module that launches MrzScanActivity and returns the MRZ result.
 */
public class MrzScannerModule extends ReactContextBaseJavaModule {
    private static final String TAG = "MrzScanner";

    public MrzScannerModule(ReactApplicationContext ctx) {
        super(ctx);
    }

    @Override public String getName() { return "MrzScanner"; }

    @ReactMethod
    public void scan(Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity");
            return;
        }

        MrzScanActivity.sCallback = new MrzScanActivity.MrzCallback() {
            @Override
            public void onMrzResult(String docNum, String dob, String expiry) {
                Log.d(TAG, "MRZ parsed doc=" + docNum + " dob=" + dob + " expiry=" + expiry);
                WritableMap r = Arguments.createMap();
                r.putString("documentNumber", docNum);
                r.putString("dateOfBirth", dob);
                r.putString("dateOfExpiry", expiry);
                promise.resolve(r);
                MrzScanActivity.sCallback = null;
            }
            @Override
            public void onMrzError(String error) {
                promise.reject("MRZ_ERROR", error);
                MrzScanActivity.sCallback = null;
            }
        };

        Intent intent = new Intent(activity, MrzScanActivity.class);
        activity.startActivity(intent);
    }
}
