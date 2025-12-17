package org.fdtech.prism.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Configuration for the Prism middleware.
 */
public class PrismConfig {
    private final String apiKey;
    private final String facilitatorUrl;
    private final List<RoutePaymentConfig> routes;

    private PrismConfig(Builder builder) {
        this.apiKey = builder.apiKey;
        this.facilitatorUrl = builder.facilitatorUrl;
        this.routes = Collections.unmodifiableList(new ArrayList<>(builder.routes));
    }

    public String getApiKey() {
        return apiKey;
    }

    public String getFacilitatorUrl() {
        return facilitatorUrl;
    }

    public List<RoutePaymentConfig> getRoutes() {
        return routes;
    }

    /**
     * Builder for PrismConfig.
     */
    public static class Builder {
        private String apiKey;
        private String facilitatorUrl = "https://facilitator.fdtech.org";
        private final List<RoutePaymentConfig> routes = new ArrayList<>();

        public Builder apiKey(String apiKey) {
            this.apiKey = apiKey;
            return this;
        }

        public Builder facilitatorUrl(String facilitatorUrl) {
            this.facilitatorUrl = facilitatorUrl;
            return this;
        }

        public Builder addRoute(RoutePaymentConfig route) {
            this.routes.add(route);
            return this;
        }

        public Builder addRoute(String path, long price, String description) {
            return addRoute(new RoutePaymentConfig(path, price, description));
        }

        public PrismConfig build() {
            if (apiKey == null || apiKey.isEmpty()) {
                throw new IllegalStateException("API key is required");
            }
            if (facilitatorUrl == null || facilitatorUrl.isEmpty()) {
                throw new IllegalStateException("Facilitator URL is required");
            }
            return new PrismConfig(this);
        }
    }
}
