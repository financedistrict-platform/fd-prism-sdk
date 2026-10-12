package org.fdtech.prism.core;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParseException;
import com.google.gson.JsonParser;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Locale;

final class PaymentProof {
    static final int MAX_LENGTH = 8192;

    private final String key;
    private final Long validBeforeMillis;

    private PaymentProof(String key, Long validBeforeMillis) {
        this.key = key;
        this.validBeforeMillis = validBeforeMillis;
    }

    String key() {
        return key;
    }

    Long validBeforeMillis() {
        return validBeforeMillis;
    }

    static PaymentProof parse(String proof) {
        if (proof == null || proof.length() > MAX_LENGTH) {
            return null;
        }
        try {
            JsonElement root = JsonParser.parseString(new String(decode(proof), StandardCharsets.UTF_8));
            JsonObject authorization = object(object(root, "payload"), "authorization");
            String from = text(authorization, "from");
            String nonce = text(authorization, "nonce");
            if (from == null || nonce == null) {
                return null;
            }
            return new PaymentProof((from + ":" + nonce).toLowerCase(Locale.ROOT), millis(authorization.get("validBefore")));
        } catch (IllegalArgumentException | JsonParseException e) {
            return null;
        }
    }

    private static byte[] decode(String proof) {
        try {
            return Base64.getDecoder().decode(proof);
        } catch (IllegalArgumentException e) {
            return Base64.getUrlDecoder().decode(proof);
        }
    }

    private static JsonObject object(JsonElement parent, String name) {
        if (parent == null || !parent.isJsonObject()) {
            return null;
        }
        JsonElement child = parent.getAsJsonObject().get(name);
        return child != null && child.isJsonObject() ? child.getAsJsonObject() : null;
    }

    private static String text(JsonObject parent, String name) {
        if (parent == null) {
            return null;
        }
        JsonElement value = parent.get(name);
        if (value == null || !value.isJsonPrimitive() || !value.getAsJsonPrimitive().isString()) {
            return null;
        }
        String text = value.getAsString();
        return text.isEmpty() ? null : text;
    }

    private static Long millis(JsonElement validBefore) {
        if (validBefore == null || !validBefore.isJsonPrimitive()) {
            return null;
        }
        String digits = validBefore.getAsString();
        if (digits.isEmpty() || digits.length() > 18 || !digits.chars().allMatch(Character::isDigit)) {
            return null;
        }
        long seconds = Long.parseLong(digits);
        return seconds > Long.MAX_VALUE / 1000 ? null : seconds * 1000;
    }
}
