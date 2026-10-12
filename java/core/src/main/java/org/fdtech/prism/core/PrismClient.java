package org.fdtech.prism.core;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonSyntaxException;
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
     * @param route The matched route configuration
     * @return JSON response from Gateway
     * @throws IOException if the Gateway cannot be reached or rejects the call
     */
    public JsonObject getPaymentRequirements(RoutePaymentConfig route) throws IOException {
        return postForJson("/v1/get-payment-requirements", requirementsBody(route), "Failed to get payment requirements");
    }

    /**
     * Verify a payment proof against the requirements of a route.
     *
     * @param proof The payment proof from the client
     * @param route The matched route configuration the proof must satisfy
     * @return JSON response from Gateway
     * @throws IOException if the Gateway cannot be reached or rejects the call
     */
    public JsonObject verifyPayment(String proof, RoutePaymentConfig route) throws IOException {
        JsonObject requestBody = requirementsBody(route);
        requestBody.addProperty("proof", proof);
        return postForJson("/v1/verify-payment", requestBody, "Failed to verify payment");
    }

    /**
     * Submit a settlement callback for a proof that was verified against a route.
     *
     * <p>Failures are surfaced to the caller (via {@link IOException}) so a failed
     * settlement can block the response. Failures are also logged for operator
     * visibility.
     *
     * @param paymentHash The payment hash
     * @param route The route the proof was verified against
     * @param status The settlement status
     * @param details Additional details
     * @throws IOException if the settlement callback receives a non-2xx response
     *         or a network error occurs while performing the request
     */
    public void settlementCallback(String paymentHash, RoutePaymentConfig route, String status, String details)
            throws IOException {
        JsonObject requestBody = requirementsBody(route);
        requestBody.addProperty("paymentHash", paymentHash);
        requestBody.addProperty("status", status);
        requestBody.addProperty("details", details);

        try {
            post("/v1/settlement-callback", requestBody, "Settlement callback failed");
        } catch (IOException e) {
            System.err.println("Settlement callback error: " + e.getMessage());
            throw e;
        }
    }

    private JsonObject requirementsBody(RoutePaymentConfig route) {
        JsonObject body = new JsonObject();
        body.addProperty("resource", route.getPath());
        body.addProperty("price", String.valueOf(route.getPrice()));
        body.addProperty("description", route.getDescription());
        return body;
    }

    private JsonObject postForJson(String endpoint, JsonObject requestBody, String failureMessage) throws IOException {
        String responseBody = post(endpoint, requestBody, failureMessage);
        try {
            JsonObject parsed = gson.fromJson(responseBody, JsonObject.class);
            return parsed == null ? new JsonObject() : parsed;
        } catch (JsonSyntaxException e) {
            throw new IOException(failureMessage + ": malformed response", e);
        }
    }

    private String post(String endpoint, JsonObject requestBody, String failureMessage) throws IOException {
        Request request = new Request.Builder()
                .url(baseUrl + endpoint)
                .header("Authorization", "Bearer " + apiKey)
                .header("Content-Type", "application/json")
                .post(RequestBody.create(
                        gson.toJson(requestBody),
                        MediaType.parse("application/json")
                ))
                .build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                throw new IOException(failureMessage + ": " + response.code());
            }
            ResponseBody body = response.body();
            return body == null ? "" : body.string();
        }
    }
}
