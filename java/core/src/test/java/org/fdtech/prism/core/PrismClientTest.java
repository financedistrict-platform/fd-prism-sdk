package org.fdtech.prism.core;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import static org.junit.jupiter.api.Assertions.*;

class PrismClientTest {
    private HttpServer server;
    private PrismClient client;
    private final Map<String, JsonObject> bodies = new ConcurrentHashMap<>();
    private final Map<String, Integer> statuses = new ConcurrentHashMap<>();
    private final Map<String, String> responses = new ConcurrentHashMap<>();
    private final RoutePaymentConfig route = new RoutePaymentConfig("/api/premium", 1000L, "Premium");

    @BeforeEach
    void startGateway() throws IOException {
        server = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            bodies.put(path, new Gson().fromJson(body, JsonObject.class));
            byte[] reply = responses.getOrDefault(path, "{\"valid\":true}").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(statuses.getOrDefault(path, 200), reply.length == 0 ? -1 : reply.length);
            if (reply.length > 0) {
                exchange.getResponseBody().write(reply);
            }
            exchange.close();
        });
        server.start();
        client = new PrismClient("http://127.0.0.1:" + server.getAddress().getPort(), "test-key");
    }

    @AfterEach
    void stopGateway() {
        server.stop(0);
    }

    @Test
    void verifyPaymentSendsTheRouteRequirementsWithTheProof() throws IOException {
        client.verifyPayment("proof-1", route);

        JsonObject body = bodies.get("/v1/verify-payment");
        assertEquals("proof-1", body.get("proof").getAsString());
        assertEquals("/api/premium", body.get("resource").getAsString());
        assertEquals("1000", body.get("price").getAsString());
        assertEquals("Premium", body.get("description").getAsString());
    }

    @Test
    void paymentRequirementsAreRequestedForTheResource() throws IOException {
        client.getPaymentRequirements(route);

        JsonObject body = bodies.get("/v1/get-payment-requirements");
        assertEquals("/api/premium", body.get("resource").getAsString());
        assertEquals("1000", body.get("price").getAsString());
        assertEquals("Premium", body.get("description").getAsString());
    }

    @Test
    void settlementCallbackIsBoundToTheRoute() throws IOException {
        client.settlementCallback("proof-1", route, "completed", "done");

        JsonObject body = bodies.get("/v1/settlement-callback");
        assertEquals("proof-1", body.get("paymentHash").getAsString());
        assertEquals("completed", body.get("status").getAsString());
        assertEquals("/api/premium", body.get("resource").getAsString());
        assertEquals("1000", body.get("price").getAsString());
    }

    @Test
    void settlementDoesNotRequireAJsonReply() {
        responses.put("/v1/settlement-callback", "OK");

        assertDoesNotThrow(() -> client.settlementCallback("proof-1", route, "completed", "done"));
    }

    @Test
    void settlementRejectionIsReported() {
        statuses.put("/v1/settlement-callback", 409);

        assertThrows(IOException.class, () -> client.settlementCallback("proof-1", route, "completed", "done"));
    }

    @Test
    void verificationRejectionAndMalformedRepliesAreReported() {
        statuses.put("/v1/verify-payment", 500);
        assertThrows(IOException.class, () -> client.verifyPayment("proof-1", route));

        statuses.put("/v1/verify-payment", 200);
        responses.put("/v1/verify-payment", "not json");
        assertThrows(IOException.class, () -> client.verifyPayment("proof-1", route));
    }

    @Test
    void anEmptyVerificationReplyIsNotValid() throws IOException {
        responses.put("/v1/verify-payment", "");

        JsonObject reply = client.verifyPayment("proof-1", route);

        assertFalse(reply.has("valid"));
    }
}
