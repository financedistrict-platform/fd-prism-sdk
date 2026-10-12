package org.fdtech.prism.core;

import com.google.gson.JsonObject;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.function.BiFunction;

public class RecordingClient extends PrismClient {
    public final List<String> verifiedProofs = new ArrayList<>();
    public final List<RoutePaymentConfig> verifiedRoutes = new ArrayList<>();
    public final List<RoutePaymentConfig> requirementRoutes = new ArrayList<>();
    public final List<RoutePaymentConfig> settledRoutes = new ArrayList<>();
    public final List<String> settledProofs = new ArrayList<>();

    public BiFunction<String, RoutePaymentConfig, JsonObject> verifier =
            (proof, route) -> validJson(proof.equals("paid:" + route.getPath()));
    public IOException settlementFailure;
    public Runnable beforeSettlement = () -> { };

    public RecordingClient() {
        super("http://127.0.0.1:1", "test-key");
    }

    public static JsonObject validJson(boolean valid) {
        JsonObject json = new JsonObject();
        json.addProperty("valid", valid);
        return json;
    }

    public int totalCalls() {
        return verifiedProofs.size() + requirementRoutes.size() + settledProofs.size();
    }

    @Override
    public JsonObject getPaymentRequirements(RoutePaymentConfig route) {
        requirementRoutes.add(route);
        JsonObject json = new JsonObject();
        json.addProperty("wwwAuthenticate", "Bearer realm=\"pay\"");
        json.addProperty("paymentRequired", route.getDescription());
        return json;
    }

    @Override
    public JsonObject verifyPayment(String proof, RoutePaymentConfig route) {
        verifiedProofs.add(proof);
        verifiedRoutes.add(route);
        return verifier.apply(proof, route);
    }

    @Override
    public void settlementCallback(String paymentHash, RoutePaymentConfig route, String status, String details)
            throws IOException {
        beforeSettlement.run();
        settledProofs.add(paymentHash);
        settledRoutes.add(route);
        if (settlementFailure != null) {
            throw settlementFailure;
        }
    }
}
