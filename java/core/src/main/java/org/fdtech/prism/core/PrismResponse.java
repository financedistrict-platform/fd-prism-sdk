package org.fdtech.prism.core;

import java.util.HashMap;
import java.util.Map;

/**
 * Represents a 402 Payment Required response.
 */
public class PrismResponse {
    private final int statusCode;
    private final Map<String, String> headers;
    private final String body;

    private PrismResponse(int statusCode, Map<String, String> headers, String body) {
        this.statusCode = statusCode;
        this.headers = headers;
        this.body = body;
    }

    public int getStatusCode() {
        return statusCode;
    }

    public Map<String, String> getHeaders() {
        return headers;
    }

    public String getBody() {
        return body;
    }

    /**
     * Creates a 402 Payment Required response.
     *
     * @param wwwAuthenticate The WWW-Authenticate header value
     * @param paymentRequired The Payment-Required header value
     * @return A PrismResponse with 402 status
     */
    public static PrismResponse paymentRequired(String wwwAuthenticate, String paymentRequired) {
        Map<String, String> headers = new HashMap<>();
        headers.put("WWW-Authenticate", wwwAuthenticate);
        headers.put("Payment-Required", paymentRequired);
        headers.put("Content-Type", "application/json");

        String body = String.format(
            "{\"error\":\"Payment required\",\"message\":\"%s\"}",
            paymentRequired
        );

        return new PrismResponse(402, headers, body);
    }

    /**
     * Creates a response that should continue to the next handler.
     *
     * @return null (indicates continue)
     */
    public static PrismResponse continueRequest() {
        return null;
    }
}
