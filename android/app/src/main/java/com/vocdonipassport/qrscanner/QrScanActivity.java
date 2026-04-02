package com.vocdonipassport.qrscanner;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.Log;
import android.util.Size;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.OptIn;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ExperimentalGetImage;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class QrScanActivity extends AppCompatActivity {
    private static final String TAG = "QrScanActivity";
    private static final int CAMERA_PERM = 101;

    static QrCallback sCallback;
    private PreviewView previewView;
    private ExecutorService executor;
    private BarcodeScanner scanner;
    private volatile boolean found = false;

    public interface QrCallback {
        void onQrResult(String payload);
        void onQrError(String error);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        previewView = new PreviewView(this);
        previewView.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(previewView);

        TextView hint = new TextView(this);
        hint.setText("Point camera at the server QR code");
        hint.setTextColor(0xFFFFFFFF);
        hint.setTextSize(18);
        hint.setTextAlignment(TextView.TEXT_ALIGNMENT_CENTER);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.gravity = android.view.Gravity.BOTTOM;
        lp.setMargins(32, 32, 32, 120);
        hint.setLayoutParams(lp);
        hint.setShadowLayer(4, 0, 0, 0xFF000000);
        root.addView(hint);

        setContentView(root);

        executor = Executors.newSingleThreadExecutor();
        scanner = BarcodeScanning.getClient(new BarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .build());

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED) {
            startCamera();
        } else {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.CAMERA}, CAMERA_PERM);
        }
    }

    @Override
    public void onRequestPermissionsResult(int req, @NonNull String[] perms, @NonNull int[] grants) {
        super.onRequestPermissionsResult(req, perms, grants);
        if (req == CAMERA_PERM && grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED) {
            startCamera();
        } else {
            if (sCallback != null) sCallback.onQrError("Camera permission denied");
            finish();
        }
    }

    private void startCamera() {
        ProcessCameraProvider.getInstance(this).addListener(() -> {
            try {
                ProcessCameraProvider cp = ProcessCameraProvider.getInstance(this).get();
                cp.unbindAll();

                Preview preview = new Preview.Builder().build();
                preview.setSurfaceProvider(previewView.getSurfaceProvider());

                ImageAnalysis analysis = new ImageAnalysis.Builder()
                    .setTargetResolution(new Size(1280, 720))
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build();
                analysis.setAnalyzer(executor, this::analyzeFrame);

                cp.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis);
                Log.d(TAG, "Camera started");
            } catch (Exception e) {
                Log.e(TAG, "Camera failed", e);
                if (sCallback != null) sCallback.onQrError("Camera error: " + e.getMessage());
                finish();
            }
        }, ContextCompat.getMainExecutor(this));
    }

    @OptIn(markerClass = ExperimentalGetImage.class)
    private void analyzeFrame(ImageProxy proxy) {
        if (found) { proxy.close(); return; }
        android.media.Image img = proxy.getImage();
        if (img == null) { proxy.close(); return; }
        InputImage input = InputImage.fromMediaImage(img, proxy.getImageInfo().getRotationDegrees());
        scanner.process(input)
            .addOnSuccessListener(barcodes -> {
                if (found) return;
                for (Barcode barcode : barcodes) {
                    String value = barcode.getRawValue();
                    if (value != null && !value.isEmpty()) {
                        found = true;
                        Log.d(TAG, "QR found");
                        if (sCallback != null) sCallback.onQrResult(value);
                        finish();
                        break;
                    }
                }
            })
            .addOnFailureListener(e -> Log.e(TAG, "QR scan failed", e))
            .addOnCompleteListener(task -> proxy.close());
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (scanner != null) scanner.close();
        if (executor != null) executor.shutdown();
    }
}
