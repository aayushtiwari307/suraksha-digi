package com.surakshadigi.companion;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

public class SmsReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) return;

        // Serialize SMS ingestion with explicit unpair/upload operations. This closes
        // the race where an SMS could be queued after unpair clears the queue.
        synchronized (QueueDb.DEVICE_STATE_LOCK) {
            if (!SecureStore.hasToken(context)) return;

            SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
            if (messages == null || messages.length == 0) return;

            StringBuilder body = new StringBuilder();
            String sender = messages[0].getDisplayOriginatingAddress();
            long receivedAt = messages[0].getTimestampMillis();
            for (SmsMessage message : messages) {
                if (message == null) continue;
                if (body.length() > 0) body.append(' ');
                body.append(message.getMessageBody());
                receivedAt = Math.max(receivedAt, message.getTimestampMillis());
            }

            String raw = body.toString().trim();
            if (!SmsFilter.looksLikeTransactionSms(context, sender, raw)) return;

            long stableReceivedAt = receivedAt > 0 ? receivedAt : System.currentTimeMillis();
            String eventId = deterministicEventId(sender, raw, stableReceivedAt);
            QueueDb db = new QueueDb(context);
            db.enqueue(eventId, sender, raw, stableReceivedAt);
            db.close();
            UploadJobService.schedule(context);
        }
    }

    /**
     * Creates a deterministic ID so duplicate delivery of the same SMS broadcast
     * maps to the same SQLite primary key and is ignored by enqueue().
     */
    private static String deterministicEventId(String sender, String message, long receivedAt) {
        String normalizedSender = sender == null ? "" : sender.trim();
        String normalizedMessage = message == null ? "" : message.trim().replaceAll("\\s+", " ");
        String source = normalizedSender + "|" + receivedAt + "|" + normalizedMessage;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(source.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) hex.append(String.format("%02x", b & 0xff));
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is guaranteed to be available on every Android runtime;
            // this can never actually happen in practice.
            throw new RuntimeException("SHA-256 not available", e);
        }
    }
}
