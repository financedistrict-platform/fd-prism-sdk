/**
 * Base error class for all Prism SDK errors
 */
export class PrismError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'PrismError';

    // Maintain proper stack trace (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for API responses
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details
    };
  }
}

/**
 * Gateway returned an error (4xx, 5xx from Prism Gateway API)
 * 
 * @example
 * ```typescript
 * if (error instanceof PrismGatewayError) {
 *   console.log(`Gateway error: ${error.traceId}`);
 *   // Escalate to backend team if 500
 * }
 * ```
 */
export class PrismGatewayError extends PrismError {
  constructor(
    message: string,
    statusCode: number,
    public readonly traceId?: string,
    public readonly timestamp?: string,
    details?: any
  ) {
    super(message, 'GATEWAY_ERROR', statusCode, details);
    this.name = 'PrismGatewayError';
  }

  toJSON() {
    return {
      ...super.toJSON(),
      traceId: this.traceId,
      timestamp: this.timestamp
    };
  }
}

/**
 * Network/timeout issues (connection refused, DNS errors, timeout)
 * 
 * @example
 * ```typescript
 * if (error instanceof PrismNetworkError) {
 *   // Retry or show "service unavailable" message
 * }
 * ```
 */
export class PrismNetworkError extends PrismError {
  constructor(
    message: string,
    public readonly originalError: any
  ) {
    super(message, 'NETWORK_ERROR', 503, originalError);
    this.name = 'PrismNetworkError';
  }
}

/**
 * Invalid configuration (missing API key, invalid base URL, etc.)
 * 
 * @example
 * ```typescript
 * if (error instanceof PrismConfigError) {
 *   // Developer error - check configuration
 * }
 * ```
 */
export class PrismConfigError extends PrismError {
  constructor(message: string, details?: any) {
    super(message, 'CONFIG_ERROR', 500, details);
    this.name = 'PrismConfigError';
  }
}

/**
 * Invalid payment header/payload
 * 
 * @example
 * ```typescript
 * if (error instanceof PrismPaymentError) {
 *   // Invalid payment from client
 *   return res.status(402).json({ error: error.message });
 * }
 * ```
 */
export class PrismPaymentError extends PrismError {
  constructor(message: string, details?: any) {
    super(message, 'PAYMENT_ERROR', 402, details);
    this.name = 'PrismPaymentError';
  }
}

/**
 * Validation error (invalid request data)
 */
export class PrismValidationError extends PrismError {
  constructor(message: string, public readonly field?: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'PrismValidationError';
  }

  toJSON() {
    return {
      ...super.toJSON(),
      field: this.field
    };
  }
}
