package org.fdtech.prism.core;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.io.IOException;

import static org.junit.jupiter.api.Assertions.*;

class PrismMiddlewareTest {
    private RecordingClient client;
    private PrismMiddleware middleware;

    @BeforeEach
    void setUp() {
        client = new RecordingClient();
        middleware = new PrismMiddleware(config(), client);
    }

    private static PrismConfig config() {
        return new PrismConfig.Builder()
                .apiKey("test-key")
                .addRoute("/api/premium", 1000000L, "Premium")
                .addRoute("/api/cheap", 1L, "Cheap")
                .addRoute("/api/data/*", 500L, "Data")
                .build();
    }

    private static void assertPaymentRequired(PrismDecision decision) {
        assertNotNull(decision.getResponse());
        assertEquals(402, decision.getResponse().getStatusCode());
        assertFalse(decision.requiresSettlement());
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "/api/premium",
            "/api/premium/",
            "/api/premium/child",
            "/api/%70remium",
            "/api/%2570remium",
            "/API/PREMIUM",
            "/api/premium;jsessionid=1",
            "/api;x=1/premium",
            "/api//premium",
            "/api/./premium",
            "/api/cheap/../premium",
            "/api/cheap/%2e%2e/premium",
            "/api\\premium",
            "/api%2fpremium",
            "/api/cheap/..;/premium"
    })
    void everySpellingOfAProtectedPathRequiresPayment(String path) {
        client.verifier = (proof, route) -> RecordingClient.validJson(false);

        assertPaymentRequired(middleware.handleRequest(path, null));
        assertPaymentRequired(middleware.handleRequest(path, "Bearer x"));
        assertPaymentRequired(middleware.handleRequest(path, "Bearer"));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "/api/%70remium",
            "/api/premium;jsessionid=1",
            "/api/../api/premium",
            "/API/Premium"
    })
    void aVariantIsVerifiedAgainstTheSameRouteAsTheCanonicalPath(String path) {
        RoutePaymentConfig premium = middleware.findMatchingRoute("/api/premium");

        PrismDecision decision = middleware.handleRequest(path, "Bearer paid:/api/premium");

        assertNull(decision.getResponse());
        assertTrue(decision.requiresSettlement());
        assertSame(premium, decision.getRoute());
        assertSame(premium, client.verifiedRoutes.get(0));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "/api/premiumness",
            "/api/premium-extra",
            "/api/premium.json",
            "/api/premiums/1",
            "/apipremium",
            "/api",
            "/",
            "/other"
    })
    void prefixMatchingNeedsASegmentBoundary(String path) {
        assertNull(middleware.findMatchingRoute(path));

        PrismDecision decision = middleware.handleRequest(path, "Bearer x");

        assertNull(decision.getResponse());
        assertFalse(decision.requiresSettlement());
    }

    @Test
    void unprotectedPathsNeverTouchTheGatewayOrTheAuthorizationHeader() {
        PrismDecision decision = middleware.handleRequest("/public/info", "Bearer app-session-token");

        assertNull(decision.getResponse());
        assertFalse(decision.requiresSettlement());
        assertNull(middleware.settle(decision));
        assertEquals(0, client.totalCalls());
    }

    @Test
    void longestMatchingRouteWins() {
        PrismMiddleware nested = new PrismMiddleware(new PrismConfig.Builder()
                .apiKey("k")
                .addRoute("/api", 1L, "Api")
                .addRoute("/api/premium", 9L, "Premium")
                .build(), client);

        assertEquals("/api/premium", nested.findMatchingRoute("/api/premium/x").getPath());
        assertEquals("/api", nested.findMatchingRoute("/api/premiumx").getPath());
        assertEquals("/api", nested.findMatchingRoute("/api").getPath());
    }

    @Test
    void wildcardRoutesProtectTheirSubtreeOnly() {
        assertEquals("/api/data/*", middleware.findMatchingRoute("/api/data").getPath());
        assertEquals("/api/data/*", middleware.findMatchingRoute("/api/data/42/x").getPath());
        assertNull(middleware.findMatchingRoute("/api/database"));
    }

    @Test
    void aProofForOneRouteDoesNotUnlockAnother() {
        PrismDecision crossRoute = middleware.handleRequest("/api/premium", "Bearer paid:/api/cheap");

        assertPaymentRequired(crossRoute);
        assertEquals("/api/premium", client.verifiedRoutes.get(0).getPath());
        assertEquals(1000000L, client.verifiedRoutes.get(0).getPrice());

        PrismDecision sameRoute = middleware.handleRequest("/api/cheap", "Bearer paid:/api/cheap");

        assertNull(sameRoute.getResponse());
        assertTrue(sameRoute.requiresSettlement());
        assertEquals("/api/cheap", sameRoute.getRoute().getPath());
    }

    @Test
    void paymentRequirementsAreBuiltFromTheMatchedRoute() {
        middleware.handleRequest("/api/%70remium", null);

        assertEquals(1, client.requirementRoutes.size());
        assertEquals("/api/premium", client.requirementRoutes.get(0).getPath());
        assertEquals(1000000L, client.requirementRoutes.get(0).getPrice());
    }

    @Test
    void invalidPathsAreRejectedBeforeAnyGatewayCall() {
        PrismDecision decision = middleware.handleRequest("/api/premium%00", "Bearer x");

        assertEquals(400, decision.getResponse().getStatusCode());
        assertEquals(0, client.totalCalls());
        assertNull(middleware.findMatchingRoute("/api/premium%00"));
    }

    @Test
    void anythingButAnExplicitTrueFromTheGatewayFailsClosed() {
        JsonObject missing = new JsonObject();
        JsonObject text = new JsonObject();
        text.addProperty("valid", "true");
        JsonObject nested = new JsonObject();
        nested.add("valid", new JsonObject());

        for (JsonObject response : new JsonObject[]{missing, text, nested, RecordingClient.validJson(false)}) {
            client.verifier = (proof, route) -> response;
            assertPaymentRequired(middleware.handleRequest("/api/premium", "Bearer x"));
        }
    }

    @Test
    void gatewayFailureDuringVerificationFailsClosed() {
        PrismClient failing = new PrismClient("http://127.0.0.1:1", "k") {
            @Override
            public JsonObject verifyPayment(String proof, RoutePaymentConfig route) throws IOException {
                throw new IOException("gateway down");
            }

            @Override
            public JsonObject getPaymentRequirements(RoutePaymentConfig route) throws IOException {
                throw new IOException("gateway down");
            }
        };

        PrismDecision decision = new PrismMiddleware(config(), failing).handleRequest("/api/premium", "Bearer x");

        assertPaymentRequired(decision);
    }

    @Test
    void emptyBearerTokenIsTreatedAsMissing() {
        assertPaymentRequired(middleware.handleRequest("/api/premium", "Bearer    "));
        assertEquals(0, client.verifiedProofs.size());
    }

    @Test
    void settlementUsesTheVerifiedProofAndRoute() {
        PrismDecision decision = middleware.handleRequest("/api/cheap", "Bearer paid:/api/cheap");

        String header = middleware.settle(decision);

        assertEquals("proof=paid:/api/cheap", header);
        assertEquals("paid:/api/cheap", client.settledProofs.get(0));
        assertEquals("/api/cheap", client.settledRoutes.get(0).getPath());
    }

    @Test
    void settlementFailureIsReported() {
        client.settlementFailure = new IOException("settlement rejected");
        PrismDecision decision = middleware.handleRequest("/api/cheap", "Bearer paid:/api/cheap");

        assertNull(middleware.settle(decision));
    }

    @Test
    void nothingIsSettledWithoutAVerifiedPayment() {
        assertNull(middleware.settle(PrismDecision.unprotected()));
        assertNull(middleware.settle(middleware.handleRequest("/api/premium", null)));
        assertEquals(0, client.settledProofs.size());
    }

    @Test
    void routesThatCollapseToTheSamePathAreRejected() {
        PrismConfig duplicate = new PrismConfig.Builder()
                .apiKey("k")
                .addRoute("/api/premium", 1L, "A")
                .addRoute("/API/Premium/", 2L, "B")
                .build();

        assertThrows(IllegalArgumentException.class, () -> new PrismMiddleware(duplicate, client));
    }

    @Test
    void unsupportedWildcardRoutesAreRejected() {
        PrismConfig wildcard = new PrismConfig.Builder()
                .apiKey("k")
                .addRoute("/api/*/premium", 1L, "A")
                .build();

        assertThrows(IllegalArgumentException.class, () -> new PrismMiddleware(wildcard, client));
    }

    @Test
    void rootRouteProtectsEveryPath() {
        PrismMiddleware root = new PrismMiddleware(new PrismConfig.Builder()
                .apiKey("k")
                .addRoute("/*", 1L, "Everything")
                .build(), client);

        assertNotNull(root.findMatchingRoute("/anything/at/all"));
        assertNotNull(root.findMatchingRoute("/"));
    }
}
