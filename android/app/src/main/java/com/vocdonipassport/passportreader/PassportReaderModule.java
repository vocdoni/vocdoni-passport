package com.vocdonipassport.passportreader;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.IsoDep;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Base64;
import android.util.Log;
import android.content.Context;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import net.sf.scuba.smartcards.CardService;
import net.sf.scuba.smartcards.CardFileInputStream;
import org.jmrtd.BACKey;
import org.jmrtd.BACKeySpec;
import org.jmrtd.PACEKeySpec;
import org.jmrtd.PassportService;
import org.jmrtd.lds.PACEInfo;
import org.jmrtd.lds.SecurityInfo;
import org.jmrtd.lds.CardAccessFile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.security.Security;
import java.util.Collection;
import java.util.List;
import java.util.ArrayList;

/**
 * NFC passport/ID reader using JMRTD.
 * Reads raw DG1 + SOD bytes for zkSNARK circuit input.
 * 
 * Best practices implemented:
 * - Extended timeout (15s) for reliable reading
 * - Progress events for UI feedback
 * - Haptic feedback on tag detection
 * - Auto-retry on tag loss during data reading
 * - Detailed error messages for troubleshooting
 */
public class PassportReaderModule extends ReactContextBaseJavaModule
        implements ActivityEventListener, LifecycleEventListener {

    private static final String TAG = "PassportReader";
    private static final int NFC_TIMEOUT_MS = 15000;
    private static final int MAX_AUTO_RETRIES = 3;
    
    private NfcAdapter nfcAdapter;
    private Promise scanPromise;
    private String documentNumber;
    private String dateOfBirth;
    private String dateOfExpiry;
    private volatile boolean keepWaitingForRetap = false;
    private volatile String readPhase = "idle";
    private volatile long phaseStartMs = 0L;
    private volatile int scanSessionId = 0;
    private volatile IsoDep activeIsoDep = null;
    private volatile int autoRetryCount = 0;
    private volatile boolean readAllDataGroups = false;

    public PassportReaderModule(ReactApplicationContext reactContext) {
        super(reactContext);
        reactContext.addActivityEventListener(this);
        reactContext.addLifecycleEventListener(this);
        try {
            Security.insertProviderAt(
                new org.spongycastle.jce.provider.BouncyCastleProvider(), 1);
        } catch (Exception e) {
            Log.w(TAG, "BouncyCastle: " + e.getMessage());
        }
    }

    @Override
    public String getName() { return "PassportReader"; }

    private void sendProgressEvent(String step, int percent, String message) {
        WritableMap params = Arguments.createMap();
        params.putString("step", step);
        params.putInt("percent", percent);
        params.putString("message", message);
        
        try {
            getReactApplicationContext()
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("NfcProgress", params);
        } catch (Exception e) {
            Log.w(TAG, "Failed to send progress event: " + e.getMessage());
        }
    }

    private void vibrateOnTagDetected() {
        try {
            Context context = getReactApplicationContext();
            Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createOneShot(100, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    vibrator.vibrate(100);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Vibration failed: " + e.getMessage());
        }
    }

    private void vibrateOnSuccess() {
        try {
            Context context = getReactApplicationContext();
            Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    long[] pattern = {0, 100, 50, 100};
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1));
                } else {
                    long[] pattern = {0, 100, 50, 100};
                    vibrator.vibrate(pattern, -1);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Vibration failed: " + e.getMessage());
        }
    }

    @ReactMethod
    public void scan(ReadableMap opts, Promise promise) {
        doScan(opts, promise, false);
    }

    @ReactMethod
    public void scanAll(ReadableMap opts, Promise promise) {
        doScan(opts, promise, true);
    }

    private void doScan(ReadableMap opts, Promise promise, boolean readAll) {
        this.scanSessionId += 1;
        this.scanPromise = promise;
        this.documentNumber = opts.getString("documentNumber");
        this.dateOfBirth = opts.getString("dateOfBirth");
        this.dateOfExpiry = opts.getString("dateOfExpiry");
        this.autoRetryCount = 0;
        this.readAllDataGroups = readAll;
        Log.d(TAG, "scan() BAC inputs doc=" + this.documentNumber + " dob=" + this.dateOfBirth + " expiry=" + this.dateOfExpiry + " readAll=" + readAll);
        this.keepWaitingForRetap = false;
        this.readPhase = "waiting_for_tag";
        this.phaseStartMs = System.currentTimeMillis();

        Activity activity = getCurrentActivity();
        if (activity == null) { promise.reject("NO_ACTIVITY", "No activity"); return; }

        nfcAdapter = NfcAdapter.getDefaultAdapter(getReactApplicationContext());
        if (nfcAdapter == null) { promise.reject("NO_NFC", "NFC not available on this device"); return; }
        if (!nfcAdapter.isEnabled()) { promise.reject("NFC_OFF", "NFC is disabled. Please enable NFC in your phone settings."); return; }

        sendProgressEvent("waiting", 0, "Hold your phone against the document");
        enableForeground();
    }

    @ReactMethod
    public void cancelCurrentScan(Promise promise) {
        this.scanSessionId += 1;
        this.keepWaitingForRetap = false;
        this.readPhase = "cancelled";

        Promise pending = this.scanPromise;
        this.scanPromise = null;

        disableForeground();

        IsoDep isoDep = activeIsoDep;
        activeIsoDep = null;
        if (isoDep != null) {
            try {
                isoDep.close();
            } catch (IOException ignored) {}
        }

        if (pending != null) {
            pending.reject("CANCELLED", "Scan cancelled");
        }
        promise.resolve(null);
    }

    @Override
    public void onNewIntent(Intent intent) {
        if (scanPromise == null) return;
        final int sessionToken = scanSessionId;
        Tag tag = intent.getParcelableExtra(NfcAdapter.EXTRA_TAG);
        if (tag == null) return;
        
        vibrateOnTagDetected();
        keepWaitingForRetap = false;
        sendProgressEvent("connecting", 5, "Document detected, connecting...");
        
        new Thread(() -> {
            try {
                readPassport(tag, sessionToken);
            } catch (Exception e) {
                if (!isActiveSession(sessionToken)) return;
                Log.e(TAG, "Read failed at phase " + readPhase, e);
                
                if (shouldAutoRetry(e) && autoRetryCount < MAX_AUTO_RETRIES) {
                    autoRetryCount++;
                    keepWaitingForRetap = true;
                    String retryMsg = "Connection lost. Keep phone still, attempt " + autoRetryCount + "/" + MAX_AUTO_RETRIES;
                    Log.w(TAG, retryMsg);
                    sendProgressEvent("retry", 0, retryMsg);
                    enableForeground();
                } else if (scanPromise != null) {
                    String errorMsg = getDetailedErrorMessage(e);
                    scanPromise.reject("READ_ERROR", errorMsg, e);
                    scanPromise = null;
                }
            } finally {
                if (isActiveSession(sessionToken) && !keepWaitingForRetap) disableForeground();
            }
        }).start();
    }

    private String getDetailedErrorMessage(Exception e) {
        String message = e.getMessage() != null ? e.getMessage() : "Unknown error";
        
        if (message.contains("BAC failed") || message.contains("MUTUAL AUTH")) {
            return "Authentication failed. The document number, birth date, or expiry date may be incorrect. Please verify the MRZ data and try again.";
        } else if (message.contains("Tag was lost") || message.contains("transceive") || message.contains("out of date")) {
            return "Connection lost during reading. Please hold your phone steady against the document and don't move until the scan completes.";
        } else if (message.contains("PACE failed")) {
            return "Secure connection failed. Please ensure the document is positioned correctly and try again.";
        } else if (message.contains("timeout") || message.contains("Timeout")) {
            return "The scan timed out. Please ensure the NFC chip is directly under your phone's NFC reader and try again.";
        } else if (message.contains("NOT_ISODEP") || message.contains("ISO14443")) {
            return "This document doesn't appear to have a compatible NFC chip. Please ensure you're scanning a biometric passport or ID card.";
        }
        
        return "NFC read failed: " + message + ". Please try again, keeping your phone steady on the document.";
    }

    private boolean isActiveSession(int sessionToken) {
        return scanPromise != null && sessionToken == scanSessionId;
    }

    private void readPassport(Tag tag, int sessionToken) throws Exception {
        if (!isActiveSession(sessionToken)) return;
        IsoDep isoDep = IsoDep.get(tag);
        if (isoDep == null) {
            if (isActiveSession(sessionToken)) {
                scanPromise.reject("NOT_ISODEP", "This tag is not compatible. Please use a biometric passport or ID card with NFC chip.");
                scanPromise = null;
            }
            return;
        }
        activeIsoDep = isoDep;
        isoDep.setTimeout(NFC_TIMEOUT_MS);

        CardService cardService = CardService.getInstance(isoDep);
        PassportService service = null;
        try {
            if (!isActiveSession(sessionToken)) return;
            cardService.open();

            service = new PassportService(
                cardService,
                PassportService.NORMAL_MAX_TRANCEIVE_LENGTH,
                PassportService.DEFAULT_MAX_BLOCKSIZE,
                true,
                false);
            service.open();
            if (!isActiveSession(sessionToken)) return;

            setPhase("select_applet");
            sendProgressEvent("selecting", 10, "Selecting passport application...");
            Log.d(TAG, "Selecting eMRTD applet...");
            service.sendSelectApplet(false);
            Log.d(TAG, "eMRTD applet selected");

            BACKeySpec bacKey = new BACKey(documentNumber, dateOfBirth, dateOfExpiry);
            boolean authenticated = false;

            // Try PACE first (more secure, faster)
            try {
                setPhase("pace");
                sendProgressEvent("authenticating", 15, "Establishing secure connection (PACE)...");
                Log.d(TAG, "Trying PACE...");
                CardAccessFile caf = new CardAccessFile(
                    service.getInputStream(PassportService.EF_CARD_ACCESS));
                Collection<SecurityInfo> secInfos = caf.getSecurityInfos();
                List<PACEInfo> paceInfos = new ArrayList<>();
                for (SecurityInfo si : secInfos) {
                    if (si instanceof PACEInfo) paceInfos.add((PACEInfo) si);
                }
                if (!paceInfos.isEmpty()) {
                    PACEInfo pi = paceInfos.get(0);
                    PACEKeySpec paceKey = PACEKeySpec.createMRZKey(bacKey);
                    service.doPACE(paceKey, pi.getObjectIdentifier(),
                        PACEInfo.toParameterSpec(pi.getParameterId()),
                        pi.getParameterId());
                    authenticated = true;
                    Log.d(TAG, "PACE OK");
                    sendProgressEvent("authenticated", 25, "Secure connection established");
                }
            } catch (Exception e) {
                Log.w(TAG, "PACE not available or failed: " + e.getMessage());
            }

            // Fall back to BAC (Basic Access Control)
            if (!authenticated) {
                setPhase("bac");
                sendProgressEvent("authenticating", 15, "Authenticating with document (BAC)...");
                Log.d(TAG, "Trying BAC...");
                service.doBAC(bacKey);
                authenticated = true;
                Log.d(TAG, "BAC OK");
                sendProgressEvent("authenticated", 25, "Authentication successful");
            }

            // Read DG1 (MRZ data)
            setPhase("read_dg1");
            sendProgressEvent("reading_dg1", 40, "Reading personal data...");
            Log.d(TAG, "Reading DG1...");
            byte[] dg1 = readFileWithProgress(service, PassportService.EF_DG1, "DG1", 40, 55);
            Log.d(TAG, "DG1: " + dg1.length + " bytes");

            // Read SOD (Security Object)
            setPhase("read_sod");
            sendProgressEvent("reading_sod", 60, "Reading security data...");
            Log.d(TAG, "Reading SOD...");
            byte[] sod = readFileWithProgress(service, PassportService.EF_SOD, "SOD", 60, 90);
            Log.d(TAG, "SOD: " + sod.length + " bytes");

            // Try to read DG2 (photo) - optional
            byte[] dg2 = null;
            try {
                setPhase("read_dg2");
                sendProgressEvent("reading_photo", 92, "Reading photo (optional)...");
                dg2 = readFileWithProgress(service, PassportService.EF_DG2, "DG2", 92, 98);
                Log.d(TAG, "DG2: " + dg2.length + " bytes");
            } catch (Exception e) {
                Log.w(TAG, "DG2 (photo) not available: " + e.getMessage());
            }

            // Additional data groups for explore mode
            byte[] dg7 = null;  // Signature/mark
            byte[] dg11 = null; // Additional personal details
            byte[] dg12 = null; // Additional document details
            byte[] dg13 = null; // Optional details
            byte[] dg14 = null; // Security options
            byte[] dg15 = null; // Active Authentication public key
            
            if (readAllDataGroups) {
                // DG7 - Displayed signature or mark
                try {
                    setPhase("read_dg7");
                    sendProgressEvent("reading_dg7", 93, "Reading signature (optional)...");
                    dg7 = readFileWithProgress(service, PassportService.EF_DG7, "DG7", 93, 94);
                    Log.d(TAG, "DG7: " + dg7.length + " bytes");
                } catch (Exception e) {
                    Log.w(TAG, "DG7 not available: " + e.getMessage());
                }
                
                // DG11 - Additional personal details
                try {
                    setPhase("read_dg11");
                    sendProgressEvent("reading_dg11", 94, "Reading additional personal details...");
                    dg11 = readFileWithProgress(service, PassportService.EF_DG11, "DG11", 94, 95);
                    Log.d(TAG, "DG11: " + dg11.length + " bytes");
                } catch (Exception e) {
                    Log.w(TAG, "DG11 not available: " + e.getMessage());
                }
                
                // DG12 - Additional document details
                try {
                    setPhase("read_dg12");
                    sendProgressEvent("reading_dg12", 95, "Reading additional document details...");
                    dg12 = readFileWithProgress(service, PassportService.EF_DG12, "DG12", 95, 96);
                    Log.d(TAG, "DG12: " + dg12.length + " bytes");
                } catch (Exception e) {
                    Log.w(TAG, "DG12 not available: " + e.getMessage());
                }
                
                // DG13 - Optional details
                try {
                    setPhase("read_dg13");
                    sendProgressEvent("reading_dg13", 96, "Reading optional details...");
                    dg13 = readFileWithProgress(service, PassportService.EF_DG13, "DG13", 96, 97);
                    Log.d(TAG, "DG13: " + dg13.length + " bytes");
                } catch (Exception e) {
                    Log.w(TAG, "DG13 not available: " + e.getMessage());
                }
                
                // DG14 - Security options (PACE, Chip Auth info)
                try {
                    setPhase("read_dg14");
                    sendProgressEvent("reading_dg14", 97, "Reading security options...");
                    dg14 = readFileWithProgress(service, PassportService.EF_DG14, "DG14", 97, 98);
                    Log.d(TAG, "DG14: " + dg14.length + " bytes");
                } catch (Exception e) {
                    Log.w(TAG, "DG14 not available: " + e.getMessage());
                }
                
                // DG15 - Active Authentication public key
                try {
                    setPhase("read_dg15");
                    sendProgressEvent("reading_dg15", 98, "Reading AA public key...");
                    dg15 = readFileWithProgress(service, PassportService.EF_DG15, "DG15", 98, 99);
                    Log.d(TAG, "DG15: " + dg15.length + " bytes");
                } catch (Exception e) {
                    Log.w(TAG, "DG15 not available: " + e.getMessage());
                }
            }

            // Extract MRZ for display
            String mrz = "";
            if (dg1.length > 5) {
                mrz = new String(dg1, 5, dg1.length - 5, "US-ASCII").trim();
            }

            sendProgressEvent("complete", 100, "Scan complete!");
            vibrateOnSuccess();

            WritableMap result = Arguments.createMap();
            result.putString("dg1", Base64.encodeToString(dg1, Base64.NO_WRAP));
            result.putString("sod", Base64.encodeToString(sod, Base64.NO_WRAP));
            if (dg2 != null) {
                result.putString("dg2", Base64.encodeToString(dg2, Base64.NO_WRAP));
            }
            if (dg7 != null) {
                result.putString("dg7", Base64.encodeToString(dg7, Base64.NO_WRAP));
            }
            if (dg11 != null) {
                result.putString("dg11", Base64.encodeToString(dg11, Base64.NO_WRAP));
            }
            if (dg12 != null) {
                result.putString("dg12", Base64.encodeToString(dg12, Base64.NO_WRAP));
            }
            if (dg13 != null) {
                result.putString("dg13", Base64.encodeToString(dg13, Base64.NO_WRAP));
            }
            if (dg14 != null) {
                result.putString("dg14", Base64.encodeToString(dg14, Base64.NO_WRAP));
            }
            if (dg15 != null) {
                result.putString("dg15", Base64.encodeToString(dg15, Base64.NO_WRAP));
            }
            result.putInt("dg1Length", dg1.length);
            result.putInt("sodLength", sod.length);
            result.putString("mrz", mrz);
            result.putBoolean("fullScan", readAllDataGroups);

            Log.d(TAG, "Read complete: DG1=" + dg1.length + " SOD=" + sod.length);
            
            if (isActiveSession(sessionToken)) {
                scanPromise.resolve(result);
                scanPromise = null;
                readPhase = "done";
                keepWaitingForRetap = false;
                autoRetryCount = 0;
            }
        } finally {
            activeIsoDep = null;
            try { if (service != null) service.close(); } catch (Exception ignored) {}
            try { cardService.close(); } catch (Exception ignored) {}
            try { isoDep.close(); } catch (Exception ignored) {}
        }
    }

    private byte[] readFileWithProgress(PassportService service, short fid, String name, int startPercent, int endPercent) throws Exception {
        CardFileInputStream in = service.getInputStream(fid);
        int fileLength = in.getLength();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[256];
        int len;
        int total = 0;
        long lastProgressUpdate = System.currentTimeMillis();
        
        try {
            while ((len = in.read(buf)) > 0) {
                out.write(buf, 0, len);
                total += len;
                
                long now = System.currentTimeMillis();
                if (now - lastProgressUpdate >= 200) {
                    int progress = startPercent;
                    if (fileLength > 0) {
                        progress = startPercent + (int)((endPercent - startPercent) * ((float)total / fileLength));
                    }
                    String msg = "Reading " + name + "... " + (total / 1024) + " KB";
                    sendProgressEvent("reading_" + name.toLowerCase(), progress, msg);
                    lastProgressUpdate = now;
                }
            }
            Log.d(TAG, name + " read finished: " + total + " bytes");
            return out.toByteArray();
        } catch (Exception e) {
            throw new Exception("Failed reading " + name + " after " + total + " bytes: " + e.getMessage(), e);
        }
    }

    private void enableForeground() {
        try {
            Activity activity = getCurrentActivity();
            if (activity == null || nfcAdapter == null) return;
            
            Intent intent = new Intent(activity, activity.getClass());
            intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            
            PendingIntent pi = PendingIntent.getActivity(
                activity, 0, intent,
                PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            
            String[][] techList = new String[][] {
                new String[] { IsoDep.class.getName() }
            };
            
            nfcAdapter.enableForegroundDispatch(activity, pi, null, techList);
            Log.d(TAG, "Waiting for passport NFC tag...");
        } catch (Exception e) {
            Log.w(TAG, "enableForeground failed: " + e.getMessage());
        }
    }

    private void disableForeground() {
        try {
            Activity activity = getCurrentActivity();
            if (activity != null && nfcAdapter != null) {
                nfcAdapter.disableForegroundDispatch(activity);
            }
        } catch (Exception e) { /* ignore */ }
    }

    private void setPhase(String phase) {
        readPhase = phase;
        phaseStartMs = System.currentTimeMillis();
    }

    private boolean shouldAutoRetry(Throwable error) {
        String message = error != null && error.getMessage() != null ? error.getMessage() : "";
        Throwable cause = error != null ? error.getCause() : null;
        while (cause != null) {
            if (cause.getMessage() != null) message += " | " + cause.getMessage();
            if (cause instanceof java.lang.SecurityException && message.contains("out of date")) break;
            cause = cause.getCause();
        }
        
        boolean tagLost = message.contains("out of date") || 
                          message.contains("Read binary failed") || 
                          message.contains("Tag (") ||
                          message.contains("transceive failed") ||
                          message.contains("Tag was lost");
                          
        boolean retryablePhase = "read_dg1".equals(readPhase) || 
                                  "read_sod".equals(readPhase) || 
                                  "read_dg2".equals(readPhase) ||
                                  "pace".equals(readPhase) ||
                                  "bac".equals(readPhase);
                                  
        if (tagLost && retryablePhase) {
            Log.w(TAG, "Auto-retry NFC after phase=" + readPhase + " attempt=" + autoRetryCount + " msg=" + message);
            return true;
        }
        return false;
    }

    @Override public void onActivityResult(Activity a, int q, int r, Intent d) {}

    @Override
    public void onHostResume() {
        Activity activity = getCurrentActivity();
        if (activity != null && nfcAdapter != null && scanPromise != null) {
            enableForeground();
        }
    }

    @Override
    public void onHostPause() { disableForeground(); }

    @Override public void onHostDestroy() {}
}
