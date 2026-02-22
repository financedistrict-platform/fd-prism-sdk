package org.fdtech.prism.core;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import okhttp3.*;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

/**
 * HTTP client for interacting with the Prism Gateway.
 */
public class PrismClient {
    private final String baseUrl;
    private final String apiKey;
    private final OkHttpClient httpClient;
    private final Gson gson;

    public PrismClient(String baseUrl, String apiKey) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.httpClient = new OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(10, TimeUnit.SECONDS)
                .build();
        this.gson = new Gson();
    }

    /**
     * Get payment requirements for a route.
     *
     * @param price The price in wei
     * @param description The payment description
     * @return JSON response from Gateway(long price, String description) throws IOException {
        JsonObject requestBody = new JsonObject();
        requestBody.addProperty("price", String.valueOf(price));
        requestBody.addProperty("description", description);

        Request request = new Request.Builder()
                .url(baseUrl + "/v1/get-payment-requirements")
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .post(RequestBody.create(
                        gson.toJson(requestBody),
                        MediaType.parse("application/json")
                ))
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                throw new IOException("Failed to get payment requirements: " + response.code());
            }
            String responseBody = response.body().string();
            return gson.fromJson(responseBody, JsonObject.class);
        }
    }

    /**
     * Verify a payment proof.
     *
     * @param proof The payment proof from the client
     * @return JSON response from Gateway(String proof) throws IOException {
        JsonObject requestBody = new JsonObject();
        requestBody.addProperty("proof", proof);

        Request request = new Request.Builder()
                .url(baseUrl + "/v1/verify-payment")
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .post(RequestBody.create(
                        gson.toJson(requestBody),
                        MediaType.parse("application/json")
                ))
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                throw new IOException("Failed to verify payment: " + response.code());
            }
            String responseBody = response.body().string();
            return gson.fromJson(responseBody, JsonObject.class);
        }
    }

    /**
     * Submit a settlement callback.
     *
     * @param paymentHash The payment hash
     * @param status The settlement status
     * @param details Additional details
     * @throws IOException if the request fails (non-critical)
     */
    public void settlementCallback(String paymentHash, String status, String details) {
        try {
            JsonObject requestBody = new JsonObject();
            requestBody.addProperty("paymentHash", paymentHash);
            requestBody.addProperty("status", status);
            requestBody.addProperty("details", details);

            Request request = new Request.Builder()
                    .url(baseUrl + "/v1/settlement-callback")
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Content-Type", "application/json")
                    .post(RequestBody.create(
                            gson.toJson(requestBody),
                            MediaType.parse("application/json")
                    ))
                    .build();

            try (Response response = httpClient.newCall(request).execute()) {
                // Don't throw - settlement failure shouldn't block response
                if (!response.isSuccessful()) {
                    System.err.println("Settlement callback failed: " + response.code());
                }
            }
        } catch (IOException e) {
            // Don't propagate - settlement is best-effort
            System.err.println("Settlement callback error: " + e.getMessage());
        }
    }
}
