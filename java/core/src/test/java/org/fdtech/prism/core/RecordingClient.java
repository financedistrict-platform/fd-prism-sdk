package org.fdtech.prism.core;

import com.google.gson.JsonObject;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.BiFunction;

public class RecordingClient extends PrismClient {
    public final List<String> verifiedProofs = new CopyOnWriteArrayList<>();
    public final List<RoutePaymentConfig> verifiedRoutes = new CopyOnWriteArrayList<>();
    public final List<RoutePaymentConfig> requirementRoutes = new CopyOnWriteArrayList<>();
    public final List<RoutePaymentConfig> settledRoutes = new CopyOnWriteArrayList<>();
    public final List<String> settledProofs = new CopyOnWriteArrayList<>();

    public BiFunction<String, RoutePaymentConfig, JsonObject> verifier =
            (proof, route) -> validJson(TestProofs.paidFor(proof).equals(route.getPath()));
    public volatile IOException settlementFailure;
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
