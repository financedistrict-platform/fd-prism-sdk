package org.fdtech.prism.servlet;

import org.fdtech.prism.core.PrismConfig;
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
import java.util.Map;

/**
 * Servlet filter for handling Prism payment requirements.
 * This can be used with any servlet-based Java application (Tomcat, Jetty, etc.).
 */
public class PrismFilter implements Filter {
    private PrismMiddleware middleware;

    /**
     * Create filter with configuration.
     *
     * @param config Prism configuration
     */
    public PrismFilter(PrismConfig config) {
        this.middleware = new PrismMiddleware(config);
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

        // Get request path and Authorization header
        String path = httpRequest.getRequestURI();
        String authHeader = httpRequest.getHeader("Authorization");

        // Check if payment is required
        PrismResponse prismResponse = middleware.handleRequest(path, authHeader);

        if (prismResponse != null) {
            // Payment required - return 402
            httpResponse.setStatus(prismResponse.getStatusCode());
            
            for (Map.Entry<String, String> header : prismResponse.getHeaders().entrySet()) {
                httpResponse.setHeader(header.getKey(), header.getValue());
            }

            httpResponse.getWriter().write(prismResponse.getBody());
            return;
        }

        // Wrap response to capture output
        ResponseWrapper responseWrapper = new ResponseWrapper(httpResponse);
        
        // Continue to next filter/servlet
        chain.doFilter(request, responseWrapper);

        // Only proceed with settlement if response was successful
        if (responseWrapper.getStatus() < 400) {
            // Try to perform settlement
            String settlementHeader = middleware.getSettlementHeader(authHeader);
            
            if (settlementHeader == null) {
                // Settlement failed - DO NOT send data, return 402
                httpResponse.reset();
                httpResponse.setStatus(402);
                httpResponse.setContentType("application/json");
                httpResponse.getWriter().write(
                    "{\"x402Version\":1," +
                    "\"error\":\"Payment settlement failed\"," +
                    "\"details\":\"Payment could not be settled. Please try again.\"}"
                );
                return;
            }
            
            // Settlement succeeded - add header and send response
            httpResponse.setHeader("X-Settlement", settlementHeader);
        }
        
        // Copy wrapped response to actual response
        responseWrapper.flushBuffer();
    }

    /**
     * Response wrapper to capture output and delay sending
     */
    private static class ResponseWrapper extends HttpServletResponseWrapper {
        private ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        private PrintWriter writer;

        public ResponseWrapper(HttpServletResponse response) {
            super(response);
            writer = new PrintWriter(new OutputStreamWriter(outputStream));
        }

        @Override
        public ServletOutputStream getOutputStream() {
            return new ServletOutputStream() {
                @Override
                public void write(int b) {
                    outputStream.write(b);
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

        @Override
        public PrintWriter getWriter() {
            return writer;
        }

        public void flushBuffer() throws IOException {
            if (writer != null) {
                writer.flush();
            }
            if (outputStream.size() > 0) {
                getResponse().getOutputStream().write(outputStream.toByteArray());
            }
        }
    }

    @Override
    public void destroy() {
        // Cleanup if needed
    }
}
