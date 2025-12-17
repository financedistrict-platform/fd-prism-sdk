package org.fdtech.prism.servlet;

import org.fdtech.prism.core.PrismConfig;
import org.fdtech.prism.core.PrismMiddleware;
import org.fdtech.prism.core.PrismResponse;

import javax.servlet.*;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
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
            String facilitatorUrl = filterConfig.getInitParameter("facilitatorUrl");

            if (apiKey == null || apiKey.isEmpty()) {
                throw new ServletException("Prism API key not configured");
            }

            PrismConfig.Builder builder = new PrismConfig.Builder()
                    .apiKey(apiKey);

            if (facilitatorUrl != null && !facilitatorUrl.isEmpty()) {
                builder.facilitatorUrl(facilitatorUrl);
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

        // Continue to next filter/servlet
        chain.doFilter(request, response);

        // Add settlement header to response
        String settlementHeader = middleware.getSettlementHeader(authHeader);
        if (settlementHeader != null) {
            httpResponse.setHeader("X-Settlement", settlementHeader);
        }
    }

    @Override
    public void destroy() {
        // Cleanup if needed
    }
}
