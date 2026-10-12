package org.fdtech.prism.core;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicLong;

public final class TestProofs {
    public static final String PAYER = "0xAbC0000000000000000000000000000000000001";

    private static final AtomicLong NONCES = new AtomicLong();

    private TestProofs() {
    }

    public static String forRoute(String route) {
        return encode(route, PAYER, "0xnonce" + NONCES.incrementAndGet(), farFuture());
    }

    public static String withAuthorization(String route, String from, String nonce) {
        return encode(route, from, nonce, farFuture());
    }

    public static String expiringAt(String route, long validBeforeSeconds) {
        return encode(route, PAYER, "0xnonce" + NONCES.incrementAndGet(), String.valueOf(validBeforeSeconds));
    }

    public static String encode(String route, String from, String nonce, String validBefore) {
        JsonObject authorization = new JsonObject();
        authorization.addProperty("from", from);
        authorization.addProperty("nonce", nonce);
        authorization.addProperty("validBefore", validBefore);
        JsonObject payload = new JsonObject();
        payload.add("authorization", authorization);
        payload.addProperty("signature", "0xsignature");
        JsonObject proof = new JsonObject();
        proof.addProperty("x402Version", 2);
        proof.addProperty("paidFor", route);
        proof.add("payload", payload);
        return Base64.getEncoder().encodeToString(proof.toString().getBytes(StandardCharsets.UTF_8));
    }

    public static String paidFor(String proof) {
        try {
            JsonObject decoded = JsonParser.parseString(
                    new String(Base64.getDecoder().decode(proof), StandardCharsets.UTF_8)).getAsJsonObject();
            return decoded.get("paidFor").getAsString();
        } catch (RuntimeException e) {
            return "";
        }
    }

    private static String farFuture() {
        return String.valueOf(System.currentTimeMillis() / 1000 + 86_400);
    }
}
