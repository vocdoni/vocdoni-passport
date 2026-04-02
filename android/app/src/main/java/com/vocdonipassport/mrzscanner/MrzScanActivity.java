package com.vocdonipassport.mrzscanner;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.Log;
import android.util.Size;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
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

import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.ArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Full-screen camera Activity for MRZ scanning.
 * Launched via Intent, returns result via static callback.
 */
public class MrzScanActivity extends AppCompatActivity {
    private static final String TAG = "MrzScanActivity";
    private static final int CAMERA_PERM = 100;

    // TD3 passport line 2
    private static final Pattern TD3_L2 = Pattern.compile(
        "([A-Z0-9<]{9})\\d([A-Z<]{3})(\\d{6})\\d[MF<](\\d{6})\\d");
    // TD1 ID card line 1 + line 2
    private static final Pattern TD1_L1 = Pattern.compile(
        "[IAC][A-Z<]([A-Z<]{3})([A-Z0-9<]{9})\\d");
    private static final Pattern TD1_L2 = Pattern.compile(
        "(\\d{6})\\d[MF<](\\d{6})\\d");

    static MrzCallback sCallback;
    private TextRecognizer recognizer;
    private ExecutorService executor;
    private volatile boolean found = false;
    private PreviewView previewView;
    private TextView hintText;
    private final ArrayList<String> acceptedReads = new ArrayList<>();
    private long lastAcceptedAtMs = 0L;
    private static final long SAMPLE_INTERVAL_MS = 450L;
    private static final int REQUIRED_MATCHES = 3;

    public interface MrzCallback {
        void onMrzResult(String docNum, String dob, String expiry);
        void onMrzError(String error);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Build UI programmatically — no XML layout needed
        FrameLayout root = new FrameLayout(this);
        root.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        previewView = new PreviewView(this);
        previewView.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(previewView);

        MrzGuideOverlayView overlay = new MrzGuideOverlayView(this);
        overlay.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        root.addView(overlay);

        hintText = new TextView(this);
        hintText.setText("Align the bottom MRZ lines inside the highlighted band");
        hintText.setTextColor(0xFFFFFFFF);
        hintText.setTextSize(17);
        hintText.setTextAlignment(TextView.TEXT_ALIGNMENT_CENTER);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.gravity = Gravity.BOTTOM;
        lp.setMargins(32, 32, 32, 120);
        hintText.setLayoutParams(lp);
        hintText.setShadowLayer(4, 0, 0, 0xFF000000);
        root.addView(hintText);

        setContentView(root);

        recognizer = TextRecognition.getClient(new TextRecognizerOptions.Builder().build());
        executor = Executors.newSingleThreadExecutor();

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
            if (sCallback != null) sCallback.onMrzError("Camera permission denied");
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
                if (sCallback != null) sCallback.onMrzError("Camera error: " + e.getMessage());
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
        recognizer.process(input)
            .addOnSuccessListener(text -> {
                if (found) return;
                String[] result = tryParseMrz(text.getText());
                if (result != null) {
                    handleRead(result);
                }
            })
            .addOnCompleteListener(task -> proxy.close());
    }

    private void handleRead(String[] result) {
        long now = System.currentTimeMillis();
        if (now - lastAcceptedAtMs < SAMPLE_INTERVAL_MS) {
            return;
        }
        lastAcceptedAtMs = now;

        String fingerprint = result[0] + "|" + result[1] + "|" + result[2];
        acceptedReads.add(fingerprint);
        if (acceptedReads.size() > REQUIRED_MATCHES) {
            acceptedReads.remove(0);
        }

        int count = acceptedReads.size();
        if (count == 1) {
            setHint("MRZ read 1/3. Hold steady.");
            return;
        }

        boolean allMatch = true;
        for (int i = 1; i < acceptedReads.size(); i++) {
            if (!acceptedReads.get(i).equals(acceptedReads.get(0))) {
                allMatch = false;
                break;
            }
        }

        if (!allMatch) {
            acceptedReads.clear();
            setHint("Reads did not match. Adjust the card and try again.");
            return;
        }

        if (count < REQUIRED_MATCHES) {
            setHint("MRZ read " + count + "/3. Keep the card still.");
            return;
        }

        found = true;
        Log.d(TAG, "MRZ confirmed after " + REQUIRED_MATCHES + " reads: " + result[0]);
        if (sCallback != null) sCallback.onMrzResult(result[0], result[1], result[2]);
        finish();
    }

    private void setHint(String text) {
        runOnUiThread(() -> hintText.setText(text));
    }

    private String[] tryParseMrz(String text) {
        String raw = text.replace("«", "<").replace(" ", "").toUpperCase();
        String[] lines = raw.split("\n");

        // TD3
        for (int i = 0; i < lines.length - 1; i++) {
            if (lines[i + 1].length() >= 28) {
                Matcher m = TD3_L2.matcher(lines[i + 1]);
                if (m.find()) {
                    String docNum = m.group(1).replace("<", "");
                    if (docNum.length() >= 2 && m.group(3).matches("\\d{6}") && m.group(4).matches("\\d{6}")) {
                        return new String[]{docNum, m.group(3), m.group(4)};
                    }
                }
            }
        }
        // TD1
        for (int i = 0; i < lines.length - 2; i++) {
            Matcher m1 = TD1_L1.matcher(lines[i]);
            Matcher m2 = TD1_L2.matcher(lines[i + 1]);
            if (m1.find() && m2.find()) {
                String docNum = m1.group(2).replace("<", "");
                if (docNum.length() >= 2) {
                    return new String[]{docNum, m2.group(1), m2.group(2)};
                }
            }
        }
        return null;
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        executor.shutdown();
    }

    private static final class MrzGuideOverlayView extends View {
        private final Paint scrimPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint cardStrokePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint mrzBandPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint linePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private final float cornerRadius;
        private final float strokeWidth;

        MrzGuideOverlayView(Context context) {
            super(context);
            scrimPaint.setColor(0x26000000);

            strokeWidth = dp(context, 3);
            cornerRadius = dp(context, 22);

            cardStrokePaint.setStyle(Paint.Style.STROKE);
            cardStrokePaint.setStrokeWidth(strokeWidth);
            cardStrokePaint.setColor(0xF2FFFFFF);

            mrzBandPaint.setStyle(Paint.Style.FILL);
            mrzBandPaint.setColor(0x35FFFFFF);

            linePaint.setStyle(Paint.Style.STROKE);
            linePaint.setStrokeWidth(dp(context, 2));
            linePaint.setColor(0xE6FFFFFF);

            textPaint.setColor(0xCCFFFFFF);
            textPaint.setTextSize(dp(context, 12));
            textPaint.setFakeBoldText(true);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);

            float width = getWidth();
            float height = getHeight();
            canvas.drawRect(0, 0, width, height, scrimPaint);

            float cardWidth = width * 0.84f;
            float cardHeight = height * 0.40f;
            float left = (width - cardWidth) / 2f;
            float top = height * 0.22f;
            RectF card = new RectF(left, top, left + cardWidth, top + cardHeight);

            canvas.drawRoundRect(card, cornerRadius, cornerRadius, cardStrokePaint);

            float bandHeight = card.height() * 0.28f;
            RectF mrzBand = new RectF(card.left, card.bottom - bandHeight, card.right, card.bottom);
            canvas.drawRoundRect(mrzBand, cornerRadius, cornerRadius, mrzBandPaint);
            canvas.drawRect(card.left, mrzBand.top, card.right, card.bottom - cornerRadius, mrzBandPaint);

            float lineInset = dp(getContext(), 18);
            float lineSpacing = dp(getContext(), 14);
            float firstLineY = mrzBand.top + dp(getContext(), 20);
            for (int row = 0; row < 3; row++) {
                float startX = card.left + lineInset;
                float endX = card.right - lineInset;
                float y = firstLineY + (row * lineSpacing);
                for (int col = 0; col < 11; col++) {
                    float chunkStart = startX + ((endX - startX) / 11f) * col;
                    float chunkEnd = Math.min(endX, chunkStart + ((endX - startX) / 11f) * 0.72f);
                    canvas.drawLine(chunkStart, y, chunkEnd, y, linePaint);
                }
            }

            canvas.drawText("P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<", card.left + lineInset, mrzBand.top - dp(getContext(), 10), textPaint);
        }

        private static float dp(Context context, float value) {
            return TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                value,
                context.getResources().getDisplayMetrics()
            );
        }
    }
}
