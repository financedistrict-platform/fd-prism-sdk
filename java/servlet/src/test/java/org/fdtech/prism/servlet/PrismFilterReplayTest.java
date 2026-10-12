package org.fdtech.prism.servlet;

import com.google.gson.JsonObject;
import org.fdtech.prism.core.PrismClient;
import org.fdtech.prism.core.PrismConfig;
import org.fdtech.prism.core.PrismGatewayException;
import org.fdtech.prism.core.PrismMiddleware;
import org.fdtech.prism.core.RoutePaymentConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import javax.servlet.FilterChain;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletRequestWrapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class PrismFilterReplayTest {
    private static final String IN_USE = "Payment proof is already being processed or has already been used";
    private static final int THREADS = 32;

    private final List<String> events = Collections.synchronizedList(new ArrayList<>());
    private final AtomicInteger settlements = new AtomicInteger();
    private volatile IOException settlementFailure;
    private PrismConfig config;
    private PrismFilter filter;

    @BeforeEach
    void setUp() {
        config = new PrismConfig.Builder()
                .apiKey("test-key")
                .addRoute("/api/premium", 1000000L, "Premium")
                .addRoute("/api/order", 5L, "Order", true)
                .build();
        filter = new PrismFilter(new PrismMiddleware(config, client()));
    }

    private PrismClient client() {
        return new PrismClient("http://127.0.0.1:1", "test-key") {
            @Override
            public JsonObject getPaymentRequirements(RoutePaymentConfig route) {
                JsonObject json = new JsonObject();
                json.addProperty("paymentRequired", route.getDescription());
                return json;
            }

            @Override
            public JsonObject verifyPayment(String proof, RoutePaymentConfig route) {
                pause(50);
                JsonObject json = new JsonObject();
                json.addProperty("valid", TestProofs.paidFor(proof).equals(route.getPath()));
                return json;
            }

            @Override
            public void settlementCallback(String paymentHash, RoutePaymentConfig route, String status, String details)
                    throws IOException {
                events.add("settle");
                settlements.incrementAndGet();
                pause(20);
                if (settlementFailure != null) {
                    throw settlementFailure;
                }
            }
        };
    }

    private static void pause(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private static HttpServletRequest request(String servletPath, String proof) {
        return FakeServlet.request(servletPath, servletPath, null, "Bearer " + proof);
    }

    private FilterChain handler(AtomicInteger runs, int status) {
        return (req, res) -> {
            events.add("handler");
            runs.incrementAndGet();
            pause(100);
            javax.servlet.http.HttpServletResponse http = (javax.servlet.http.HttpServletResponse) res;
            http.setStatus(status);
            http.getWriter().write("premium content");
        };
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

    @Test
    void parallelRequestsWithOneProofRunTheHandlerOnce() throws Exception {
        String proof = TestProofs.forRoute("/api/premium");
        AtomicInteger runs = new AtomicInteger();

        List<FakeServlet.Response> responses = runInParallel(THREADS, () -> {
            FakeServlet.Response response = FakeServlet.response();
            filter.doFilter(request("/api/premium", proof), response.proxy(), handler(runs, 200));
            return response;
        });

        assertEquals(1, runs.get());
        assertEquals(1, settlements.get());
        assertEquals(1, responses.stream().filter(r -> r.status() == 200).count());
        responses.stream().filter(r -> r.status() != 200).forEach(r -> {
            assertEquals(402, r.status());
            assertTrue(r.body().contains(IN_USE), r.body());
            assertFalse(r.body().contains("premium content"));
        });
    }

    @Test
    void parallelRequestsOnASettleFirstRouteSettleAndRunTheHandlerOnce() throws Exception {
        String proof = TestProofs.forRoute("/api/order");
        AtomicInteger runs = new AtomicInteger();

        List<FakeServlet.Response> responses = runInParallel(THREADS, () -> {
            FakeServlet.Response response = FakeServlet.response();
            filter.doFilter(request("/api/order", proof), response.proxy(), handler(runs, 200));
            return response;
        });

        assertEquals(1, runs.get());
        assertEquals(1, settlements.get());
        assertEquals(1, responses.stream().filter(r -> r.status() == 200).count());
    }

    @Test
    void distinctProofsAreNotHeldBackByEachOther() throws Exception {
        AtomicInteger runs = new AtomicInteger();

        List<FakeServlet.Response> responses = runInParallel(THREADS, () -> {
            FakeServlet.Response response = FakeServlet.response();
            filter.doFilter(request("/api/premium", TestProofs.forRoute("/api/premium")), response.proxy(), handler(runs, 200));
            return response;
        });

        assertEquals(THREADS, runs.get());
        assertTrue(responses.stream().allMatch(r -> r.status() == 200));
    }

    @Test
    void aSettledProofIsRejectedOnReplay() throws Exception {
        String proof = TestProofs.forRoute("/api/premium");
        AtomicInteger runs = new AtomicInteger();
        FakeServlet.Response first = FakeServlet.response();
        filter.doFilter(request("/api/premium", proof), first.proxy(), handler(runs, 200));

        FakeServlet.Response replay = FakeServlet.response();
        filter.doFilter(request("/api/premium", proof), replay.proxy(), handler(runs, 200));

        assertEquals(200, first.status());
        assertEquals(402, replay.status());
        assertTrue(replay.body().contains(IN_USE));
        assertEquals(1, runs.get());
        assertEquals(1, settlements.get());
    }

    @Test
    void anErrorResponseReleasesTheProofForARetry() throws Exception {
        String proof = TestProofs.forRoute("/api/premium");
        AtomicInteger runs = new AtomicInteger();
        FakeServlet.Response failed = FakeServlet.response();
        filter.doFilter(request("/api/premium", proof), failed.proxy(), handler(runs, 500));

        FakeServlet.Response retry = FakeServlet.response();
        filter.doFilter(request("/api/premium", proof), retry.proxy(), handler(runs, 200));

        assertEquals(500, failed.status());
        assertEquals(200, retry.status());
        assertEquals(2, runs.get());
        assertEquals(1, settlements.get());
    }

    @Test
    void anUnknownSettlementOutcomeKeepsTheProofReserved() throws Exception {
        String proof = TestProofs.forRoute("/api/premium");
        AtomicInteger runs = new AtomicInteger();
        settlementFailure = new IOException("timeout");
        FakeServlet.Response first = FakeServlet.response();
        filter.doFilter(request("/api/premium", proof), first.proxy(), handler(runs, 200));

        settlementFailure = null;
        FakeServlet.Response replay = FakeServlet.response();
        filter.doFilter(request("/api/premium", proof), replay.proxy(), handler(runs, 200));

        assertEquals(402, first.status());
        assertEquals(402, replay.status());
        assertTrue(replay.body().contains(IN_USE));
        assertEquals(1, runs.get());
    }

    @Test
    void aDefiniteSettlementRefusalReleasesTheProofForARetry() throws Exception {
        String proof = TestProofs.forRoute("/api/premium");
        AtomicInteger runs = new AtomicInteger();
        settlementFailure = new PrismGatewayException("Settlement callback failed: 409", 409);
        FakeServlet.Response first = FakeServlet.response();
        filter.doFilter(request("/api/premium", proof), first.proxy(), handler(runs, 200));

        settlementFailure = null;
        FakeServlet.Response retry = FakeServlet.response();
        filter.doFilter(request("/api/premium", proof), retry.proxy(), handler(runs, 200));

        assertEquals(402, first.status());
        assertEquals(200, retry.status());
    }

    @Test
    void stackedFiltersOnOneRequestRunTheHandlerAndSettleOnce() throws Exception {
        String proof = TestProofs.forRoute("/api/premium");
        AtomicInteger runs = new AtomicInteger();
        PrismFilter inner = new PrismFilter(new PrismMiddleware(config, client()));
        FakeServlet.Response response = FakeServlet.response();
        HttpServletRequest request = request("/api/premium", proof);

        filter.doFilter(request, response.proxy(), (req, res) -> inner.doFilter(req, res, handler(runs, 200)));

        assertEquals(200, response.status());
        assertEquals("premium content", response.body());
        assertEquals(1, runs.get());
        assertEquals(1, settlements.get());
        assertEquals("proof=" + proof, response.header("X-Settlement"));
    }

    @Test
    void stackedFiltersStillShareTheReservationWhenARequestWrapperSitsBetweenThem() throws Exception {
        String proof = TestProofs.forRoute("/api/premium");
        AtomicInteger runs = new AtomicInteger();
        PrismFilter inner = new PrismFilter(new PrismMiddleware(config, client()));
        FakeServlet.Response response = FakeServlet.response();

        filter.doFilter(request("/api/premium", proof), response.proxy(),
                (req, res) -> inner.doFilter(new HttpServletRequestWrapper((HttpServletRequest) req), res, handler(runs, 200)));

        assertEquals(200, response.status());
        assertEquals(1, runs.get());
    }

    @Test
    void aSecondRequestWithAProofHeldByAStackedRequestIsRejected() throws Exception {
        String proof = TestProofs.forRoute("/api/premium");
        AtomicInteger runs = new AtomicInteger();
        FakeServlet.Response intruder = FakeServlet.response();
        FakeServlet.Response owner = FakeServlet.response();

        filter.doFilter(request("/api/premium", proof), owner.proxy(), (req, res) -> {
            filter.doFilter(request("/api/premium", proof), intruder.proxy(), handler(runs, 200));
            handler(runs, 200).doFilter(req, res);
        });

        assertEquals(402, intruder.status());
        assertTrue(intruder.body().contains(IN_USE));
        assertEquals(200, owner.status());
        assertEquals(1, runs.get());
    }

    @Test
    void aSettleFirstRouteSettlesBeforeTheHandlerRuns() throws Exception {
        String proof = TestProofs.forRoute("/api/order");
        AtomicInteger runs = new AtomicInteger();
        FakeServlet.Response response = FakeServlet.response();

        filter.doFilter(request("/api/order", proof), response.proxy(), handler(runs, 200));

        assertEquals(List.of("settle", "handler"), events);
        assertEquals(200, response.status());
        assertEquals("proof=" + proof, response.header("X-Settlement"));
        assertEquals(1, settlements.get());
    }

    @Test
    void aSettleFirstRouteNeverRunsTheHandlerWhenSettlementFails() throws Exception {
        String proof = TestProofs.forRoute("/api/order");
        AtomicInteger runs = new AtomicInteger();
        settlementFailure = new IOException("timeout");
        FakeServlet.Response response = FakeServlet.response();

        filter.doFilter(request("/api/order", proof), response.proxy(), handler(runs, 200));

        assertEquals(402, response.status());
        assertEquals(0, runs.get());
        assertFalse(response.body().contains("premium content"));
        assertTrue(response.body().contains("Payment settlement failed"));
    }
}
