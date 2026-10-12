package org.fdtech.prism.core;

import java.io.IOException;

public class PrismGatewayException extends IOException {
    private final int statusCode;

    public PrismGatewayException(String message, int statusCode) {
        super(message);
        this.statusCode = statusCode;
    }

    public int getStatusCode() {
        return statusCode;
    }

    public boolean isDefiniteRefusal() {
        return statusCode >= 400 && statusCode < 500;
    }
}
