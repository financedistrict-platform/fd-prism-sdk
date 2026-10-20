package org.fdtech.prism.servlet;

import com.google.gson.JsonObject;
import org.fdtech.prism.core.PrismClient;
import org.fdtech.prism.core.PrismConfig;
import org.fdtech.prism.core.PrismMiddleware;
import org.fdtech.prism.core.RoutePaymentConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import javax.servlet.FilterChain;
import javax.servlet.ServletRequest;
import javax.servlet.ServletResponse;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class PrismFilterTest {
    private final List<String> verifiedFor = new ArrayList<>();
    private final List<String> settledFor = new ArrayList<>();
    private final AtomicInteger gatewayCalls = new AtomicInteger();
    private IOException settlementFailure;
    private Runnable beforeSettlement = () -> { };
    private PrismFilter filter;

    @BeforeEach
    void setUp() {
        PrismConfig config = new PrismConfig.Builder()
                .apiKey("test-key")
                .addRoute("/api/premium", 1000000L, "Premium")
                .addRoute("/api/cheap", 1L, "Cheap")
                .build();
        PrismClient client = new PrismClient("http://127.0.0.1:1", "test-key") {
            @Override
            public JsonObject getPaymentRequirements(RoutePaymentConfig route) {
                gatewayCalls.incrementAndGet();
                JsonObject json = new JsonObject();
                json.addProperty("paymentRequired", route.getDescription());
                return json;
            }

            @Override
            public JsonObject verifyPayment(String proof, RoutePaymentConfig route) {
                gatewayCalls.incrementAndGet();
                verifiedFor.add(route.getPath());
                JsonObject json = new JsonObject();
                json.addProperty("valid", TestProofs.paidFor(proof).equals(route.getPath()));
                return json;
            }

            @Override
            public void settlementCallback(String paymentHash, RoutePaymentConfig route, String status, String details)
                    throws IOException {
                gatewayCalls.incrementAndGet();
                beforeSettlement.run();
                settledFor.add(route.getPath());
                if (settlementFailure != null) {
                    throw settlementFailure;
                }
            }
        };
        filter = new PrismFilter(new PrismMiddleware(config, client));
    }

    private static String paidPremium() {
        return "Bearer " + TestProofs.forRoute("/api/premium");
    }

    private static final class Chain implements FilterChain {
        int calls;
        ServletResponse receivedResponse;
        String body = "premium content";
        int status = 200;
        boolean flushEarly;
        String redirect;
        Integer error;

        @Override
        public void doFilter(ServletRequest request, ServletResponse response) throws IOException {
            calls++;
            receivedResponse = response;
            HttpServletResponse http = (HttpServletResponse) response;
            if (redirect != null) {
                http.sendRedirect(redirect);
                return;
            }
            http.setStatus(status);
            http.setHeader("X-Handler", "ran");
            http.getWriter().write(body);
            if (flushEarly) {
                http.flushBuffer();
            }
            if (error != null) {
                http.sendError(error);
            }
        }
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "/app/api/premium|/api|/premium",
            "/app/api/%70remium|/api|/premium",
            "/app/api/premium;jsessionid=1|/api/premium|",
            "/app/api/%70remium;x=1|/api/premium|",
            "/app/api/premium|/api/premium|",
            "/api/premium|/api|/premium"
    })
    void protectedRouteRequiresPaymentForAnyRequestUriSpelling(String requestUri, String servletPath, String pathInfo) throws Exception {
        HttpServletRequest request = FakeServlet.request(requestUri, servletPath, pathInfo, "Bearer x");
        FakeServlet.Response response = FakeServlet.response();
        Chain chain = new Chain();

        filter.doFilter(request, response.proxy(), chain);

        assertEquals(402, response.status());
        assertEquals(0, chain.calls);
        assertEquals(0, settledFor.size());
        assertFalse(response.body().contains("premium content"));
    }

    @Test
    void theContextPathDoesNotHideAProtectedRoute() throws Exception {
        HttpServletRequest request = FakeServlet.request("/myapp/api/premium", "/api/premium", null, null);
        FakeServlet.Response response = FakeServlet.response();
        Chain chain = new Chain();

        filter.doFilter(request, response.proxy(), chain);

        assertEquals(402, response.status());
        assertEquals(0, chain.calls);
    }

    @Test
    void unprotectedRequestsPassThroughUntouchedAndNeverReachTheGateway() throws Exception {
        HttpServletRequest request = FakeServlet.request("/app/public/info", "/public", "/info", "Bearer app-session-token");
        FakeServlet.Response response = FakeServlet.response();
        Chain chain = new Chain();

        filter.doFilter(request, response.proxy(), chain);

        assertEquals(1, chain.calls);
        assertSame(response.proxy(), chain.receivedResponse);
        assertEquals(0, gatewayCalls.get());
        assertEquals(200, response.status());
        assertNull(response.header("X-Settlement"));
        assertEquals("premium content", response.body());
    }

    @Test
    void segmentBoundaryKeepsSiblingPathsUnprotected() throws Exception {
        HttpServletRequest request = FakeServlet.request("/api/premiumness", "/api", "/premiumness", null);
        FakeServlet.Response response = FakeServlet.response();
        Chain chain = new Chain();

        filter.doFilter(request, response.proxy(), chain);

        assertEquals(1, chain.calls);
        assertEquals(0, gatewayCalls.get());
    }

    @Test
    void aProofForACheapRouteDoesNotUnlockAnExpensiveOne() throws Exception {
        HttpServletRequest request = FakeServlet.request("/api/premium", "/api", "/premium", "Bearer " + TestProofs.forRoute("/api/cheap"));
        FakeServlet.Response response = FakeServlet.response();
        Chain chain = new Chain();

        filter.doFilter(request, response.proxy(), chain);

        assertEquals(402, response.status());
        assertEquals(0, chain.calls);
        assertEquals(List.of("/api/premium"), verifiedFor);
        assertEquals(0, settledFor.size());
    }

    @Test
    void verifiedPaymentIsSettledBeforeAnyByteIsSent() throws Exception {
        List<Integer> bytesSentAtSettlement = new ArrayList<>();
        FakeServlet.Response response = FakeServlet.response();
        beforeSettlement = () -> bytesSentAtSettlement.add(response.sentBytes());
        String proof = TestProofs.forRoute("/api/premium");
        HttpServletRequest request = FakeServlet.request("/api/premium", "/api", "/premium", "Bearer " + proof);
        Chain chain = new Chain();
        chain.flushEarly = true;

        filter.doFilter(request, response.proxy(), chain);

        assertEquals(1, chain.calls);
        assertEquals(List.of(0), bytesSentAtSettlement);
        assertEquals(List.of("/api/premium"), settledFor);
        assertEquals(200, response.status());
        assertEquals("settled", response.header("X-Settlement"));
        assertEquals("ran", response.header("X-Handler"));
        assertEquals("premium content", response.body());
    }

    @Test
    void failedSettlementReplacesTheResponseEvenAfterAnEarlyFlush() throws Exception {
        settlementFailure = new IOException("settlement rejected");
        HttpServletRequest request = FakeServlet.request("/api/premium", "/api", "/premium", paidPremium());
        FakeServlet.Response response = FakeServlet.response();
        Chain chain = new Chain();
        chain.flushEarly = true;

        filter.doFilter(request, response.proxy(), chain);

        assertEquals(402, response.status());
        assertTrue(response.body().contains("Payment settlement failed"));
        assertFalse(response.body().contains("premium content"));
        assertNull(response.header("X-Handler"));
        assertNull(response.header("X-Settlement"));
    }

    @Test
    void aRedirectIsNotSentBeforeSettlement() throws Exception {
        settlementFailure = new IOException("settlement rejected");
        HttpServletRequest request = FakeServlet.request("/api/premium", "/api", "/premium", paidPremium());
        FakeServlet.Response response = FakeServlet.response();
        Chain chain = new Chain();
        chain.redirect = "/somewhere";

        filter.doFilter(request, response.proxy(), chain);

        assertEquals(402, response.status());
        assertNull(response.header("Location"));
    }

    @Test
    void aSettledRedirectIsDelivered() throws Exception {
        HttpServletRequest request = FakeServlet.request("/api/premium", "/api", "/premium", paidPremium());
        FakeServlet.Response response = FakeServlet.response();
        Chain chain = new Chain();
        chain.redirect = "/somewhere";

        filter.doFilter(request, response.proxy(), chain);

        assertEquals(302, response.status());
        assertEquals("/somewhere", response.header("Location"));
        assertEquals(List.of("/api/premium"), settledFor);
    }

    @Test
    void errorResponsesAreNotSettled() throws Exception {
        HttpServletRequest request = FakeServlet.request("/api/premium", "/api", "/premium", paidPremium());
        FakeServlet.Response response = FakeServlet.response();
        Chain chain = new Chain();
        chain.status = 500;
        chain.body = "boom";

        filter.doFilter(request, response.proxy(), chain);

        assertEquals(500, response.status());
        assertEquals("boom", response.body());
        assertEquals(0, settledFor.size());
    }

    @Test
    void sendErrorDiscardsBufferedOutputAndIsNotSettled() throws Exception {
        HttpServletRequest request = FakeServlet.request("/api/premium", "/api", "/premium", paidPremium());
        FakeServlet.Response response = FakeServlet.response();
        Chain chain = new Chain();
        chain.body = "stale premium content";
        chain.error = 500;

        filter.doFilter(request, response.proxy(), chain);

        assertEquals(500, response.status());
        assertTrue(response.errorSent());
        assertEquals(0, response.sentBytes());
        assertEquals(0, settledFor.size());
    }

    @Test
    void sendErrorWithAnOkStatusIsNotSettled() throws Exception {
        HttpServletRequest request = FakeServlet.request("/api/premium", "/api", "/premium", paidPremium());
        FakeServlet.Response response = FakeServlet.response();
        Chain chain = new Chain();
        chain.error = 200;

        filter.doFilter(request, response.proxy(), chain);

        assertEquals(0, settledFor.size());
        assertNull(response.header("X-Settlement"));
    }

    @Test
    void bufferedOutputKeepsTheResponseCharacterEncoding() throws Exception {
        HttpServletRequest request = FakeServlet.request("/api/premium", "/api", "/premium", paidPremium());
        FakeServlet.Response response = FakeServlet.response();
        response.proxy().setCharacterEncoding("UTF-8");
        Chain chain = new Chain();
        chain.body = "café";

        filter.doFilter(request, response.proxy(), chain);

        assertArrayEquals("café".getBytes(StandardCharsets.UTF_8), response.sent());
    }

    @Test
    void invalidPathsAreRejectedWithoutReachingTheApplication() throws Exception {
        HttpServletRequest request = FakeServlet.request("/api/premium%00", "/api", "/premium\u0000", paidPremium());
        FakeServlet.Response response = FakeServlet.response();
        Chain chain = new Chain();

        filter.doFilter(request, response.proxy(), chain);

        assertEquals(400, response.status());
        assertEquals(0, chain.calls);
        assertEquals(0, gatewayCalls.get());
    }
}
