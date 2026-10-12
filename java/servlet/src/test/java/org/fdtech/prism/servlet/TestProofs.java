package org.fdtech.prism.servlet;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicLong;

final class TestProofs {
    private static final AtomicLong NONCES = new AtomicLong();

    private TestProofs() {
    }

    static String forRoute(String route) {
        return withNonce(route, "0xnonce" + NONCES.incrementAndGet());
    }

    static String withNonce(String route, String nonce) {
        JsonObject authorization = new JsonObject();
        authorization.addProperty("from", "0xAbC0000000000000000000000000000000000001");
        authorization.addProperty("nonce", nonce);
        authorization.addProperty("validBefore", String.valueOf(System.currentTimeMillis() / 1000 + 86_400));
        JsonObject payload = new JsonObject();
        payload.add("authorization", authorization);
        payload.addProperty("signature", "0xsignature");
        JsonObject proof = new JsonObject();
        proof.addProperty("x402Version", 2);
        proof.addProperty("paidFor", route);
        proof.add("payload", payload);
        return Base64.getEncoder().encodeToString(proof.toString().getBytes(StandardCharsets.UTF_8));
    }

    static String paidFor(String proof) {
        try {
            JsonObject decoded = JsonParser.parseString(
                    new String(Base64.getDecoder().decode(proof), StandardCharsets.UTF_8)).getAsJsonObject();
            return decoded.get("paidFor").getAsString();
        } catch (RuntimeException e) {
            return "";
        }
    }
}
