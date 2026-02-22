package org.fdtech.prism.examples.servlet;

import org.eclipse.jetty.server.Server;
import org.eclipse.jetty.servlet.FilterHolder;
import org.eclipse.jetty.servlet.ServletContextHandler;
import org.eclipse.jetty.servlet.ServletHolder;
import org.fdtech.prism.core.PrismConfig;
import org.fdtech.prism.servlet.PrismFilter;

import javax.servlet.DispatcherType;
import javax.servlet.http.HttpServlet;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.EnumSet;

/**
 * Basic example of using Prism SDK with raw servlets and Jetty.
 */
public class BasicServletExample {

    public static void main(String[] args) throws Exception {
        // 1. Configure Prism
        PrismConfig config = new PrismConfig.Builder()
                .apiKey("your-api-key-here")
                .baseUrl("https://prism-gw.test.1stdigital.tech")
                .addRoute("/api/premium", 1000L, "Access to premium content")
                .addRoute("/content/exclusive", 500L, "Exclusive articles and videos")
                .build();

        // 2. Create Jetty server
        Server server = new Server(8080);
        ServletContextHandler context = new ServletContextHandler(ServletContextHandler.SESSIONS);
        context.setContextPath("/");
        server.setHandler(context);

        // 3. Register Prism filter
        FilterHolder prismFilterHolder = new FilterHolder(new PrismFilter(config));
        context.addFilter(prismFilterHolder, "/*", EnumSet.of(DispatcherType.REQUEST));

        // 4. Register example servlets
        context.addServlet(new ServletHolder(new PublicServlet()), "/");
        context.addServlet(new ServletHolder(new PremiumServlet()), "/api/premium");
        context.addServlet(new ServletHolder(new ExclusiveServlet()), "/content/exclusive");

        // 5. Start server
        server.start();
        System.out.println("Server started at http://localhost:8080");
        System.out.println("Try:");
        System.out.println("  - http://localhost:8080/ (public, no payment)");
        System.out.println("  - http://localhost:8080/api/premium (requires payment: 1000 wei)");
        System.out.println("  - http://localhost:8080/content/exclusive (requires payment: 500 wei)");
        server.join();
    }

    /**
     * Public endpoint - no payment required.
     */
    public static class PublicServlet extends HttpServlet {
        @Override
        protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
            resp.setContentType("application/json");
            resp.getWriter().write("{\"message\":\"This is public content - no payment required\"}");
        }
    }

    /**
     * Premium endpoint - requires payment.
     */
    public static class PremiumServlet extends HttpServlet {
        @Override
        protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
            resp.setContentType("application/json");
            resp.getWriter().write("{\"message\":\"Welcome to premium content!\",\"data\":\"Secret premium data...\"}");
        }
    }

    /**
     * Exclusive endpoint - requires payment.
     */
    public static class ExclusiveServlet extends HttpServlet {
        @Override
        protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
            resp.setContentType("application/json");
            resp.getWriter().write("{\"message\":\"Exclusive articles\",\"articles\":[\"Article 1\",\"Article 2\"]}");
        }
    }
}
