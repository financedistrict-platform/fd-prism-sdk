package org.fdtech.prism.servlet;

import com.sun.net.httpserver.HttpServer;
import org.fdtech.prism.core.PrismConfig;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import javax.servlet.FilterChain;
import javax.servlet.ServletOutputStream;
import javax.servlet.WriteListener;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PrismFilterBufferingTest {
    private static final String SECRET = "{\"secret\":\"premium-data\"}";

    private HttpServer gateway;
    private final List<String> gatewayCalls = Collections.synchronizedList(new ArrayList<>());
    private volatile int settlementStatus = 200;
    private PrismFilter filter;

    @BeforeEach
    void startGateway() throws IOException {
        gateway = HttpServer.create(new InetSocketAddress(InetAddress.getLoopbackAddress(), 0), 0);
        gateway.createContext("/v1/verify-payment", exchange -> {
            gatewayCalls.add("/v1/verify-payment");
            reply(exchange, 200, "{\"valid\":true}");
        });
        gateway.createContext("/v1/get-payment-requirements", exchange -> {
            gatewayCalls.add("/v1/get-payment-requirements");
            reply(exchange, 200, "{}");
        });
        gateway.createContext("/v1/settlement-callback", exchange -> {
            gatewayCalls.add("/v1/settlement-callback");
            reply(exchange, settlementStatus, "{}");
        });
        gateway.start();

        PrismConfig config = new PrismConfig.Builder()
                .apiKey("gateway-key")
                .baseUrl("http://127.0.0.1:" + gateway.getAddress().getPort())
                .addRoute("/api/premium", 1000L, "Premium content")
                .build();
        filter = new PrismFilter(config);
    }

    @AfterEach
    void stopGateway() {
        gateway.stop(0);
    }

    @Test
    void unprotectedRouteNeverForwardsOrEchoesTheCallersBearerToken() throws Exception {
        FakeResponse response = new FakeResponse();

        filter.doFilter(request("/public", "Bearer user-session-token"), response.proxy(), servletWriting(SECRET, false));

        assertEquals(SECRET, response.body());
        assertTrue(gatewayCalls.isEmpty(), "gateway was called: " + gatewayCalls);
        assertNull(response.headers.get("X-Settlement"));
    }

    @Test
    void protectedRouteSettlesAndReturnsTheBufferedBody() throws Exception {
        FakeResponse response = new FakeResponse();

        filter.doFilter(request("/api/premium", "Bearer paid-proof"), response.proxy(), servletWriting(SECRET, false));

        assertEquals(SECRET, response.body());
        assertEquals("proof=paid-proof", response.headers.get("X-Settlement"));
        assertEquals(List.of("/v1/verify-payment", "/v1/settlement-callback"), gatewayCalls);
    }

    @Test
    void servletFlushDoesNotLeakContentBeforeSettlement() throws Exception {
        FakeResponse response = new FakeResponse();
        settlementStatus = 500;

        filter.doFilter(request("/api/premium", "Bearer paid-proof"), response.proxy(), servletWriting(SECRET, true));

        assertEquals(402, response.status);
        assertFalse(response.body().contains("premium-data"), "content leaked: " + response.body());
        assertTrue(response.body().contains("settlement failed"));
    }

    @Test
    void servletFlushDoesNotCommitTheResponseBeforeSettlement() throws Exception {
        FakeResponse response = new FakeResponse();
        List<Boolean> flushedBeforeSettlement = new ArrayList<>();
        FilterChain chain = (req, res) -> {
            res.getWriter().write(SECRET);
            res.flushBuffer();
            flushedBeforeSettlement.add(response.flushed);
        };

        filter.doFilter(request("/api/premium", "Bearer paid-proof"), response.proxy(), chain);

        assertEquals(List.of(false), flushedBeforeSettlement);
        assertEquals(SECRET, response.body());
    }

    private static void reply(com.sun.net.httpserver.HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    private FilterChain servletWriting(String body, boolean flush) {
        return (req, res) -> {
            res.getWriter().write(body);
            if (flush) {
                res.flushBuffer();
            }
        };
    }

    private HttpServletRequest request(String uri, String authorization) {
        InvocationHandler handler = (proxy, method, args) -> {
            switch (method.getName()) {
                case "getRequestURI":
                case "getServletPath":
                    return uri;
                case "getHeader":
                    return "Authorization".equalsIgnoreCase((String) args[0]) ? authorization : null;
                default:
                    return defaultValue(method);
            }
        };
        return (HttpServletRequest) Proxy.newProxyInstance(
                getClass().getClassLoader(), new Class<?>[]{HttpServletRequest.class}, handler);
    }

    private static Object defaultValue(Method method) {
        Class<?> type = method.getReturnType();
        if (type == boolean.class) {
            return false;
        }
        if (type == int.class) {
            return 0;
        }
        if (type == long.class) {
            return 0L;
        }
        return null;
    }

    private final class FakeResponse {
        final ByteArrayOutputStream sink = new ByteArrayOutputStream();
        final Map<String, String> headers = new HashMap<>();
        PrintWriter writer;
        int status = 200;
        boolean flushed;
        boolean committed;

        String body() {
            if (writer != null) {
                writer.flush();
            }
            return new String(sink.toByteArray(), StandardCharsets.UTF_8);
        }

        HttpServletResponse proxy() {
            InvocationHandler handler = (proxy, method, args) -> {
                switch (method.getName()) {
                    case "setStatus":
                        status = (Integer) args[0];
                        return null;
                    case "getStatus":
                        return status;
                    case "setHeader":
                        headers.put((String) args[0], (String) args[1]);
                        return null;
                    case "setContentType":
                        return null;
                    case "getCharacterEncoding":
                        return "UTF-8";
                    case "getOutputStream":
                        return new ServletOutputStream() {
                            @Override
                            public void write(int b) {
                                committed = true;
                                sink.write(b);
                            }

                            @Override
                            public boolean isReady() {
                                return true;
                            }

                            @Override
                            public void setWriteListener(WriteListener writeListener) {
                            }
                        };
                    case "getWriter":
                        if (writer == null) {
                            writer = new PrintWriter(new OutputStreamWriter(sink, StandardCharsets.UTF_8));
                        }
                        return writer;
                    case "flushBuffer":
                        flushed = true;
                        committed = true;
                        if (writer != null) {
                            writer.flush();
                        }
                        return null;
                    case "isCommitted":
                        return committed;
                    case "reset":
                        if (committed) {
                            throw new IllegalStateException("response already committed");
                        }
                        sink.reset();
                        headers.clear();
                        status = 200;
                        return null;
                    default:
                        return defaultValue(method);
                }
            };
            return (HttpServletResponse) Proxy.newProxyInstance(
                    getClass().getClassLoader(), new Class<?>[]{HttpServletResponse.class}, handler);
        }
    }
}
