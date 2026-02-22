import { PaymentRequiredResponse } from '../types';
import { PrismGatewayError, PrismNetworkError, PrismPaymentError } from '../types/errors';

/**
 * Response structure for middleware
 */
export interface MiddlewareResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
}

/**
 * Build 402 Payment Required response
 * 
 * @param requirements - Payment requirements from gateway
 * @returns Standard 402 response with headers
 */
export function build402Response(requirements: PaymentRequiredResponse): MiddlewareResponse {
  return {
    statusCode: 402,
    headers: {
      'X-PAYMENT-REQUIREMENTS': JSON.stringify(requirements),
      'Content-Type': 'application/json',
    },
    body: requirements,
  };
}

/**
 * Build error response based on error type
 * 
 * Handles:
 * - PrismGatewayError: Preserves status code, includes traceId
 * - PrismNetworkError: Returns 503 with retry-after
 * - PrismPaymentError: Returns 402 with error details
 * - Generic Error: Returns 500
 * 
 * @param error - Error object
 * @param context - Error context ('requirements' or 'payment')
 * @returns Formatted error response
 */
export function buildErrorResponse(
  error: any,
  context: 'requirements' | 'payment'
): MiddlewareResponse {
  // Handle PrismGatewayError
  if (error instanceof PrismGatewayError) {
    return {
      statusCode: error.statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: {
        x402Version: 1,
        error: context === 'requirements' ? error.message : 'Payment processing failed',
        details: error.details,
        gateway: {
          traceId: error.traceId,
          timestamp: error.timestamp,
        },
      },
    };
  }

  // Handle PrismNetworkError
  if (error instanceof PrismNetworkError) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: {
        x402Version: 1,
        error: 'Payment service unavailable',
        details: 'Could not connect to Prism Gateway. Please try again later.',
        retryAfter: 60,
      },
    };
  }

  // Handle PrismPaymentError
  if (error instanceof PrismPaymentError) {
    return {
      statusCode: 402,
      headers: { 'Content-Type': 'application/json' },
      body: {
        x402Version: 1,
        error: error.message,
        details: error.details,
      },
    };
  }

  // Generic error
  return {
    statusCode: 500,
    headers: { 'Content-Type': 'application/json' },
    body: {
      x402Version: 1,
      error: context === 'requirements'
        ? 'Failed to generate payment requirements'
        : 'Failed to process payment',
      details: error.message || 'An unexpected error occurred',
    },
  };
}

/**
 * Build invalid payment header response
 */
export function buildInvalidPaymentHeaderResponse(): MiddlewareResponse {
  return {
    statusCode: 400,
    headers: { 'Content-Type': 'application/json' },
    body: {
      x402Version: 1,
      error: 'Invalid payment header format',
      details: 'X-PAYMENT header must be valid JSON',
    },
  };
}

/**
 * Build invalid payment response
 */
export function buildInvalidPaymentResponse(error?: string): MiddlewareResponse {
  return {
    statusCode: 402,
    headers: { 'Content-Type': 'application/json' },
    body: {
      x402Version: 1,
      error: error || 'Invalid payment',
    },
  };
}
