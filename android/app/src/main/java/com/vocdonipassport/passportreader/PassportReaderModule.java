package com.vocdonipassport.passportreader;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.IsoDep;
import android.util.Base64;
import android.util.Log;

import com.facebook.react.bridge.ActivityEventListener;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

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
import java.io.InputStream;
import java.io.IOException;
import java.security.Security;
import java.util.Collection;
import java.util.List;
import java.util.ArrayList;

/**
 * NFC passport/ID reader using JMRTD.
 * Reads raw DG1 + SOD bytes for zkSNARK circuit input.
 */
public class PassportReaderModule extends ReactContextBaseJavaModule
        implements ActivityEventListener, LifecycleEventListener {

    private static final String TAG = "PassportReader";
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

    @ReactMethod
    public void scan(ReadableMap opts, Promise promise) {
        this.scanSessionId += 1;
        this.scanPromise = promise;
        this.documentNumber = opts.getString("documentNumber");
        this.dateOfBirth = opts.getString("dateOfBirth");
        this.dateOfExpiry = opts.getString("dateOfExpiry");
        Log.d(TAG, "scan() BAC inputs doc=" + this.documentNumber + " dob=" + this.dateOfBirth + " expiry=" + this.dateOfExpiry);
        this.keepWaitingForRetap = false;
        this.readPhase = "waiting_for_tag";
        this.phaseStartMs = System.currentTimeMillis();

        Activity activity = getCurrentActivity();
        if (activity == null) { promise.reject("NO_ACTIVITY", "No activity"); return; }

        nfcAdapter = NfcAdapter.getDefaultAdapter(getReactApplicationContext());
        if (nfcAdapter == null) { promise.reject("NO_NFC", "NFC not available"); return; }
        if (!nfcAdapter.isEnabled()) { promise.reject("NFC_OFF", "Enable NFC in Settings"); return; }

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
        keepWaitingForRetap = false;
        new Thread(() -> {
            try {
                readPassport(tag, sessionToken);
            } catch (Exception e) {
                if (!isActiveSession(sessionToken)) return;
                Log.e(TAG, "Read failed", e);
                if (shouldAutoRetry(e)) {
                    keepWaitingForRetap = true;
                    Log.w(TAG, "NFC lost during " + readPhase + ", waiting for re-tap...");
                    enableForeground();
                } else if (scanPromise != null) {
                    scanPromise.reject("READ_ERROR", e.getMessage(), e);
                    scanPromise = null;
                }
            } finally {
                if (isActiveSession(sessionToken) && !keepWaitingForRetap) disableForeground();
            }
        }).start();
    }

    private boolean isActiveSession(int sessionToken) {
        return scanPromise != null && sessionToken == scanSessionId;
    }

    private void readPassport(Tag tag, int sessionToken) throws Exception {
        if (!isActiveSession(sessionToken)) return;
        IsoDep isoDep = IsoDep.get(tag);
        if (isoDep == null) {
            if (isActiveSession(sessionToken)) {
                scanPromise.reject("NOT_ISODEP", "Not an NFC-B/ISO14443-4 tag");
                scanPromise = null;
            }
            return;
        }
        activeIsoDep = isoDep;
        isoDep.setTimeout(8000);

        CardService cardService = CardService.getInstance(isoDep);
        PassportService service = null;
        try {
            if (!isActiveSession(sessionToken)) return;
            cardService.open();

            service = new PassportService(
                cardService,
                PassportService.NORMAL_MAX_TRANCEIVE_LENGTH,
                PassportService.DEFAULT_MAX_BLOCKSIZE,
                true,   // shouldCheckMAC
                false); // sscIsMostSignificant
            service.open();
            if (!isActiveSession(sessionToken)) return;

            // Step 1: Select the eMRTD applet
            setPhase("select_applet");
            Log.d(TAG, "Selecting eMRTD applet...");
            service.sendSelectApplet(false);
            Log.d(TAG, "eMRTD applet selected");

        BACKeySpec bacKey = new BACKey(documentNumber, dateOfBirth, dateOfExpiry);

        // Step 2: Try PACE first, then fall back to BAC
        boolean authenticated = false;

        // Try PACE
        try {
            setPhase("pace");
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
            }
        } catch (Exception e) {
            Log.w(TAG, "PACE failed: " + e.getMessage());
        }

        // Fall back to BAC
        if (!authenticated) {
            setPhase("bac");
            Log.d(TAG, "Trying BAC...");
            service.doBAC(bacKey);
            authenticated = true;
            Log.d(TAG, "BAC OK");
        }

        // Step 3: Read DG1
        setPhase("read_dg1");
        Log.d(TAG, "Reading DG1...");
        byte[] dg1 = readFile(service, PassportService.EF_DG1);
        Log.d(TAG, "DG1: " + dg1.length + " bytes");

        // Step 4: Read SOD
        setPhase("read_sod");
        Log.d(TAG, "Reading SOD...");
        byte[] sod = readFile(service, PassportService.EF_SOD);
        Log.d(TAG, "SOD: " + sod.length + " bytes");

        // Extract MRZ for display
        String mrz = "";
        if (dg1.length > 5) {
            mrz = new String(dg1, 5, dg1.length - 5, "US-ASCII").trim();
        }

        WritableMap result = Arguments.createMap();
        result.putString("dg1", Base64.encodeToString(dg1, Base64.NO_WRAP));
        result.putString("sod", Base64.encodeToString(sod, Base64.NO_WRAP));
        result.putInt("dg1Length", dg1.length);
        result.putInt("sodLength", sod.length);
        result.putString("mrz", mrz);

        Log.d(TAG, "Read complete: DG1=" + dg1.length + " SOD=" + sod.length);
        // Debug: log first 30 bytes of SOD in hex
        StringBuilder hexSod = new StringBuilder();
        for (int i = 0; i < Math.min(sod.length, 30); i++) hexSod.append(String.format("%02x", sod[i] & 0xff));
        Log.d(TAG, "SOD first 30 bytes: " + hexSod.toString());
        if (isActiveSession(sessionToken)) {
            scanPromise.resolve(result);
            scanPromise = null;
            readPhase = "done";
            keepWaitingForRetap = false;
        }
        } finally {
            activeIsoDep = null;
            try { if (service != null) service.close(); } catch (Exception ignored) {}
            try { cardService.close(); } catch (Exception ignored) {}
            try { isoDep.close(); } catch (Exception ignored) {}
        }
    }

    private byte[] readFile(PassportService service, short fid) throws Exception {
        String name = fid == PassportService.EF_DG1 ? "DG1" : fid == PassportService.EF_SOD ? "SOD" : String.format("0x%04x", fid & 0xffff);
        CardFileInputStream in = service.getInputStream(fid);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[256];
        int len;
        int total = 0;
        long lastLog = System.currentTimeMillis();
        try {
            while ((len = in.read(buf)) > 0) {
                out.write(buf, 0, len);
                total += len;
                long now = System.currentTimeMillis();
                if (total <= 512 || now - lastLog >= 1000) {
                    Log.d(TAG, "Reading " + name + "... " + total + " bytes");
                    lastLog = now;
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
            PendingIntent pi = PendingIntent.getActivity(activity, 0,
                new Intent(activity, activity.getClass()).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_MUTABLE);
            nfcAdapter.enableForegroundDispatch(activity, pi, null, null);
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
        long elapsed = System.currentTimeMillis() - phaseStartMs;
        boolean tagLost = message.contains("out of date") || message.contains("Read binary failed") || message.contains("Tag (");
        boolean retryablePhase = "read_dg1".equals(readPhase) || "read_sod".equals(readPhase);
        if (tagLost && retryablePhase) {
            Log.w(TAG, "Auto-retry NFC after phase=" + readPhase + " elapsedMs=" + elapsed + " msg=" + message);
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
