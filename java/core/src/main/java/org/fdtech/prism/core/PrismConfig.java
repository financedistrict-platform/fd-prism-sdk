package org.fdtech.prism.core;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Configuration for the Prism middleware.
 */
public class PrismConfig {
    private final String apiKey;
    private final String baseUrl;
    private final List<RoutePaymentConfig> routes;

    private PrismConfig(Builder builder) {
        this.apiKey = builder.apiKey;
        this.baseUrl = builder.baseUrl;
        this.routes = Collections.unmodifiableList(new ArrayList<>(builder.routes));
    }

    public String getApiKey() {
        return apiKey;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public List<RoutePaymentConfig> getRoutes() {
        return routes;
    }

    /**
     * Builder for PrismConfig.
     */
    public static class Builder {
        private String apiKey;
        private String baseUrl = "https://prism-gw.test.1stdigital.tech";
        private final List<RoutePaymentConfig> routes = new ArrayList<>();

        public Builder apiKey(String apiKey) {
            this.apiKey = apiKey;
            return this;
        }

        public Builder baseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
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
            if (baseUrl == null || baseUrl.isEmpty()) {
                throw new IllegalStateException("Base URL is required");
            }
            return new PrismConfig(this);
        }
    }
}
