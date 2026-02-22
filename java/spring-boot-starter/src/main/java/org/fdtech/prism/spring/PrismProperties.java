package org.fdtech.prism.spring;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

/**
 * Configuration properties for Prism SDK.
 * Binds to application.properties/yml with prefix "prism".
 */
@ConfigurationProperties(prefix = "prism")
public class PrismProperties {
    
    /**
     * API key for authenticating with the Prism Gateway.
     */
    private String apiKey;

    /**
     * Gateway base URL (defaults to https://prism-gw.test.1stdigital.tech).
     */
    private String baseUrl = "https://prism-gw.test.1stdigital.tech";

    /**
     * List of routes that require payment.
     */
    private List<RouteConfig> routes = new ArrayList<>();

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public List<RouteConfig> getRoutes() {
        return routes;
    }

    public void setRoutes(List<RouteConfig> routes) {
        this.routes = routes;
    }

    /**
     * Configuration for a single route.
     */
    public static class RouteConfig {
        private String path;
        private long price;
        private String description;

        public String getPath() {
            return path;
        }

        public void setPath(String path) {
            this.path = path;
        }

        public long getPrice() {
            return price;
        }

        public void setPrice(long price) {
            this.price = price;
        }

        public String getDescription() {
            return description;
        }

        public void setDescription(String description) {
            this.description = description;
        }
    }
}
