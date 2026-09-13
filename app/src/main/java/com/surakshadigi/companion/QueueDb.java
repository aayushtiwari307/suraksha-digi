package com.surakshadigi.companion;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import java.util.ArrayList;
import java.util.List;

public final class QueueDb extends SQLiteOpenHelper {
    private static final String DB_NAME = "surakshadigi_queue.db";
    private static final int VERSION = 1;

    public static final class Event {
        public final String eventId;
        public final String sender;
        public final String rawMessage;
        public final long receivedAt;
        public final int attempts;

        Event(String eventId, String sender, String rawMessage, long receivedAt, int attempts) {
            this.eventId = eventId;
            this.sender = sender;
            this.rawMessage = rawMessage;
            this.receivedAt = receivedAt;
            this.attempts = attempts;
        }
    }

    public QueueDb(Context context) { super(context, DB_NAME, null, VERSION); }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE events (event_id TEXT PRIMARY KEY, sender TEXT, raw_message TEXT NOT NULL, received_at INTEGER NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, created_at INTEGER NOT NULL)");
        db.execSQL("CREATE INDEX idx_events_status ON events(status, created_at)");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { }

    public boolean enqueue(String eventId, String sender, String rawMessage, long receivedAt) {
        ContentValues values = new ContentValues();
        values.put("event_id", eventId);
        values.put("sender", sender);
        values.put("raw_message", rawMessage);
        values.put("received_at", receivedAt);
        values.put("status", "pending");
        values.put("created_at", System.currentTimeMillis());
        return getWritableDatabase().insertWithOnConflict("events", null, values, SQLiteDatabase.CONFLICT_IGNORE) != -1;
    }

    public List<Event> pending(int limit) {
        List<Event> events = new ArrayList<>();
        try (Cursor c = getReadableDatabase().query("events", new String[]{"event_id","sender","raw_message","received_at","attempts"}, "status=?", new String[]{"pending"}, null, null, "created_at ASC", String.valueOf(limit))) {
            while (c.moveToNext()) {
                events.add(new Event(c.getString(0), c.getString(1), c.getString(2), c.getLong(3), c.getInt(4)));
            }
        }
        return events;
    }

    public void markSent(String eventId) {
        getWritableDatabase().delete("events", "event_id=?", new String[]{eventId});
    }

    public void markRetry(String eventId, String error) {
        String safeError = error == null ? "Upload failed" : error.substring(0, Math.min(error.length(), 500));
        getWritableDatabase().execSQL(
                "UPDATE events SET attempts = attempts + 1, last_error = ? WHERE event_id = ?",
                new Object[]{safeError, eventId}
        );
    }

    public void markFailed(String eventId, String error) {
        ContentValues values = new ContentValues();
        values.put("status", "failed");
        values.put("attempts", 1);
        values.put("last_error", error == null ? "Rejected by server" : error.substring(0, Math.min(error.length(), 500)));
        getWritableDatabase().update("events", values, "event_id=?", new String[]{eventId});
    }

    /**
     * Removes all locally queued SMS events during an explicit device unpair.
     * This prevents stale events from an old elder being uploaded after a new pairing.
     */
    public void clearAllEvents() {
        getWritableDatabase().delete("events", null, null);
    }

    /** Shared in-process lock for unpair/upload queue transitions. */
    public static final Object DEVICE_STATE_LOCK = new Object();

    public int pendingCount() {
        try (Cursor c = getReadableDatabase().rawQuery("SELECT COUNT(*) FROM events WHERE status='pending'", null)) {
            return c.moveToFirst() ? c.getInt(0) : 0;
        }
    }
}
