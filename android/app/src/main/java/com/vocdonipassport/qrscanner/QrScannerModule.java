package com.vocdonipassport.qrscanner;

import android.app.Activity;
import android.content.Intent;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

public class QrScannerModule extends ReactContextBaseJavaModule {
    public QrScannerModule(ReactApplicationContext ctx) {
        super(ctx);
    }

    @Override public String getName() { return "ServerQrScanner"; }

    @ReactMethod
    public void scan(Promise promise) {
        Activity activity = getCurrentActivity();
        if (activity == null) {
            promise.reject("NO_ACTIVITY", "No activity");
            return;
        }

        QrScanActivity.sCallback = new QrScanActivity.QrCallback() {
            @Override
            public void onQrResult(String payload) {
                WritableMap r = Arguments.createMap();
                r.putString("payload", payload);
                promise.resolve(r);
                QrScanActivity.sCallback = null;
            }
            @Override
            public void onQrError(String error) {
                promise.reject("QR_ERROR", error);
                QrScanActivity.sCallback = null;
            }
        };

        Intent intent = new Intent(activity, QrScanActivity.class);
        activity.startActivity(intent);
    }
}
