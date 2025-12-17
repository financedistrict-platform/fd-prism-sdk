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
     * API key for authenticating with the facilitator.
     */
    private String apiKey;

    /**
     * Facilitator URL (defaults to https://facilitator.fdtech.org).
     */
    private String facilitatorUrl = "https://facilitator.fdtech.org";

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

    public String getFacilitatorUrl() {
        return facilitatorUrl;
    }

    public void setFacilitatorUrl(String facilitatorUrl) {
        this.facilitatorUrl = facilitatorUrl;
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
