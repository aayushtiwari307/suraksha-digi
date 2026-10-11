package com.surakshadigi.companion;

import android.content.Context;

import java.util.Locale;

public final class SmsFilter {
    private SmsFilter() {}

    public static boolean looksLikeTransactionSms(Context context, String sender, String message) {
        String normalizedSender = normalizeSender(sender);
        String text = (message == null ? "" : message).toLowerCase(Locale.ROOT);
        boolean hasMoney = text.matches("(?s).*?(₹|rs\\.?\\s*|inr\\s*|\\b\\d[\\d,]*(?:\\.\\d{1,2})?\\s*(?:debited|credited|spent|paid|transferred)).*");
        boolean transactionCue = text.matches("(?s).*\\b(debited|credited|upi|transaction|transferred|spent|paid|payment|withdrawn|a/c|account)\\b.*");
        boolean bankSender = false;
        for (String configured : AppPrefs.getBankSenders(context).split(",")) {
            String candidate = normalizeSender(configured);
            if (!candidate.isEmpty() && normalizedSender.contains(candidate)) {
                bankSender = true;
                break;
            }
        }
        return hasMoney && (bankSender || transactionCue);
    }

    public static String normalizeSender(String sender) {
        if (sender == null) return "";
        return sender.replaceAll("[^A-Za-z0-9]", "").toUpperCase(Locale.ROOT);
    }
}
