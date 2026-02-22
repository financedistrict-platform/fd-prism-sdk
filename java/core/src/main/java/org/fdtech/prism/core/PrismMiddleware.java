package org.fdtech.prism.core;

import com.google.gson.JsonObject;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

/**
 * Core middleware logic for handling payment requirements.
 * This is framework-agnostic and can be used by servlet, Spring, or other frameworks.
 */
public class PrismMiddleware {
    private final PrismConfig config;
    private final PrismClient client;
    private final Map<String, RoutePaymentConfig> routeMap;

    public PrismMiddleware(PrismConfig config) {
        this.config = config;
        this.client = new PrismClient(config.getBaseUrl(), config.getApiKey());
        this.routeMap = new HashMap<>();

        // Build route map for fast lookup
        for (RoutePaymentConfig route : config.getRoutes()) {
            routeMap.put(route.getPath(), route);
        }
    }

    /**
     * Find matching route configuration for a given path.
     *
     * @param path The request path
     * @return RoutePaymentConfig if found, null otherwise
     */
    public RoutePaymentConfig findMatchingRoute(String path) {
        // Exact match first
        if (routeMap.containsKey(path)) {
            return routeMap.get(path);
        }

        // Prefix match (longest match wins)
        RoutePaymentConfig longestMatch = null;
        int longestLength = 0;

        for (RoutePaymentConfig route : config.getRoutes()) {
            String routePath = route.getPath();
            if (path.startsWith(routePath) && routePath.length() > longestLength) {
                longestMatch = route;
                longestLength = routePath.length();
            }
        }

        return longestMatch;
    }

    /**
     * Handle incoming request and check if payment is required.
     *
     * @param path The request path
     * @param authorizationHeader The Authorization header (may be null)
     * @return PrismResponse if payment is required, null if request should continue
     */
    public PrismResponse handleRequest(String path, String authorizationHeader) {
        // Check if this route requires payment
        RoutePaymentConfig routeConfig = findMatchingRoute(path);
        if (routeConfig == null) {
            return null; // No payment required
        }

        // If no Authorization header, return 402
        if (authorizationHeader == null || authorizationHeader.isEmpty()) {
            return requestPayment(routeConfig);
        }

        // Verify payment proof
        try {
            String proof = extractProof(authorizationHeader);
            if (proof == null) {
                return requestPayment(routeConfig);
            }

            JsonObject verification = client.verifyPayment(proof);
            boolean isValid = verification.has("valid") && verification.get("valid").getAsBoolean();

            if (!isValid) {
                return requestPayment(routeConfig);
            }

            // Payment verified - continue
            return null;

        } catch (IOException e) {
            System.err.println("Payment verification error: " + e.getMessage());
            return requestPayment(routeConfig);
        }
    }

    /**
     * Add settlement header to response (called after response is generated).
     *
     * @param authorizationHeader The Authorization header from request
     * @return Settlement header value, or null if not applicable
     */
    public String getSettlementHeader(String authorizationHeader) {
        if (authorizationHeader == null || !authorizationHeader.startsWith("Bearer ")) {
            return null;
        }

        String proof = authorizationHeader.substring(7).trim();
        
        // Submit settlement callback asynchronously (best-effort)
        new Thread(() -> {
            client.settlementCallback(proof, "completed", "Payment processed successfully");
        }).start();

        return "proof=" + proof;
    }

    /**
     * Request payment by returning 402 response.
     */
    private PrismResponse requestPayment(RoutePaymentConfig routeConfig) {
        try {
            JsonObject requirements = client.getPaymentRequirements(
                    routeConfig.getPrice(),
                    routeConfig.getDescription()
            );

            String wwwAuthenticate = requirements.has("wwwAuthenticate")
                    ? requirements.get("wwwAuthenticate").getAsString()
                    : "Bearer realm=\"payment-required\"";

            String paymentRequired = requirements.has("paymentRequired")
                    ? requirements.get("paymentRequired").getAsString()
                    : routeConfig.getDescription();

            return PrismResponse.paymentRequired(wwwAuthenticate, paymentRequired);

        } catch (IOException e) {
            System.err.println("Failed to get payment requirements: " + e.getMessage());
            return PrismResponse.paymentRequired(
                    "Bearer realm=\"payment-required\"",
                    routeConfig.getDescription()
            );
        }
    }

    /**
     * Extract proof from Authorization header.
     */
    private String extractProof(String authorizationHeader) {
        if (authorizationHeader == null || !authorizationHeader.startsWith("Bearer ")) {
            return null;
        }
        return authorizationHeader.substring(7).trim();
    }
}
