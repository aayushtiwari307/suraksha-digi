package com.surakshadigi.companion;

import android.content.Context;
import android.content.SharedPreferences;

public final class AppPrefs {
    private static final String PREFS = "suraksha_digi";
    private static final String SERVER_URL = "server_url";
    private static final String DEVICE_ID = "device_id";
    private static final String BANK_SENDERS = "bank_senders";
    private static final String DEFAULT_SERVER = "https://suraksha-digi-backend.onrender.com/api";
    private static final String DEFAULT_SENDERS = "SBIINB,HDFCBK,ICICIB,ICICBK,AXISBK,KOTAKB,PNBSMS,BOIIND";

    private AppPrefs() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static String getServerUrl(Context context) {
        return prefs(context).getString(SERVER_URL, DEFAULT_SERVER);
    }

    public static void setServerUrl(Context context, String value) {
        prefs(context).edit().putString(SERVER_URL, ApiClient.normalizeBaseUrl(value)).apply();
    }

    public static String getOrCreateDeviceId(Context context) {
        String existing = prefs(context).getString(DEVICE_ID, null);
        if (existing != null && !existing.isEmpty()) return existing;
        String generated = java.util.UUID.randomUUID().toString();
        prefs(context).edit().putString(DEVICE_ID, generated).apply();
        return generated;
    }

    public static String getBankSenders(Context context) {
        return prefs(context).getString(BANK_SENDERS, DEFAULT_SENDERS);
    }

    public static void setBankSenders(Context context, String value) {
        prefs(context).edit().putString(BANK_SENDERS, value.trim()).apply();
    }
}
