package org.fdtech.prism.servlet;

import org.fdtech.prism.core.PrismConfig;
import org.fdtech.prism.core.PrismDecision;
import org.fdtech.prism.core.PrismMiddleware;
import org.fdtech.prism.core.PrismResponse;

import javax.servlet.*;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import javax.servlet.http.HttpServletResponseWrapper;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.OutputStreamWriter;
import java.io.PrintWriter;
import java.nio.charset.Charset;
import java.util.Map;

/**
 * Servlet filter for handling Prism payment requirements.
 * This can be used with any servlet-based Java application (Tomcat, Jetty, etc.).
 */
public class PrismFilter implements Filter {
    private static final String REQUEST_SCOPE_ATTRIBUTE = PrismFilter.class.getName() + ".requestScope";

    private PrismMiddleware middleware;

    /**
     * Create filter with configuration.
     *
     * @param config Prism configuration
     */
    public PrismFilter(PrismConfig config) {
        this.middleware = new PrismMiddleware(config);
    }

    public PrismFilter(PrismMiddleware middleware) {
        this.middleware = middleware;
    }

    /**
     * Default constructor for servlet container instantiation.
     * Configuration must be provided via init parameters.
     */
    public PrismFilter() {
        // Will be initialized in init() method
    }

    @Override
    public void init(FilterConfig filterConfig) throws ServletException {
        if (middleware == null) {
            // Try to get config from init parameters
            String apiKey = filterConfig.getInitParameter("apiKey");
            String baseUrl = filterConfig.getInitParameter("baseUrl");

            if (apiKey == null || apiKey.isEmpty()) {
                throw new ServletException("Prism API key not configured");
            }

            PrismConfig.Builder builder = new PrismConfig.Builder()
                    .apiKey(apiKey);

            if (baseUrl != null && !baseUrl.isEmpty()) {
                builder.baseUrl(baseUrl);
            }

            // TODO: Parse route configurations from init parameters
            // For now, routes must be added programmatically

            middleware = new PrismMiddleware(builder.build());
        }
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        if (!(request instanceof HttpServletRequest) || !(response instanceof HttpServletResponse)) {
            chain.doFilter(request, response);
            return;
        }

        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        PrismDecision decision = middleware.handleRequest(
                routedPath(httpRequest),
                httpRequest.getHeader("Authorization"),
                requestScope(httpRequest)
        );

        PrismResponse prismResponse = decision.getResponse();
        if (prismResponse != null) {
            httpResponse.setStatus(prismResponse.getStatusCode());

            for (Map.Entry<String, String> header : prismResponse.getHeaders().entrySet()) {
                httpResponse.setHeader(header.getKey(), header.getValue());
            }

            httpResponse.getWriter().write(prismResponse.getBody());
            return;
        }

        if (!decision.requiresSettlement()) {
            chain.doFilter(request, response);
            return;
        }

        ResponseWrapper responseWrapper = new ResponseWrapper(httpResponse);

        chain.doFilter(request, responseWrapper);

        if (!responseWrapper.errorSent() && responseWrapper.getStatus() < 400) {
            String settlementHeader = middleware.settle(decision);

            if (settlementHeader == null) {
                httpResponse.reset();
                httpResponse.setStatus(402);
                httpResponse.setContentType("application/json");
                httpResponse.getWriter().write(
                    "{\"x402Version\":2," +
                    "\"error\":\"Payment settlement failed\"," +
                    "\"details\":\"Payment could not be settled. Please try again.\"}"
                );
                return;
            }

            httpResponse.setHeader("X-Settlement", settlementHeader);
        } else {
            middleware.release(decision);
        }

        responseWrapper.commit();
    }

    private static Object requestScope(HttpServletRequest request) {
        Object scope = request.getAttribute(REQUEST_SCOPE_ATTRIBUTE);
        if (scope == null) {
            scope = new Object();
            request.setAttribute(REQUEST_SCOPE_ATTRIBUTE, scope);
        }
        return scope;
    }

    private static String routedPath(HttpServletRequest request) {
        String servletPath = request.getServletPath();
        String pathInfo = request.getPathInfo();
        return (servletPath == null ? "" : servletPath) + (pathInfo == null ? "" : pathInfo);
    }

    /**
     * Response wrapper to capture output and delay sending
     */
    private static class ResponseWrapper extends HttpServletResponseWrapper {
        private final ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        private ServletOutputStream outputStream;
        private PrintWriter writer;
        private boolean errorSent;

        public ResponseWrapper(HttpServletResponse response) {
            super(response);
        }

        @Override
        public ServletOutputStream getOutputStream() {
            if (writer != null) {
                throw new IllegalStateException("getWriter() has already been called");
            }
            if (outputStream == null) {
                outputStream = new ServletOutputStream() {
                    @Override
                    public void write(int b) {
                        buffer.write(b);
                    }

                    @Override
                    public void write(byte[] bytes, int offset, int length) {
                        buffer.write(bytes, offset, length);
                    }

                    @Override
                    public boolean isReady() {
                        return true;
                    }

                    @Override
                    public void setWriteListener(WriteListener writeListener) {
                        // Not implemented
                    }
                };
            }
            return outputStream;
        }

        @Override
        public PrintWriter getWriter() {
            if (outputStream != null) {
                throw new IllegalStateException("getOutputStream() has already been called");
            }
            if (writer == null) {
                writer = new PrintWriter(new OutputStreamWriter(buffer, Charset.forName(getCharacterEncoding())));
            }
            return writer;
        }

        @Override
        public void flushBuffer() {
        }

        @Override
        public boolean isCommitted() {
            return false;
        }

        @Override
        public void resetBuffer() {
            buffer.reset();
            super.resetBuffer();
        }

        @Override
        public void reset() {
            buffer.reset();
            super.reset();
        }

        @Override
        public void sendRedirect(String location) {
            buffer.reset();
            setStatus(SC_FOUND);
            setHeader("Location", location);
        }

        @Override
        public void sendError(int statusCode) throws IOException {
            discardBufferedOutput();
            super.sendError(statusCode);
        }

        @Override
        public void sendError(int statusCode, String message) throws IOException {
            discardBufferedOutput();
            super.sendError(statusCode, message);
        }

        boolean errorSent() {
            return errorSent;
        }

        private void discardBufferedOutput() {
            if (writer != null) {
                writer.flush();
            }
            buffer.reset();
            errorSent = true;
        }

        public void commit() throws IOException {
            if (errorSent) {
                return;
            }
            if (writer != null) {
                writer.flush();
            }
            if (buffer.size() > 0) {
                getResponse().getOutputStream().write(buffer.toByteArray());
            }
            getResponse().flushBuffer();
        }
    }

    @Override
    public void destroy() {
        // Cleanup if needed
    }
}
