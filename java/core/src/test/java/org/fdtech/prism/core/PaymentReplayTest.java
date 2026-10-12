package org.fdtech.prism.core;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PaymentReplayTest {
    private static final String PATH = "/api/premium";

    private HttpServer gateway;
    private PrismMiddleware middleware;
    private final AtomicInteger verifyCalls = new AtomicInteger();
    private final AtomicBoolean verifyValid = new AtomicBoolean(true);
    private final AtomicBoolean verifyFails = new AtomicBoolean(false);
    private final AtomicBoolean settleFails = new AtomicBoolean(false);

    @BeforeEach
    void startGateway() throws IOException {
        gateway = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        gateway.setExecutor(Executors.newFixedThreadPool(32));
        gateway.createContext("/v1/get-payment-requirements", exchange -> respond(exchange, 200, "{}"));
        gateway.createContext("/v1/verify-payment", exchange -> {
            verifyCalls.incrementAndGet();
            sleep(50);
            if (verifyFails.get()) {
                respond(exchange, 500, "{}");
                return;
            }
            respond(exchange, 200, "{\"valid\":" + verifyValid.get() + "}");
        });
        gateway.createContext("/v1/settlement-callback", exchange -> respond(exchange, settleFails.get() ? 500 : 200, "{}"));
        gateway.start();

        PrismConfig config = new PrismConfig.Builder()
                .apiKey("test-key")
                .baseUrl("http://127.0.0.1:" + gateway.getAddress().getPort())
                .addRoute(PATH, 1000L, "Premium")
                .build();
        middleware = new PrismMiddleware(config);
    }

    @AfterEach
    void stopGateway() {
        gateway.stop(0);
        ((ExecutorService) gateway.getExecutor()).shutdownNow();
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private boolean admitted(String proof) {
        return middleware.handleRequest(PATH, "Bearer " + proof) == null;
    }

    @Test
    void parallelRequestsSharingOneProofAdmitExactlyOne() throws Exception {
        int threads = 20;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Boolean>> results = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            results.add(pool.submit(() -> {
                start.await();
                return admitted("proof-parallel");
            }));
        }
        start.countDown();

        int admittedCount = 0;
        for (Future<Boolean> result : results) {
            if (result.get()) {
                admittedCount++;
            }
        }
        pool.shutdownNow();

        assertEquals(1, admittedCount);
        assertEquals(1, verifyCalls.get());
    }

    @Test
    void secondRequestWithSameProofIsRejectedWhileFirstIsInFlight() {
        assertTrue(admitted("proof-sequential"));
        assertFalse(admitted("proof-sequential"));
    }

    @Test
    void differentProofsDoNotBlockEachOther() {
        assertTrue(admitted("proof-one"));
        assertTrue(admitted("proof-two"));
    }

    @Test
    void proofIsReleasedWhenGatewayRejectsIt() {
        verifyValid.set(false);
        assertFalse(admitted("proof-invalid"));

        verifyValid.set(true);
        assertTrue(admitted("proof-invalid"));
    }

    @Test
    void proofIsReleasedWhenVerificationFails() {
        verifyFails.set(true);
        assertFalse(admitted("proof-verify-error"));

        verifyFails.set(false);
        assertTrue(admitted("proof-verify-error"));
    }

    @Test
    void proofIsReleasedWhenSettlementFails() {
        assertTrue(admitted("proof-settle-fails"));
        settleFails.set(true);
        assertNull(middleware.getSettlementHeader("Bearer proof-settle-fails"));

        settleFails.set(false);
        assertTrue(admitted("proof-settle-fails"));
    }

    @Test
    void proofStaysConsumedAfterSuccessfulSettlement() {
        assertTrue(admitted("proof-settled"));
        assertNotNull(middleware.getSettlementHeader("Bearer proof-settled"));

        assertFalse(admitted("proof-settled"));
    }

    @Test
    void abandonedReservationExpires() {
        AtomicLong now = new AtomicLong(1_000_000L);
        PaymentReplayGuard guard = new PaymentReplayGuard(10, 60_000L, 600_000L, now::get);

        assertTrue(guard.tryReserve("proof"));
        assertFalse(guard.tryReserve("proof"));
        now.addAndGet(61_000L);
        assertTrue(guard.tryReserve("proof"));
    }

    @Test
    void consumedProofExpiresAfterRetentionWindow() {
        AtomicLong now = new AtomicLong(1_000_000L);
        PaymentReplayGuard guard = new PaymentReplayGuard(10, 60_000L, 600_000L, now::get);

        assertTrue(guard.tryReserve("proof"));
        guard.markConsumed("proof");
        guard.release("proof");
        assertFalse(guard.tryReserve("proof"));
        now.addAndGet(600_001L);
        assertTrue(guard.tryReserve("proof"));
    }

    @Test
    void trackedProofsAreBoundedAndFailClosed() {
        PaymentReplayGuard guard = new PaymentReplayGuard(100, 60_000L, 600_000L, () -> 1_000_000L);

        int admittedCount = 0;
        for (int i = 0; i < 150; i++) {
            if (guard.tryReserve("proof-" + i)) {
                admittedCount++;
            }
        }

        assertEquals(100, admittedCount);
    }

    @Test
    void fullGuardEvictsOldestConsumedProofBeforeRefusing() {
        PaymentReplayGuard guard = new PaymentReplayGuard(2, 60_000L, 600_000L, () -> 1_000_000L);

        assertTrue(guard.tryReserve("a"));
        guard.markConsumed("a");
        assertTrue(guard.tryReserve("b"));

        assertTrue(guard.tryReserve("c"));
        assertFalse(guard.tryReserve("d"));
    }
}
