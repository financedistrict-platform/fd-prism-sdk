package org.fdtech.prism.core;

/**
 * Configuration for a route that requires payment.
 */
public class RoutePaymentConfig {
    private final String path;
    private final long price;
    private final String description;

    /**
     * Creates a new route payment configuration.
     *
     * @param path The route path (e.g., "/api/premium")
     * @param price The price in wei (as a long)
     * @param description Human-readable description of what the payment is for
     */
    public RoutePaymentConfig(String path, long price, String description) {
        if (path == null || path.isEmpty()) {
            throw new IllegalArgumentException("Path cannot be null or empty");
        }
        if (price < 0) {
            throw new IllegalArgumentException("Price cannot be negative");
        }
        if (description == null || description.isEmpty()) {
            throw new IllegalArgumentException("Description cannot be null or empty");
        }

        this.path = path;
        this.price = price;
        this.description = description;
    }

    public String getPath() {
        return path;
    }

    public long getPrice() {
        return price;
    }

    public String getDescription() {
        return description;
    }

    @Override
    public String toString() {
        return "RoutePaymentConfig{" +
                "path='" + path + '\'' +
                ", price=" + price +
                ", description='" + description + '\'' +
                '}';
    }
}
