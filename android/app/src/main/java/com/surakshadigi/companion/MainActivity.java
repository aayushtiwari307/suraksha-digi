package com.surakshadigi.companion;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipboardManager;
import android.content.ClipData;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int SMS_PERMISSION_REQUEST = 501;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final SimpleDateFormat timeFormat = new SimpleDateFormat("HH:mm:ss", Locale.getDefault());

    private TextView statusText;
    private TextView statusDetail;
    private TextView permissionText;
    private TextView deviceIdText;
    private TextView logText;
    private EditText serverInput;
    private EditText codeInput;
    private ProgressBar progressBar;
    private Button pairButton;
    private Button retryButton;
    private Button unpairButton;
    private Button permissionButton;
    private Handler handler;
    private long transientStatusUntil = 0L;

    private final Runnable statusRefresh = new Runnable() {
        @Override public void run() {
            refreshStatus();
            if (handler != null) handler.postDelayed(this, 10000);
        }
    };

    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handler = new Handler(getMainLooper());
        buildUi();
        log("App opened");
        requestSmsPermissionIfNeeded(true);
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Color.rgb(246, 248, 252));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(24), dp(20), dp(28));

        TextView title = text("SurakshaDigi", 28, true, Color.rgb(15, 23, 42));
        root.addView(title);
        TextView subtitle = text("Companion for safe transaction monitoring", 14, false, Color.rgb(71, 85, 105));
        root.addView(subtitle, lp(0, 4, 0, 18));

        LinearLayout statusCard = card();
        LinearLayout statusTop = new LinearLayout(this);
        statusTop.setGravity(Gravity.CENTER_VERTICAL);
        TextView dot = text("●", 18, true, Color.rgb(22, 163, 74));
        statusTop.addView(dot, new LinearLayout.LayoutParams(dp(28), dp(28)));
        LinearLayout statusCopy = new LinearLayout(this);
        statusCopy.setOrientation(LinearLayout.VERTICAL);
        statusText = text("Status: checking…", 16, true, Color.rgb(15, 23, 42));
        statusDetail = text("Checking pairing and queued events", 12, false, Color.rgb(100, 116, 139));
        statusCopy.addView(statusText);
        statusCopy.addView(statusDetail, lp(0, 2, 0, 0));
        statusTop.addView(statusCopy, new LinearLayout.LayoutParams(0, -2, 1));
        progressBar = new ProgressBar(this);
        progressBar.setVisibility(View.GONE);
        statusTop.addView(progressBar, new LinearLayout.LayoutParams(dp(28), dp(28)));
        statusCard.addView(statusTop);
        root.addView(statusCard, lp(0, 0, 0, 16));

        root.addView(sectionTitle("Connection"), lp(0, 0, 0, 8));
        LinearLayout connectionCard = card();
        serverInput = new EditText(this);
        serverInput.setHint("https://your-backend.onrender.com/api");
        serverInput.setText(AppPrefs.getServerUrl(this));
        serverInput.setSingleLine(true);
        serverInput.setTextSize(14);
        serverInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        connectionCard.addView(text("Backend API URL", 12, true, Color.rgb(51, 65, 85)));
        connectionCard.addView(serverInput, lp(0, 6, 0, 4));
        TextView helper = text("HTTPS is required. The app automatically uses the /api prefix.", 11, false, Color.rgb(100, 116, 139));
        connectionCard.addView(helper);
        root.addView(connectionCard, lp(0, 0, 0, 16));

        root.addView(sectionTitle("Device"), lp(0, 0, 0, 8));
        LinearLayout deviceCard = card();
        deviceIdText = text("Device ID: " + AppPrefs.getOrCreateDeviceId(this), 12, false, Color.rgb(51, 65, 85));
        deviceIdText.setTextIsSelectable(true);
        deviceCard.addView(deviceIdText);
        Button copyId = secondaryButton("Copy device ID");
        copyId.setOnClickListener(v -> copyDeviceId());
        deviceCard.addView(copyId, lp(0, 10, 0, 0));
        root.addView(deviceCard, lp(0, 0, 0, 16));

        root.addView(sectionTitle("Pair this phone"), lp(0, 0, 0, 8));
        LinearLayout pairCard = card();
        codeInput = new EditText(this);
        codeInput.setHint("12-character pairing code");
        codeInput.setSingleLine(true);
        codeInput.setAllCaps(true);
        codeInput.setTextSize(17);
        codeInput.setTypeface(Typeface.DEFAULT_BOLD);
        codeInput.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS);
        pairCard.addView(codeInput, lp(0, 0, 0, 8));
        pairButton = primaryButton("Pair Android device");
        pairButton.setOnClickListener(v -> pair());
        pairCard.addView(pairButton, lp(0, 0, 0, 0));
        root.addView(pairCard, lp(0, 0, 0, 16));

        root.addView(sectionTitle("Actions"), lp(0, 0, 0, 8));
        LinearLayout actions = card();
        retryButton = secondaryButton("Retry pending SMS events");
        retryButton.setOnClickListener(v -> retryPending());
        actions.addView(retryButton, lp(0, 0, 0, 8));

        permissionButton = secondaryButton("Check SMS permission");
        permissionButton.setOnClickListener(v -> requestSmsPermissionIfNeeded(false));
        actions.addView(permissionButton, lp(0, 0, 0, 8));

        unpairButton = dangerButton("Unpair this device");
        unpairButton.setOnClickListener(v -> confirmUnpair());
        actions.addView(unpairButton, lp(0, 0, 0, 0));
        root.addView(actions, lp(0, 0, 0, 16));

        LinearLayout permissionCard = card();
        permissionText = text("SMS permission: checking…", 13, true, Color.rgb(51, 65, 85));
        permissionCard.addView(permissionText);
        permissionCard.addView(text("The companion only forwards messages that look like bank/transaction SMS. It does not read your normal SMS history.", 11, false, Color.rgb(100, 116, 139)), lp(0, 5, 0, 0));
        root.addView(permissionCard, lp(0, 0, 0, 16));

        LinearLayout logCard = card();
        TextView logTitle = text("Activity log", 13, true, Color.rgb(15, 23, 42));
        logCard.addView(logTitle);
        logText = text("No activity yet", 11, false, Color.rgb(71, 85, 105));
        logText.setTextIsSelectable(true);
        logCard.addView(logText, lp(0, 8, 0, 0));
        root.addView(logCard);

        TextView privacy = text("Security note: the device token is encrypted with Android Keystore and pending events remain local until the server accepts them.", 11, false, Color.rgb(100, 116, 139));
        privacy.setGravity(Gravity.CENTER_HORIZONTAL);
        root.addView(privacy, lp(0, 18, 0, 0));

        scroll.addView(root);
        setContentView(scroll);
    }

    private void pair() {
        final String serverRaw = serverInput.getText().toString().trim();
        final String code = codeInput.getText().toString().trim().toUpperCase(Locale.ROOT);
        if (!serverRaw.startsWith("https://")) {
            showError("Use an HTTPS backend URL");
            return;
        }
        if (!code.matches("[A-F0-9]{12}")) {
            showError("Enter the 12-character pairing code");
            return;
        }

        final String server = ApiClient.normalizeBaseUrl(serverRaw);
        AppPrefs.setServerUrl(this, server);
        setBusy(true);
        setStatus("Pairing device…", "Contacting SurakshaDigi securely", false);
        log("Pair button tapped");
        log("Using " + server);

        final String deviceId = AppPrefs.getOrCreateDeviceId(this);
        executor.execute(() -> {
            try {
                JSONObject payload = new JSONObject();
                payload.put("pairingCode", code);
                payload.put("deviceId", deviceId);
                ApiClient.Response response = ApiClient.postJson(server, "/devices/pair", payload, null);
                log("Pair response: HTTP " + response.code);
                if (!response.isSuccess()) {
                    throw new Exception(extractMessage(response.body, "Pairing failed (HTTP " + response.code + ")"));
                }
                JSONObject json = new JSONObject(response.body);
                String token = json.optString("token", "");
                if (token.isEmpty()) throw new Exception("Server did not return a device token");
                SecureStore.saveToken(this, token);
                JSONObject device = json.optJSONObject("device");
                String elderName = device == null ? "elder" : device.optString("elderName", "elder");
                runOnUiThread(() -> {
                    codeInput.setText("");
                    setStatus("Device paired", "Linked to " + elderName + " · pending events will sync automatically", false);
                    showToast("Device paired successfully");
                    log("Pairing completed successfully");
                    UploadJobService.schedule(this);
                    setBusy(false);
                });
            } catch (Exception e) {
                log("Pairing error: " + safeMessage(e));
                runOnUiThread(() -> {
                    setStatus("Pairing failed", userFriendlyError(e), true);
                    showToast(userFriendlyError(e));
                    setBusy(false);
                });
            }
        });
    }

    private void retryPending() {
        log("Retry button tapped");
        if (!SecureStore.hasToken(this)) {
            showError("Pair the device before retrying uploads");
            return;
        }
        boolean scheduled = UploadJobService.schedule(this);
        QueueDb db = new QueueDb(this);
        int pending = db.pendingCount();
        db.close();
        if (scheduled) {
            setStatus("Retry scheduled", pending + " pending SMS event(s) will be uploaded when network is available", false);
            showToast("Retry scheduled");
            log("Upload job scheduled · pending=" + pending);
        } else {
            setStatus("Retry could not be scheduled", "Android JobScheduler is unavailable", true);
            showToast("Could not schedule retry");
            log("JobScheduler scheduling failed");
        }
    }

    private void confirmUnpair() {
        log("Unpair button tapped");
        if (!SecureStore.hasToken(this)) {
            showError("This phone is already unpaired");
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("Unpair this phone?")
                .setMessage("This removes the device credential and deletes any unsent SMS events stored on this phone. SMS already uploaded to the server will remain there.")
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Unpair", (dialog, which) -> unpair())
                .show();
    }

    private void unpair() {
        setBusy(true);
        setStatus("Unpairing…", "Removing this phone's credential and clearing unsent local SMS events", false);
        executor.execute(() -> {
            synchronized (QueueDb.DEVICE_STATE_LOCK) {
                try {
                    String token = SecureStore.getToken(this);
                    ApiClient.Response response = ApiClient.delete(AppPrefs.getServerUrl(this), "/devices/me", token);
                    SecureStore.clearToken(this);
                    QueueDb db = new QueueDb(this);
                    db.clearAllEvents();
                    db.close();
                    UploadJobService.cancel(this);
                    runOnUiThread(() -> {
                        if (response.isSuccess()) {
                            setStatus("Device unpaired", "This phone can now be paired to another elder · unsent local SMS events were cleared", false);
                            showToast("Device unpaired");
                            log("Remote unpair successful · local queue cleared");
                        } else {
                            setStatus("Unpaired locally", "Server returned HTTP " + response.code + " · credential cleared and local SMS queue cleared", false);
                            showToast("Local device credential cleared");
                            log("Remote unpair response: HTTP " + response.code + " · local queue cleared");
                        }
                        setBusy(false);
                    });
                } catch (Exception e) {
                    SecureStore.clearToken(this);
                    try {
                        QueueDb db = new QueueDb(this);
                        db.clearAllEvents();
                        db.close();
                        UploadJobService.cancel(this);
                    } catch (Exception ignored) {
                        // Local credential is still cleared even if queue cleanup fails.
                    }
                    log("Unpair error: " + safeMessage(e) + " · local queue cleared");
                    runOnUiThread(() -> {
                        setStatus("Unpaired locally", "Server could not be reached, but the local credential and unsent SMS queue were cleared", false);
                        showToast("Unpaired locally");
                        setBusy(false);
                    });
                }
            }
        });
    }

    private void refreshStatus() {
        try {
            if (System.currentTimeMillis() < transientStatusUntil) {
                updatePermissionLabel();
                return;
            }
            QueueDb db = new QueueDb(this);
            int pending = db.pendingCount();
            db.close();
            boolean paired = SecureStore.hasToken(this);
            setStatusInternal(
                    paired ? "Status: paired" : "Status: not paired",
                    pending + " pending SMS event(s) · updates automatically",
                    false,
                    false
            );
            updatePermissionLabel();
        } catch (Exception e) {
            setStatusInternal("Status: unavailable", "Unable to read local companion state", true, false);
            updatePermissionLabel();
        }
    }

    private void requestSmsPermissionIfNeeded(boolean automatic) {
        log(automatic ? "Checking SMS permission on startup" : "SMS permission button tapped");
        if (android.os.Build.VERSION.SDK_INT < 23) {
            updatePermissionLabel();
            setStatus("SMS permission not required", "This Android version grants SMS access at install time", false);
            return;
        }
        if (checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED) {
            permissionText.setText("SMS permission: granted ✓");
            setStatus("SMS permission granted", "Incoming transaction SMS can now be captured", false);
            showToast("SMS permission is already granted");
            log("SMS permission = GRANTED");
        } else {
            permissionText.setText("SMS permission: required");
            setStatus("SMS permission required", "Android will ask for SMS access next", false);
            if (!automatic) showToast("Requesting SMS permission…");
            log("SMS permission = NOT GRANTED");
            requestPermissions(new String[]{Manifest.permission.RECEIVE_SMS}, SMS_PERMISSION_REQUEST);
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != SMS_PERMISSION_REQUEST) return;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            permissionText.setText("SMS permission: granted ✓");
            setStatus("SMS permission granted", "The companion is ready to monitor relevant transaction SMS", false);
            showToast("SMS permission granted");
            log("SMS permission result = GRANTED");
        } else {
            permissionText.setText("SMS permission: denied");
            setStatus("SMS permission denied", "The app cannot capture incoming transaction SMS until permission is granted", true);
            showToast("SMS permission was denied");
            log("SMS permission result = DENIED");
        }
    }

    private void copyDeviceId() {
        String value = AppPrefs.getOrCreateDeviceId(this);
        ClipboardManager clipboard = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard != null) {
            clipboard.setPrimaryClip(ClipData.newPlainText("SurakshaDigi Device ID", value));
            showToast("Device ID copied");
            log("Device ID copied to clipboard");
        }
    }

    private void setBusy(boolean busy) {
        progressBar.setVisibility(busy ? View.VISIBLE : View.GONE);
        pairButton.setEnabled(!busy);
        retryButton.setEnabled(!busy);
        unpairButton.setEnabled(!busy);
        permissionButton.setEnabled(!busy);
    }

    private void setStatus(String title, String detail, boolean error) {
        transientStatusUntil = System.currentTimeMillis() + 7000L;
        setStatusInternal(title, detail, error, true);
    }

    private void setStatusInternal(String title, String detail, boolean error, boolean keepTransient) {
        statusText.setText(title);
        statusDetail.setText(detail);
        statusText.setTextColor(error ? Color.rgb(185, 28, 28) : Color.rgb(15, 23, 42));
        statusDetail.setTextColor(error ? Color.rgb(185, 28, 28) : Color.rgb(100, 116, 139));
        if (!keepTransient) transientStatusUntil = 0L;
    }

    private void showError(String message) {
        setStatus("Action needs attention", message, true);
        showToast(message);
        log("UI error: " + message);
    }

    private void showToast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    private String userFriendlyError(Exception error) {
        String message = safeMessage(error);
        if (message.contains("Failed to connect") || message.contains("Unable to resolve host") || message.contains("timed out")) {
            return "Could not reach the backend. Check internet and the API URL.";
        }
        if (message.contains("Pairing code is invalid or expired")) {
            return "That pairing code is invalid or expired. Generate a new code on the dashboard.";
        }
        return message.isEmpty() ? "Unexpected error. Check the activity log." : message;
    }

    private String safeMessage(Exception error) {
        String message = error.getMessage();
        return message == null ? error.getClass().getSimpleName() : message;
    }

    private String extractMessage(String body, String fallback) {
        try {
            String message = new JSONObject(body).optString("message", "").trim();
            return message.isEmpty() ? fallback : message;
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private void updatePermissionLabel() {
        if (permissionText == null || android.os.Build.VERSION.SDK_INT < 23) return;
        boolean granted = checkSelfPermission(Manifest.permission.RECEIVE_SMS) == PackageManager.PERMISSION_GRANTED;
        permissionText.setText(granted ? "SMS permission: granted ✓" : "SMS permission: required");
    }

    private void log(String message) {
        Runnable write = () -> {
            if (logText == null) return;
            String line = "[" + timeFormat.format(new Date()) + "] " + message;
            String current = logText.getText().toString();
            if ("No activity yet".equals(current)) current = "";
            String updated = current.isEmpty() ? line : line + "\n" + current;
            if (updated.length() > 5000) updated = updated.substring(0, 5000);
            logText.setText(updated);
        };
        if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) write.run();
        else runOnUiThread(write);
    }

    private TextView sectionTitle(String value) {
        return text(value.toUpperCase(Locale.ROOT), 12, true, Color.rgb(100, 116, 139));
    }

    private TextView text(String value, float size, boolean bold, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private LinearLayout card() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(16), dp(16), dp(16), dp(16));
        GradientDrawable background = new GradientDrawable();
        background.setColor(Color.WHITE);
        background.setCornerRadius(dp(16));
        background.setStroke(dp(1), Color.rgb(226, 232, 240));
        box.setBackground(background);
        return box;
    }

    private Button primaryButton(String label) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextSize(14);
        b.setTextColor(Color.WHITE);
        b.setAllCaps(false);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setMinHeight(dp(48));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.rgb(15, 118, 110));
        bg.setCornerRadius(dp(12));
        b.setBackground(bg);
        return b;
    }

    private Button secondaryButton(String label) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextSize(14);
        b.setTextColor(Color.rgb(15, 23, 42));
        b.setAllCaps(false);
        b.setMinHeight(dp(46));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(Color.rgb(241, 245, 249));
        bg.setCornerRadius(dp(12));
        b.setBackground(bg);
        return b;
    }

    private Button dangerButton(String label) {
        Button b = secondaryButton(label);
        b.setTextColor(Color.rgb(185, 28, 28));
        return b;
    }

    private LinearLayout.LayoutParams lp(int l, int t, int r, int b) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.setMargins(dp(l), dp(t), dp(r), dp(b));
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override protected void onResume() {
        super.onResume();
        refreshStatus();
        updatePermissionLabel();
        if (handler != null) handler.post(statusRefresh);
    }

    @Override protected void onPause() {
        if (handler != null) handler.removeCallbacks(statusRefresh);
        super.onPause();
    }

    @Override protected void onDestroy() {
        if (handler != null) handler.removeCallbacks(statusRefresh);
        executor.shutdownNow();
        super.onDestroy();
    }
}
