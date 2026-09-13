package com.surakshadigi.companion;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

import org.json.JSONObject;

import java.util.List;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class UploadJobService extends JobService {
    private static final int JOB_ID = 4101;
    private static final SimpleDateFormat ISO_UTC = createIsoFormatter();

    private static SimpleDateFormat createIsoFormatter() {
        SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
        return formatter;
    }
    private ExecutorService executor;

    public static boolean schedule(Context context) {
        android.app.job.JobScheduler scheduler = (android.app.job.JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (scheduler == null) return false;
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(context, UploadJobService.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true)
                .setBackoffCriteria(15 * 60 * 1000L, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
                .setOverrideDeadline(30 * 1000L)
                .build();
        return scheduler.schedule(job) == android.app.job.JobScheduler.RESULT_SUCCESS;
    }

    public static boolean cancel(Context context) {
        android.app.job.JobScheduler scheduler =
                (android.app.job.JobScheduler) context.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (scheduler == null) return false;
        scheduler.cancel(JOB_ID);
        return true;
    }

    @Override public boolean onStartJob(JobParameters params) {
        executor = Executors.newSingleThreadExecutor();
        executor.execute(() -> {
            boolean retry = uploadPending();
            jobFinished(params, retry);
            if (executor != null) {
                executor.shutdown();
                executor = null;
            }
        });
        return true;
    }

    private static synchronized String formatReceivedAt(long receivedAt) {
        return ISO_UTC.format(new Date(receivedAt));
    }

    private boolean uploadPending() {
        synchronized (QueueDb.DEVICE_STATE_LOCK) {
            final Context context = getApplicationContext();
            String token;
            try {
                token = SecureStore.getToken(context);
            } catch (Exception error) {
                return false;
            }
            if (token == null || token.isEmpty()) return false;

            QueueDb db = new QueueDb(context);
            boolean retry = false;
            try {
                List<QueueDb.Event> events = db.pending(20);
            for (QueueDb.Event event : events) {
                try {
                    JSONObject payload = new JSONObject();
                    payload.put("eventId", event.eventId);
                    payload.put("sender", event.sender);
                    payload.put("rawMessage", event.rawMessage);
                    payload.put("receivedAt", formatReceivedAt(event.receivedAt));

                    ApiClient.Response response = ApiClient.postJson(
                            AppPrefs.getServerUrl(context),
                            "/devices/sms-event",
                            payload,
                            token
                    );

                    if (response.isSuccess()) {
                        db.markSent(event.eventId);
                    } else if (response.code == 401 || response.code == 403) {
                        // Keep the event pending so a successful re-pair can upload it later.
                        SecureStore.clearToken(context);
                        return true;
                    } else if (response.code >= 400 && response.code < 500) {
                        // Validation/business rejection should not retry forever.
                        db.markFailed(event.eventId, response.body);
                    } else {
                        db.markRetry(event.eventId, response.body);
                        retry = true;
                    }
                } catch (Exception error) {
                    db.markRetry(event.eventId, error.getMessage());
                    retry = true;
                }
            }
                return retry || db.pendingCount() > 0;
            } finally {
                db.close();
            }
        }
    }

    @Override public boolean onStopJob(JobParameters params) {
        if (executor != null) executor.shutdownNow();
        return true;
    }
}
