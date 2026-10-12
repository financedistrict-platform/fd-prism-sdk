package org.fdtech.prism.core;

public final class PrismDecision {
    private static final PrismDecision UNPROTECTED = new PrismDecision(null, null, null);

    private final PrismResponse response;
    private final String proof;
    private final RoutePaymentConfig route;

    private PrismDecision(PrismResponse response, String proof, RoutePaymentConfig route) {
        this.response = response;
        this.proof = proof;
        this.route = route;
    }

    public static PrismDecision unprotected() {
        return UNPROTECTED;
    }

    public static PrismDecision reject(PrismResponse response) {
        return new PrismDecision(response, null, null);
    }

    public static PrismDecision verified(String proof, RoutePaymentConfig route) {
        return new PrismDecision(null, proof, route);
    }

    public PrismResponse getResponse() {
        return response;
    }

    public boolean requiresSettlement() {
        return proof != null && route != null;
    }

    public String getProof() {
        return proof;
    }

    public RoutePaymentConfig getRoute() {
        return route;
    }
}
