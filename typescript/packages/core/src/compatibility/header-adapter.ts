/**
 * Header Adapter: v1 ↔ v2
 * 
 * Handles HTTP header name differences between protocol versions
 * v1: X-PAYMENT, X-PAYMENT-RESPONSE
 * v2: PAYMENT-SIGNATURE, PAYMENT-REQUIRED, PAYMENT-RESPONSE
 */

import { V1_HEADERS } from '../types/v1';
import { V2_HEADERS } from '../types/v2';

/**
 * Header names for both protocol versions
 */
export interface HeaderNames {
  /** Header for sending payment payload */
  paymentSignature: string;

  /** Header for sending payment requirements (v2 only) */
  paymentRequired?: string;

  /** Header for sending settlement response */
  paymentResponse: string;
}

/**
 * Get header names for a specific protocol version
 */
export function getHeaderNames(version: 1 | 2): HeaderNames {
  if (version === 1) {
    return {
      paymentSignature: V1_HEADERS.PAYMENT,
      paymentResponse: V1_HEADERS.PAYMENT_RESPONSE,
    };
  } else {
    return {
      paymentSignature: V2_HEADERS.PAYMENT_SIGNATURE,
      paymentRequired: V2_HEADERS.PAYMENT_REQUIRED,
      paymentResponse: V2_HEADERS.PAYMENT_RESPONSE,
    };
  }
}

/**
 * Header Adapter class for reading/writing protocol headers
 */
export class HeaderAdapter {
  /**
   * Read payment payload from request headers (supports both v1 and v2)
   * 
   * @param getHeader - Function to get header value by name
   * @returns Base64-encoded payment payload, or null if not found
   */
  static getPaymentPayload(getHeader: (name: string) => string | null): string | null {
    // Try v2 first (default)
    const v2Payload = getHeader(V2_HEADERS.PAYMENT_SIGNATURE);
    if (v2Payload) {
      return v2Payload;
    }

    // Fallback to v1
    const v1Payload = getHeader(V1_HEADERS.PAYMENT);
    if (v1Payload) {
      return v1Payload;
    }

    return null;
  }

  /**
   * Set payment payload in request headers
   * 
   * @param setHeader - Function to set header value
   * @param payload - Base64-encoded payment payload
   * @param version - Protocol version (defaults to 2)
   */
  static setPaymentPayload(
    setHeader: (name: string, value: string) => void,
    payload: string,
    version: 1 | 2 = 2
  ): void {
    const headerName = version === 2
      ? V2_HEADERS.PAYMENT_SIGNATURE
      : V1_HEADERS.PAYMENT;

    setHeader(headerName, payload);
  }

  /**
   * Set payment requirements in response headers (v2 only)
   * 
   * @param setHeader - Function to set header value
   * @param requirements - Base64-encoded payment requirements
   * @param version - Protocol version
   */
  static setPaymentRequired(
    setHeader: (name: string, value: string) => void,
    requirements: string,
    version: 1 | 2 = 2
  ): void {
    if (version === 2) {
      setHeader(V2_HEADERS.PAYMENT_REQUIRED, requirements);
    }
    // v1 uses response body instead, no header needed
  }

  /**
   * Read settlement response from response headers (supports both v1 and v2)
   * 
   * @param getHeader - Function to get header value by name
   * @returns Base64-encoded settlement response, or null if not found
   */
  static getSettlementResponse(getHeader: (name: string) => string | null): string | null {
    // Try v2 first (default)
    const v2Response = getHeader(V2_HEADERS.PAYMENT_RESPONSE);
    if (v2Response) {
      return v2Response;
    }

    // Fallback to v1
    const v1Response = getHeader(V1_HEADERS.PAYMENT_RESPONSE);
    if (v1Response) {
      return v1Response;
    }

    return null;
  }

  /**
   * Set settlement response in response headers
   * 
   * @param setHeader - Function to set header value
   * @param response - Base64-encoded settlement response
   * @param version - Protocol version (defaults to 2)
   */
  static setSettlementResponse(
    setHeader: (name: string, value: string) => void,
    response: string,
    version: 1 | 2 = 2
  ): void {
    const headerName = version === 2
      ? V2_HEADERS.PAYMENT_RESPONSE
      : V1_HEADERS.PAYMENT_RESPONSE;

    setHeader(headerName, response);
  }

  /**
   * Detect protocol version from request headers
   * 
   * @param getHeader - Function to get header value by name
   * @returns Protocol version (1 or 2), or null if no payment header found
   */
  static detectVersionFromHeaders(getHeader: (name: string) => string | null): 1 | 2 | null {
    // Check for v2 headers first
    if (getHeader(V2_HEADERS.PAYMENT_SIGNATURE)) {
      return 2;
    }

    // Check for v1 headers
    if (getHeader(V1_HEADERS.PAYMENT)) {
      return 1;
    }

    return null;
  }

  /**
   * Get all possible payment header names (for middleware inspection)
   */
  static getAllPaymentHeaders(): string[] {
    return [
      V2_HEADERS.PAYMENT_SIGNATURE,
      V1_HEADERS.PAYMENT,
    ];
  }

  /**
   * Get all possible response header names (for middleware inspection)
   */
  static getAllResponseHeaders(): string[] {
    return [
      V2_HEADERS.PAYMENT_RESPONSE,
      V1_HEADERS.PAYMENT_RESPONSE,
      V2_HEADERS.PAYMENT_REQUIRED,
    ];
  }
}
