package org.fdtech.prism.core;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

/**
 * Core middleware logic for handling payment requirements.
 * This is framework-agnostic and can be used by servlet, Spring, or other frameworks.
 */
public class PrismMiddleware {
    private final PrismClient client;
    private final Map<String, RoutePaymentConfig> routeMap;

    public PrismMiddleware(PrismConfig config) {
        this(config, new PrismClient(config.getBaseUrl(), config.getApiKey()));
    }

    public PrismMiddleware(PrismConfig config, PrismClient client) {
        this.client = client;
        this.routeMap = new HashMap<>();

        for (RoutePaymentConfig route : config.getRoutes()) {
            String key = routeKey(route.getPath());
            if (routeMap.put(key, route) != null) {
                throw new IllegalArgumentException("Duplicate payment route: " + route.getPath());
            }
        }
    }

    /**
     * Find matching route configuration for a given path.
     *
     * <p>The path is normalized first and a route matches the path itself or any
     * path below it on a segment boundary; the longest matching route wins.
     *
     * @param path The request path relative to the application root
     * @return RoutePaymentConfig if found, null otherwise (including for invalid paths)
     */
    public RoutePaymentConfig findMatchingRoute(String path) {
        String normalized = PathNormalizer.normalize(path);
        return normalized == null ? null : lookup(normalized);
    }

    /**
     * Handle incoming request and check if payment is required.
     *
     * @param path The request path relative to the application root
     * @param authorizationHeader The Authorization header (may be null)
     * @return The decision: an immediate response, a verified payment awaiting
     *         settlement, or an unprotected request that should simply continue
     */
    public PrismDecision handleRequest(String path, String authorizationHeader) {
        String normalized = PathNormalizer.normalize(path);
        if (normalized == null) {
            return PrismDecision.reject(PrismResponse.badRequest());
        }

        RoutePaymentConfig routeConfig = lookup(normalized);
        if (routeConfig == null) {
            return PrismDecision.unprotected();
        }

        String proof = extractProof(authorizationHeader);
        if (proof == null) {
            return PrismDecision.reject(requestPayment(routeConfig));
        }

        try {
            JsonObject verification = client.verifyPayment(proof, routeConfig);
            if (!isValid(verification)) {
                return PrismDecision.reject(requestPayment(routeConfig));
            }
            return PrismDecision.verified(proof, routeConfig);
        } catch (IOException e) {
            System.err.println("Payment verification error: " + e.getMessage());
            return PrismDecision.reject(requestPayment(routeConfig));
        }
    }

    /**
     * Settle a verified payment (called after the protected response is generated
     * and before it is sent).
     *
     * <p>The settlement callback is performed synchronously (bounded by the
     * {@link PrismClient}'s configured HTTP timeouts, the same pattern used by
     * {@link #handleRequest(String, String)} for payment verification) so that a
     * genuine settlement failure can be reported to the caller rather than being
     * fired off in a detached thread whose outcome is never observed.
     *
     * @param decision The decision returned by {@link #handleRequest(String, String)}
     * @return Settlement header value, or null if nothing was verified or if settlement failed
     */
    public String settle(PrismDecision decision) {
        if (!decision.requiresSettlement()) {
            return null;
        }

        try {
            client.settlementCallback(
                    decision.getProof(),
                    decision.getRoute(),
                    "completed",
                    "Payment processed successfully"
            );
            return "proof=" + decision.getProof();
        } catch (IOException e) {
            System.err.println("Settlement failed for route " + decision.getRoute().getPath() + ": " + e.getMessage());
            return null;
        }
    }

    /**
     * Request payment by returning 402 response.
     */
    private PrismResponse requestPayment(RoutePaymentConfig routeConfig) {
        try {
            JsonObject requirements = client.getPaymentRequirements(routeConfig);

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

    private RoutePaymentConfig lookup(String normalizedPath) {
        String candidate = normalizedPath;
        while (true) {
            RoutePaymentConfig route = routeMap.get(candidate);
            if (route != null) {
                return route;
            }
            if (candidate.equals("/")) {
                return null;
            }
            int lastSlash = candidate.lastIndexOf('/');
            candidate = lastSlash <= 0 ? "/" : candidate.substring(0, lastSlash);
        }
    }

    private static String routeKey(String routePath) {
        String path = routePath.endsWith("/*") ? routePath.substring(0, routePath.length() - 2) : routePath;
        if (path.indexOf('*') >= 0) {
            throw new IllegalArgumentException("Unsupported wildcard in payment route: " + routePath);
        }
        String key = PathNormalizer.normalize(path);
        if (key == null) {
            throw new IllegalArgumentException("Invalid payment route: " + routePath);
        }
        return key;
    }

    private static boolean isValid(JsonObject verification) {
        JsonElement valid = verification.get("valid");
        return valid != null
                && valid.isJsonPrimitive()
                && valid.getAsJsonPrimitive().isBoolean()
                && valid.getAsBoolean();
    }

    /**
     * Extract proof from Authorization header.
     */
    private String extractProof(String authorizationHeader) {
        if (authorizationHeader == null || !authorizationHeader.startsWith("Bearer ")) {
            return null;
        }
        String proof = authorizationHeader.substring(7).trim();
        return proof.isEmpty() ? null : proof;
    }
}
