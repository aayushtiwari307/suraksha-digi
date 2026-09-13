package com.surakshadigi.companion;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class ApiClient {
    public static final class Response {
        public final int code;
        public final String body;

        Response(int code, String body) {
            this.code = code;
            this.body = body;
        }

        public boolean isSuccess() {
            return code >= 200 && code < 300;
        }
    }

    private ApiClient() {}

    public static Response postJson(String baseUrl, String path, JSONObject payload, String bearerToken) throws Exception {
        return request("POST", baseUrl, path, payload, bearerToken);
    }

    public static Response delete(String baseUrl, String path, String bearerToken) throws Exception {
        return request("DELETE", baseUrl, path, null, bearerToken);
    }

    /**
     * Accept both the Render service root and the actual /api base URL.
     * This prevents an easy-to-make 404 when a user pastes the service URL
     * without the API prefix.
     */
    public static String normalizeBaseUrl(String rawBaseUrl) {
        String base = rawBaseUrl == null ? "" : rawBaseUrl.trim();
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        if (!base.isEmpty() && !base.matches("(?i).*/api$")) base += "/api";
        return base;
    }

    private static Response request(String method, String rawBaseUrl, String path, JSONObject payload, String bearerToken) throws Exception {
        String baseUrl = normalizeBaseUrl(rawBaseUrl);
        if (baseUrl.isEmpty()) throw new IllegalArgumentException("Backend URL is empty");

        URL url = new URL(baseUrl + (path.startsWith("/") ? path : "/" + path));
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(15000);
        connection.setUseCaches(false);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        if (bearerToken != null && !bearerToken.isEmpty()) {
            connection.setRequestProperty("Authorization", "Bearer " + bearerToken);
        }

        if (payload != null) {
            connection.setDoOutput(true);
            byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
            }
        }

        int code = connection.getResponseCode();
        InputStream stream = code >= 200 && code < 400 ? connection.getInputStream() : connection.getErrorStream();
        String body = readBody(stream);
        connection.disconnect();
        return new Response(code, body);
    }

    private static String readBody(InputStream stream) throws Exception {
        if (stream == null) return "";
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) builder.append(line);
        }
        return builder.toString();
    }
}
