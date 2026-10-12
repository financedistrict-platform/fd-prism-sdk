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
    private static final String PROOF_IN_USE = "Payment proof is already being processed or has already been used";
    private static final String SETTLEMENT_FAILED = "Payment settlement failed";

    private final PrismClient client;
    private final Map<String, RoutePaymentConfig> routeMap;
    private final PaymentReplayGuard replayGuard;

    public PrismMiddleware(PrismConfig config) {
        this(config, new PrismClient(config.getBaseUrl(), config.getApiKey()));
    }

    public PrismMiddleware(PrismConfig config, PrismClient client) {
        this(config, client, config.replayGuard());
    }

    PrismMiddleware(PrismConfig config, PrismClient client, PaymentReplayGuard replayGuard) {
        this.client = client;
        this.replayGuard = replayGuard;
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
        return handleRequest(path, authorizationHeader, null);
    }

    /**
     * Handle incoming request and check if payment is required.
     *
     * <p>A payment proof is admitted once: it is reserved before the Gateway is called, and every
     * other request carrying the same proof is rejected with {@code 402}. A request that passes
     * through the middleware more than once (stacked filters) shares its reservation when it
     * presents the same {@code requestScope} object each time.
     *
     * @param path The request path relative to the application root
     * @param authorizationHeader The Authorization header (may be null)
     * @param requestScope An object that identifies the current request, or null
     * @return The decision: an immediate response, a verified payment awaiting
     *         settlement, or an unprotected request that should simply continue
     */
    public PrismDecision handleRequest(String path, String authorizationHeader, Object requestScope) {
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

        PaymentProof identity = PaymentProof.parse(proof);
        if (identity == null || replayGuard.windowClosed(identity.validBeforeMillis())) {
            return PrismDecision.reject(requestPayment(routeConfig));
        }

        if (!replayGuard.tryReserve(identity.key(), identity.validBeforeMillis(), requestScope)) {
            return PrismDecision.reject(PrismResponse.invalidPayment(PROOF_IN_USE));
        }

        try {
            JsonObject verification = client.verifyPayment(proof, routeConfig);
            if (!isValid(verification)) {
                replayGuard.release(identity.key());
                return PrismDecision.reject(requestPayment(routeConfig));
            }
        } catch (IOException | RuntimeException e) {
            replayGuard.release(identity.key());
            System.err.println("Payment verification error: " + e.getMessage());
            return PrismDecision.reject(requestPayment(routeConfig));
        }

        PrismDecision verified = PrismDecision.verified(proof, routeConfig, identity);
        if (routeConfig.isSettleBeforeHandler() && settle(verified) == null) {
            return PrismDecision.reject(PrismResponse.invalidPayment(SETTLEMENT_FAILED));
        }
        return verified;
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

        PaymentProof identity = decision.identity();
        String alreadySettled = replayGuard.settlementFor(identity.key());
        if (alreadySettled != null) {
            return alreadySettled;
        }

        try {
            client.settlementCallback(
                    decision.getProof(),
                    decision.getRoute(),
                    "completed",
                    "Payment processed successfully"
            );
        } catch (IOException | RuntimeException e) {
            if (isDefiniteRefusal(e)) {
                replayGuard.release(identity.key());
            } else {
                replayGuard.markConsumed(identity.key(), identity.validBeforeMillis(), null);
            }
            System.err.println("Settlement failed for route " + decision.getRoute().getPath() + ": " + e.getMessage());
            return null;
        }

        String settlement = "proof=" + decision.getProof();
        replayGuard.markConsumed(identity.key(), identity.validBeforeMillis(), settlement);
        return settlement;
    }

    /**
     * Give up the reservation of a verified payment whose request ended without a settlement
     * (the protected response was an error). A payment that already settled stays consumed.
     *
     * @param decision The decision returned by {@link #handleRequest(String, String)}
     */
    public void release(PrismDecision decision) {
        if (decision.requiresSettlement()) {
            replayGuard.release(decision.identity().key());
        }
    }

    private static boolean isDefiniteRefusal(Exception failure) {
        return failure instanceof PrismGatewayException && ((PrismGatewayException) failure).isDefiniteRefusal();
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
