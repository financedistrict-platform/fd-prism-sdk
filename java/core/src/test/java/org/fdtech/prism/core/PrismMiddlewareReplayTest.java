package org.fdtech.prism.core;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;

class PrismMiddlewareReplayTest {
    private static final String IN_USE = "Payment proof is already being processed or has already been used";
    private static final String PREMIUM = "/api/premium";
    private static final String SIDE_EFFECT = "/api/order";
    private static final int THREADS = 32;

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
                .addRoute(PREMIUM, 1000000L, "Premium")
                .addRoute(SIDE_EFFECT, 5L, "Order", true)
                .build();
    }

    private static String bearer(String proof) {
        return "Bearer " + proof;
    }

    private static boolean admitted(PrismDecision decision) {
        return decision.getResponse() == null && decision.requiresSettlement();
    }

    private static void assertRejectedAsReplay(PrismDecision decision) {
        assertNotNull(decision.getResponse());
        assertEquals(402, decision.getResponse().getStatusCode());
        assertTrue(decision.getResponse().getBody().contains(IN_USE), decision.getResponse().getBody());
        assertFalse(decision.requiresSettlement());
    }

    private static void assertPaymentRequired(PrismDecision decision) {
        assertNotNull(decision.getResponse());
        assertEquals(402, decision.getResponse().getStatusCode());
        assertNotNull(decision.getResponse().getHeaders().get("WWW-Authenticate"));
        assertFalse(decision.requiresSettlement());
    }

    private <T> List<T> runInParallel(int count, Callable<T> task) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(count);
        try {
            CountDownLatch ready = new CountDownLatch(count);
            CountDownLatch go = new CountDownLatch(1);
            List<Future<T>> futures = new ArrayList<>();
            for (int i = 0; i < count; i++) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    go.await();
                    return task.call();
                }));
            }
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            go.countDown();
            List<T> results = new ArrayList<>();
            for (Future<T> future : futures) {
                results.add(future.get(30, TimeUnit.SECONDS));
            }
            return results;
        } finally {
            pool.shutdownNow();
        }
    }

    private static void pause(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    @Test
    void parallelRequestsCarryingOneProofRunTheHandlerOnce() throws Exception {
        String proof = TestProofs.forRoute(PREMIUM);
        AtomicInteger handlerRuns = new AtomicInteger();
        client.verifier = (p, route) -> {
            pause(100);
            return RecordingClient.validJson(true);
        };

        List<PrismDecision> decisions = runInParallel(THREADS, () -> {
            PrismDecision decision = middleware.handleRequest(PREMIUM, bearer(proof), new Object());
            if (admitted(decision)) {
                handlerRuns.incrementAndGet();
                pause(50);
                middleware.settle(decision);
            }
            return decision;
        });

        assertEquals(1, handlerRuns.get());
        assertEquals(1, decisions.stream().filter(PrismMiddlewareReplayTest::admitted).count());
        decisions.stream().filter(d -> !admitted(d)).forEach(PrismMiddlewareReplayTest::assertRejectedAsReplay);
        assertEquals(1, client.verifiedProofs.size());
        assertEquals(1, client.settledProofs.size());
    }

    @Test
    void parallelRequestsWithoutAScopeAreAlsoAdmittedOnce() throws Exception {
        String proof = TestProofs.forRoute(PREMIUM);
        client.verifier = (p, route) -> {
            pause(50);
            return RecordingClient.validJson(true);
        };

        List<PrismDecision> decisions = runInParallel(THREADS, () -> middleware.handleRequest(PREMIUM, bearer(proof)));

        assertEquals(1, decisions.stream().filter(PrismMiddlewareReplayTest::admitted).count());
        assertEquals(1, client.verifiedProofs.size());
    }

    @Test
    void parallelRequestsOnASettleFirstRouteSettleAndRunTheHandlerOnce() throws Exception {
        String proof = TestProofs.forRoute(SIDE_EFFECT);
        client.verifier = (p, route) -> {
            pause(50);
            return RecordingClient.validJson(true);
        };
        client.beforeSettlement = () -> pause(50);

        List<PrismDecision> decisions = runInParallel(THREADS, () -> middleware.handleRequest(SIDE_EFFECT, bearer(proof), new Object()));

        assertEquals(1, decisions.stream().filter(PrismMiddlewareReplayTest::admitted).count());
        assertEquals(1, client.settledProofs.size());
        assertEquals(1, client.verifiedProofs.size());
    }

    @Test
    void aSettledProofCannotRunAgain() {
        String proof = TestProofs.forRoute(PREMIUM);
        PrismDecision first = middleware.handleRequest(PREMIUM, bearer(proof), new Object());
        assertTrue(admitted(first));
        assertNotNull(middleware.settle(first));

        assertRejectedAsReplay(middleware.handleRequest(PREMIUM, bearer(proof), new Object()));
        assertEquals(1, client.verifiedProofs.size());
    }

    @Test
    void theSameAuthorizationIsTheSameProofWhateverTheEncoding() {
        String lower = TestProofs.withAuthorization(PREMIUM, "0xabc", "0xN1");
        String upper = TestProofs.withAuthorization(PREMIUM, "0xABC", "0xn1");
        String otherNonce = TestProofs.withAuthorization(PREMIUM, "0xabc", "0xN2");

        assertTrue(admitted(middleware.handleRequest(PREMIUM, bearer(lower))));
        assertRejectedAsReplay(middleware.handleRequest(PREMIUM, bearer(upper)));
        assertTrue(admitted(middleware.handleRequest(PREMIUM, bearer(otherNonce))));
    }

    @Test
    void aRejectedVerificationReleasesTheProof() {
        String proof = TestProofs.forRoute(PREMIUM);
        client.verifier = (p, route) -> RecordingClient.validJson(false);
        assertPaymentRequired(middleware.handleRequest(PREMIUM, bearer(proof)));

        client.verifier = (p, route) -> RecordingClient.validJson(true);
        assertTrue(admitted(middleware.handleRequest(PREMIUM, bearer(proof))));
    }

    @Test
    void aVerificationFailureReleasesTheProof() {
        String proof = TestProofs.forRoute(PREMIUM);
        AtomicInteger calls = new AtomicInteger();
        PrismClient flaky = new PrismClient("http://127.0.0.1:1", "k") {
            @Override
            public JsonObject verifyPayment(String p, RoutePaymentConfig route) throws IOException {
                if (calls.incrementAndGet() == 1) {
                    throw new IOException("gateway down");
                }
                return RecordingClient.validJson(true);
            }

            @Override
            public JsonObject getPaymentRequirements(RoutePaymentConfig route) throws IOException {
                throw new IOException("gateway down");
            }
        };
        PrismMiddleware flakyMiddleware = new PrismMiddleware(config(), flaky);

        assertPaymentRequired(flakyMiddleware.handleRequest(PREMIUM, bearer(proof)));
        assertTrue(admitted(flakyMiddleware.handleRequest(PREMIUM, bearer(proof))));
    }

    @Test
    void aDefiniteGatewayRefusalOfSettlementReleasesTheProof() {
        String proof = TestProofs.forRoute(PREMIUM);
        PrismDecision first = middleware.handleRequest(PREMIUM, bearer(proof));
        client.settlementFailure = new PrismGatewayException("Settlement callback failed: 409", 409);
        assertNull(middleware.settle(first));

        client.settlementFailure = null;
        PrismDecision retry = middleware.handleRequest(PREMIUM, bearer(proof));
        assertTrue(admitted(retry));
        assertNotNull(middleware.settle(retry));
    }

    @Test
    void anUnknownSettlementOutcomeKeepsTheProofReserved() {
        List<IOException> unknownOutcomes = List.of(
                new IOException("timeout"),
                new PrismGatewayException("Settlement callback failed: 500", 500),
                new PrismGatewayException("Settlement callback failed: 503", 503));

        for (IOException failure : unknownOutcomes) {
            String proof = TestProofs.forRoute(PREMIUM);
            PrismDecision first = middleware.handleRequest(PREMIUM, bearer(proof));
            client.settlementFailure = failure;
            assertNull(middleware.settle(first));

            client.settlementFailure = null;
            assertRejectedAsReplay(middleware.handleRequest(PREMIUM, bearer(proof)));
        }
    }

    @Test
    void releasingAnUnsettledDecisionLetsTheProofRetry() {
        String proof = TestProofs.forRoute(PREMIUM);
        PrismDecision first = middleware.handleRequest(PREMIUM, bearer(proof));
        assertTrue(admitted(first));

        middleware.release(first);

        assertTrue(admitted(middleware.handleRequest(PREMIUM, bearer(proof))));
    }

    @Test
    void releasingASettledDecisionKeepsTheProofConsumed() {
        String proof = TestProofs.forRoute(PREMIUM);
        PrismDecision first = middleware.handleRequest(PREMIUM, bearer(proof));
        assertNotNull(middleware.settle(first));

        middleware.release(first);

        assertRejectedAsReplay(middleware.handleRequest(PREMIUM, bearer(proof)));
    }

    @Test
    void proofsThatCannotBeKeyedAreRejectedBeforeTheGateway() {
        JsonObject noNonce = new JsonObject();
        noNonce.addProperty("from", "0xabc");
        JsonObject payload = new JsonObject();
        payload.add("authorization", noNonce);
        JsonObject withoutNonce = new JsonObject();
        withoutNonce.add("payload", payload);

        List<String> proofs = List.of(
                "x",
                "paid:/api/premium",
                java.util.Base64.getEncoder().encodeToString("{}".getBytes()),
                java.util.Base64.getEncoder().encodeToString("[1]".getBytes()),
                java.util.Base64.getEncoder().encodeToString(withoutNonce.toString().getBytes()),
                "A".repeat(PaymentProof.MAX_LENGTH + 1));

        for (String proof : proofs) {
            assertPaymentRequired(middleware.handleRequest(PREMIUM, bearer(proof)));
        }
        assertEquals(0, client.verifiedProofs.size());
    }

    @Test
    void aProofPastItsValidBeforeIsRejectedBeforeTheGateway() {
        String expired = TestProofs.expiringAt(PREMIUM, System.currentTimeMillis() / 1000 - 10);

        assertPaymentRequired(middleware.handleRequest(PREMIUM, bearer(expired)));
        assertEquals(0, client.verifiedProofs.size());
    }

    @Test
    void aRequestPassingThroughTwiceSharesItsReservation() {
        String proof = TestProofs.forRoute(PREMIUM);
        Object scope = new Object();

        PrismDecision outer = middleware.handleRequest(PREMIUM, bearer(proof), scope);
        PrismDecision inner = middleware.handleRequest(PREMIUM, bearer(proof), scope);

        assertTrue(admitted(outer));
        assertTrue(admitted(inner));
        assertRejectedAsReplay(middleware.handleRequest(PREMIUM, bearer(proof), new Object()));
        assertRejectedAsReplay(middleware.handleRequest(PREMIUM, bearer(proof)));
    }

    @Test
    void stackedPassesSettleOnce() {
        String proof = TestProofs.forRoute(PREMIUM);
        Object scope = new Object();
        PrismDecision outer = middleware.handleRequest(PREMIUM, bearer(proof), scope);
        PrismDecision inner = middleware.handleRequest(PREMIUM, bearer(proof), scope);

        String innerHeader = middleware.settle(inner);
        String outerHeader = middleware.settle(outer);

        assertEquals("proof=" + proof, innerHeader);
        assertEquals(innerHeader, outerHeader);
        assertEquals(1, client.settledProofs.size());
    }

    @Test
    void aScopeCannotReuseAProofThatAlreadySettled() {
        String proof = TestProofs.forRoute(PREMIUM);
        Object scope = new Object();
        PrismDecision first = middleware.handleRequest(PREMIUM, bearer(proof), scope);
        assertNotNull(middleware.settle(first));

        assertRejectedAsReplay(middleware.handleRequest(PREMIUM, bearer(proof), scope));
    }

    @Test
    void routesSettleAfterTheHandlerByDefault() {
        PrismDecision decision = middleware.handleRequest(PREMIUM, bearer(TestProofs.forRoute(PREMIUM)));

        assertTrue(admitted(decision));
        assertEquals(0, client.settledProofs.size());
    }

    @Test
    void aSettleFirstRouteSettlesBeforeTheHandlerAndNeverTwice() {
        String proof = TestProofs.forRoute(SIDE_EFFECT);

        PrismDecision decision = middleware.handleRequest(SIDE_EFFECT, bearer(proof));

        assertTrue(admitted(decision));
        assertEquals(List.of(proof), client.settledProofs);
        assertEquals("proof=" + proof, middleware.settle(decision));
        assertEquals(1, client.settledProofs.size());
    }

    @Test
    void aSettleFirstRouteNeverReachesTheHandlerWhenSettlementFails() {
        String proof = TestProofs.forRoute(SIDE_EFFECT);
        client.settlementFailure = new IOException("timeout");

        PrismDecision decision = middleware.handleRequest(SIDE_EFFECT, bearer(proof));

        assertNotNull(decision.getResponse());
        assertEquals(402, decision.getResponse().getStatusCode());
        assertTrue(decision.getResponse().getBody().contains("Payment settlement failed"));
        assertFalse(decision.requiresSettlement());

        client.settlementFailure = null;
        assertRejectedAsReplay(middleware.handleRequest(SIDE_EFFECT, bearer(proof)));
    }

    @Test
    void aSettleFirstRouteReleasesTheProofWhenTheGatewayRefusesSettlement() {
        String proof = TestProofs.forRoute(SIDE_EFFECT);
        client.settlementFailure = new PrismGatewayException("Settlement callback failed: 409", 409);
        assertEquals(402, middleware.handleRequest(SIDE_EFFECT, bearer(proof)).getResponse().getStatusCode());

        client.settlementFailure = null;
        assertTrue(admitted(middleware.handleRequest(SIDE_EFFECT, bearer(proof))));
    }

    @Test
    void theGuardFailsClosedWhenEverySlotIsAnActiveReservation() {
        PaymentReplayGuard tiny = new PaymentReplayGuard(2, 600_000, System::currentTimeMillis);
        PrismMiddleware bounded = new PrismMiddleware(config(), client, tiny);

        assertTrue(admitted(bounded.handleRequest(PREMIUM, bearer(TestProofs.forRoute(PREMIUM)))));
        assertTrue(admitted(bounded.handleRequest(PREMIUM, bearer(TestProofs.forRoute(PREMIUM)))));

        assertRejectedAsReplay(bounded.handleRequest(PREMIUM, bearer(TestProofs.forRoute(PREMIUM))));
    }

    @Test
    void aReservationOutlivingTheLimitLetsTheProofRunAgain() {
        AtomicLong now = new AtomicLong(1_000_000);
        PaymentReplayGuard shortLived = new PaymentReplayGuard(10, 30_000, now::get);
        PrismMiddleware timed = new PrismMiddleware(config(), client, shortLived);
        String proof = TestProofs.forRoute(PREMIUM);

        assertTrue(admitted(timed.handleRequest(PREMIUM, bearer(proof))));
        now.addAndGet(29_000);
        assertRejectedAsReplay(timed.handleRequest(PREMIUM, bearer(proof)));
        now.addAndGet(2_000);
        assertTrue(admitted(timed.handleRequest(PREMIUM, bearer(proof))));
    }

    @Test
    void theReservationLimitMustBePositive() {
        assertThrows(IllegalStateException.class, () -> new PrismConfig.Builder().apiKey("k").replayReservationSeconds(0).build());
        assertThrows(IllegalStateException.class, () -> new PrismConfig.Builder().apiKey("k").replayReservationSeconds(-5).build());
        assertEquals(600, new PrismConfig.Builder().apiKey("k").build().getReplayReservationSeconds());
        assertEquals(45, new PrismConfig.Builder().apiKey("k").replayReservationSeconds(45).build().getReplayReservationSeconds());
    }

    @Test
    void middlewaresBuiltFromOneConfigShareTheirGuard() {
        PrismConfig shared = config();
        PrismMiddleware first = new PrismMiddleware(shared, client);
        PrismMiddleware second = new PrismMiddleware(shared, client);
        String proof = TestProofs.forRoute(PREMIUM);

        assertTrue(admitted(first.handleRequest(PREMIUM, bearer(proof))));
        assertRejectedAsReplay(second.handleRequest(PREMIUM, bearer(proof)));
    }
}
