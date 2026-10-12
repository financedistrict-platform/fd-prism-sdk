package org.fdtech.prism.core;

public final class PrismDecision {
    private static final PrismDecision UNPROTECTED = new PrismDecision(null, null, null, null);

    private final PrismResponse response;
    private final String proof;
    private final RoutePaymentConfig route;
    private final PaymentProof identity;

    private PrismDecision(PrismResponse response, String proof, RoutePaymentConfig route, PaymentProof identity) {
        this.response = response;
        this.proof = proof;
        this.route = route;
        this.identity = identity;
    }

    public static PrismDecision unprotected() {
        return UNPROTECTED;
    }

    public static PrismDecision reject(PrismResponse response) {
        return new PrismDecision(response, null, null, null);
    }

    static PrismDecision verified(String proof, RoutePaymentConfig route, PaymentProof identity) {
        return new PrismDecision(null, proof, route, identity);
    }

    public PrismResponse getResponse() {
        return response;
    }

    public boolean requiresSettlement() {
        return proof != null && route != null && identity != null;
    }

    PaymentProof identity() {
        return identity;
    }

    public String getProof() {
        return proof;
    }

    public RoutePaymentConfig getRoute() {
        return route;
    }
}
