import { PrismClient } from '../client/prism-client';
import {
  PrismMiddlewareConfig,
  RoutesConfig,
  PaymentRequirementsRequest,
  PaymentPayload,
  ConfigurationMode,
} from '../types';
import {
  parsePrice,
  findMatchingRoute,
  build402Response,
  buildErrorResponse,
  buildInvalidPaymentHeaderResponse,
  buildInvalidPaymentResponse,
  findRequirementForPayment,
  validatePaymentBinding,
  validatePaymentWindow,
  validatePaymentResource,
  type MiddlewareResponse,
} from '../utils';
import {
  detectProtocolVersion,
  getDeclaredProtocolVersion,
} from '../compatibility';
import type { PaymentPayloadV1 } from '../types/v1';
import type { PaymentPayload as PaymentPayloadV2 } from '../types/v2';

/**
 * Result of middleware processing
 */
export interface MiddlewareResult {
  /** Whether middleware handled the request (sent response) */
  handled: boolean;
  /** HTTP status code (if handled) */
  statusCode?: number;
  /** Response headers (if handled) */
  headers?: Record<string, string>;
  /** Response body (if handled) */
  body?: any;
  /** Payment information (if payment verified) */
  paymentInfo?: {
    payment: PaymentPayload;
    payer: string;
    paymentRequirements: any;
  };
}

/**
 * Request data for middleware processing
 */
export interface MiddlewareRequestData {
  /** Request path (e.g., "/api/premium") */
  path: string;
  /** Payment header value (supports both X-PAYMENT and PAYMENT-SIGNATURE) */
  paymentHeader?: string;
  /** Full resource URL */
  resourceUrl: string;
  /** Protocol version (1 or 2, auto-detected if not provided) */
  protocolVersion?: 1 | 2;
}

/**
 * Core middleware logic for Prism payment processing
 * 
 * This class encapsulates all the common middleware logic that is shared
 * across different framework implementations (Express, HTTP, Fastify, etc.)
 * 
 * @example
 * ```typescript
 * const core = new PrismMiddlewareCore(
 *   { apiKey: 'test-key' },
 *   { '/api/premium': { price: 0.01 } }
 * );
 * 
 * const result = await core.handleRequest({
 *   path: '/api/premium',
 *   paymentHeader: req.headers['x-payment'],
 *   resourceUrl: 'http://localhost/api/premium'
 * });
 * 
 * if (result.handled) {
 *   // Send response
 * } else if (result.paymentInfo) {
 *   // Payment verified, continue
 * }
 * ```
 */
export class PrismMiddlewareCore {
  private readonly mode: ConfigurationMode = 'on-demand';
  private readonly client: PrismClient;
  private readonly debug: boolean;
  private readonly defaultProtocolVersion: 1 | 2 = 2; // v2 is default
  private readonly allowedVersions: (1 | 2)[];
  private static readonly MAX_PAYMENT_HEADER_BYTES = 8192; // ~10× real x402 payload size

  constructor(
    private readonly config: PrismMiddlewareConfig,
    private readonly routes: RoutesConfig
  ) {
    this.debug = config.debug || false;
    // Use injected client if provided (for testing), otherwise create new one
    this.client = config.client || new PrismClient(config);
    // Allow configuration to override default protocol version
    if (config.x402Version === 1 || config.x402Version === 2) {
      this.defaultProtocolVersion = config.x402Version;
    }
    // Allowed versions whitelist — default to v2 only
    this.allowedVersions = config.allowedVersions ?? [2];
  }

  /**
   * Handle incoming request
   * 
   * @param requestData - Request data (path, payment header, resource URL)
   * @returns Middleware result indicating how to proceed
   */
  async handleRequest(requestData: MiddlewareRequestData): Promise<MiddlewareResult> {
    const { path, paymentHeader, resourceUrl } = requestData;

    // Detect protocol version from payment header or use default
    let protocolVersion = requestData.protocolVersion || this.defaultProtocolVersion;

    if (paymentHeader && !requestData.protocolVersion) {
      const detected = detectProtocolVersion(paymentHeader);
      if (detected) {
        protocolVersion = detected;
      }
    }

    if (this.debug) {
      console.log('[PrismMiddlewareCore] handleRequest:', {
        path,
        hasPaymentHeader: !!paymentHeader,
        resourceUrl,
        protocolVersion
      });
    }

    // Check if current route matches any configured payment route
    const matchedRoute = findMatchingRoute(path, this.routes);

    if (!matchedRoute) {
      if (this.debug) {
        console.log('[PrismMiddlewareCore] No matching route found, allowing request');
      }
      // Route doesn't require payment, allow request to continue
      return { handled: false };
    }

    if (this.debug) {
      console.log('[PrismMiddlewareCore] Matched route:', matchedRoute);
    }

    const routeConfig = this.routes[matchedRoute];

    // No payment header provided
    if (!paymentHeader) {
      if (this.debug) {
        console.log('[PrismMiddlewareCore] No payment header, returning 402');
      }
      return this.handleNoPayment(routeConfig, resourceUrl, protocolVersion);
    }

    // Payment header provided, verify it
    if (this.debug) {
      console.log('[PrismMiddlewareCore] Payment header present, verifying...');
    }
    return this.handlePaymentVerification(paymentHeader, routeConfig, resourceUrl, protocolVersion);
  }

  /**
   * Handle request without payment (return 402 with requirements)
   */
  private async handleNoPayment(
    routeConfig: any,
    resourceUrl: string,
    protocolVersion: 1 | 2
  ): Promise<MiddlewareResult> {
    try {
      let paymentRequirements;

      if (this.mode === 'on-demand') {
        // Call Prism Gateway API for payment requirements
        const price = parsePrice(routeConfig.price);

        if (this.debug) {
          console.log('[PrismMiddlewareCore] Parsed price:', price, 'from:', routeConfig.price);
        }

        const request: PaymentRequirementsRequest = {
          resourceUrl,
          requestedAmount: price,
          description: routeConfig.description || 'Payment required',
          mimeType: routeConfig.mimeType || 'application/json',
        };

        if (this.debug) {
          console.log('[PrismMiddlewareCore] Calling getPaymentRequirements with:', request);
        }

        paymentRequirements = await this.client.getPaymentRequirements(request);
      }

      // Ensure payment requirements were generated
      if (!paymentRequirements) {
        throw new Error('Failed to generate payment requirements');
      }

      // Gateway now returns data in the format matching the protocol version
      // No transformation needed since PrismClient uses /api/v{version}/ endpoint
      if (this.debug) {
        console.log('[PrismMiddlewareCore] Returning 402 with requirements (v' + protocolVersion + ')');
      }

      // Return 402 Payment Required
      const response = build402Response(paymentRequirements as any, protocolVersion);
      return {
        handled: true,
        ...response,
      };
    } catch (error: any) {
      console.error('Error generating payment requirements:', error);

      // Build appropriate error response
      const response = buildErrorResponse(error, 'requirements', protocolVersion);
      return {
        handled: true,
        ...response,
      };
    }
  }

  /**
   * Handle payment verification
   */
  private async handlePaymentVerification(
    paymentHeader: string,
    routeConfig: any,
    resourceUrl: string,
    protocolVersion: 1 | 2
  ): Promise<MiddlewareResult> {
    try {
      // Decode and parse payment header (supports both v1 and v2)
      const paymentPayload = this.decodePaymentHeader(paymentHeader);
      if (!paymentPayload) {
        const response = buildInvalidPaymentHeaderResponse(protocolVersion);
        return {
          handled: true,
          ...response,
        };
      }

      const payloadVersion = getDeclaredProtocolVersion(paymentPayload);
      if (!payloadVersion || !this.allowedVersions.includes(payloadVersion)) {
        if (this.debug) {
          console.log(`[PrismMiddlewareCore] Protocol version ${payloadVersion} not in allowedVersions: [${this.allowedVersions}]`);
        }
        const response = buildInvalidPaymentResponse(
          `Protocol version ${payloadVersion ?? 'unknown'} is not accepted`,
          this.defaultProtocolVersion
        );
        return { handled: true, ...response };
      }
      if (payloadVersion !== protocolVersion) {
        if (this.debug) {
          console.log(`[PrismMiddlewareCore] Protocol version mismatch: expected ${protocolVersion}, using client version ${payloadVersion}`);
        }
        protocolVersion = payloadVersion;
      }

      if (this.debug) {
        // Redact EIP-712 signature to prevent credential exposure in logs
        const safePayload = (paymentPayload as any)?.payload
          ? { ...(paymentPayload as any), payload: { ...(paymentPayload as any).payload, signature: '[REDACTED]' } }
          : paymentPayload;
        console.log('[PrismMiddlewareCore] Parsed payment payload (v' + protocolVersion + '):', safePayload);
      }

      // Reconstruct payment requirements for verification
      const price = parsePrice(routeConfig.price);

      if (this.debug) {
        console.log('[PrismMiddlewareCore] Reconstructing payment requirements with price:', price);
      }

      const request: PaymentRequirementsRequest = {
        resourceUrl,
        requestedAmount: price,
        description: routeConfig.description || 'Payment required',
        mimeType: routeConfig.mimeType || 'application/json',
      };

      // Get payment requirements for verification and settlement
      const paymentRequirementsResponse = await this.client.getPaymentRequirements(request);

      // Find the payment requirement that matches the client's payment
      const paymentRequirements = findRequirementForPayment(
        paymentRequirementsResponse.accepts,
        paymentPayload as any
      );

      if (!paymentRequirements) {
        if (this.debug) {
          // Redact EIP-712 signature to prevent credential exposure in logs
          const safePayload = (paymentPayload as any)?.payload
            ? { ...(paymentPayload as any), payload: { ...(paymentPayload as any).payload, signature: '[REDACTED]' } }
            : paymentPayload;
          console.log('[PrismMiddlewareCore] No matching payment requirement found for payment:', safePayload);
        }
        const response = buildInvalidPaymentResponse('No matching payment requirement found for the provided payment', protocolVersion);
        return {
          handled: true,
          ...response,
        };
      }

      const mismatch =
        validatePaymentBinding(paymentPayload as any, paymentRequirements) ??
        validatePaymentResource(
          paymentPayload as any,
          paymentRequirementsResponse.resource?.url ?? resourceUrl
        ) ??
        validatePaymentWindow(paymentPayload as any, Math.floor(Date.now() / 1000));

      if (mismatch) {
        if (this.debug) {
          console.log('[PrismMiddlewareCore] Payment rejected locally:', mismatch);
        }
        const response = buildInvalidPaymentResponse(mismatch, protocolVersion);
        return {
          handled: true,
          ...response,
        };
      }

      // Verify payment with Gateway
      const verificationResult = await this.client.verifyPayment(paymentPayload as any, paymentRequirements);

      if (!verificationResult.isValid) {
        if (this.debug) {
          console.log('[PrismMiddlewareCore] Payment verification failed:', verificationResult.error);
        }
        const response = buildInvalidPaymentResponse(verificationResult.error, protocolVersion);
        return {
          handled: true,
          ...response,
        };
      }

      if (this.debug) {
        console.log('[PrismMiddlewareCore] Payment verified successfully, payer:', verificationResult.payer);
      }

      // Payment is valid, allow request to continue
      return {
        handled: false,
        paymentInfo: {
          payment: paymentPayload as PaymentPayloadV2,
          payer: verificationResult.payer!,
          paymentRequirements,
        },
      };
    } catch (error: any) {
      console.error('Error processing payment:', error);

      // Build appropriate error response
      const response = buildErrorResponse(error, 'payment', protocolVersion);
      return {
        handled: true,
        ...response,
      };
    }
  }

  /**
   * Decode and parse payment header (supports both v1 and v2, base64 encoded JSON)
   * 
   * @param paymentHeader - Base64 encoded payment header
   * @returns Parsed PaymentPayload or null if invalid
   */
  private decodePaymentHeader(paymentHeader: string): PaymentPayload | PaymentPayloadV1 | null {
    // Reject oversized headers before decoding to prevent memory exhaustion
    if (paymentHeader.length > PrismMiddlewareCore.MAX_PAYMENT_HEADER_BYTES) {
      if (this.debug) {
        console.log(`[PrismMiddlewareCore] Payment header too large: ${paymentHeader.length} bytes (max ${PrismMiddlewareCore.MAX_PAYMENT_HEADER_BYTES})`);
      }
      return null;
    }
    try {
      // Decode base64 to string, then parse JSON
      const decodedString = Buffer.from(paymentHeader, 'base64').toString('utf-8');
      const paymentPayload = JSON.parse(decodedString);

      if (!this.isValidPaymentPayloadShape(paymentPayload)) {
        if (this.debug) {
          console.log('[PrismMiddlewareCore] Payment header failed structural validation');
        }
        return null;
      }

      return paymentPayload;
    } catch (error: any) {
      if (this.debug) {
        console.log('[PrismMiddlewareCore] Failed to decode/parse payment header:', error.message);
      }
      return null;
    }
  }

  /**
   * Validate the structural shape of a decoded payment payload (v1 or v2)
   * before it is trusted anywhere downstream.
   *
   * @param obj - Parsed JSON value from the payment header
   * @returns true if the shape is a valid v1 or v2 payment payload
   */
  private isValidPaymentPayloadShape(obj: unknown): boolean {
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      return false;
    }

    const candidate = obj as Record<string, any>;

    const isNonEmptyString = (value: unknown): boolean =>
      typeof value === 'string' && value.length > 0;

    const isValidAuthorization = (authorization: unknown): boolean => {
      if (typeof authorization !== 'object' || authorization === null || Array.isArray(authorization)) {
        return false;
      }
      const auth = authorization as Record<string, any>;
      return (
        isNonEmptyString(auth.from) &&
        isNonEmptyString(auth.to) &&
        isNonEmptyString(auth.value) &&
        isNonEmptyString(auth.validAfter) &&
        isNonEmptyString(auth.validBefore) &&
        isNonEmptyString(auth.nonce)
      );
    };

    const isValidPayload = (payload: unknown): boolean => {
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        return false;
      }
      const p = payload as Record<string, any>;
      return isNonEmptyString(p.signature) && isValidAuthorization(p.authorization);
    };

    if (candidate.x402Version === 2) {
      const accepted = candidate.accepted;
      if (typeof accepted !== 'object' || accepted === null || Array.isArray(accepted)) {
        return false;
      }
      return (
        isNonEmptyString(accepted.scheme) &&
        isNonEmptyString(accepted.network) &&
        isNonEmptyString(accepted.asset) &&
        isValidPayload(candidate.payload)
      );
    }

    // v1 (flat shape)
    return (
      isNonEmptyString(candidate.scheme) &&
      isNonEmptyString(candidate.network) &&
      isValidPayload(candidate.payload)
    );
  }

  /**
   * Settlement callback - call this after successful response
   * 
   * @param paymentPayload - Payment payload
   * @param paymentRequirements - Payment requirements
   * @param statusCode - Response status code
   * @returns Settlement result with transaction hash if successful
   */
  async settlementCallback(
    paymentPayload: PaymentPayload,
    paymentRequirements: any,
    statusCode: number
  ): Promise<{ success: boolean; transaction?: string; payer?: string; network?: string; errorReason?: string } | null> {
    // Only settle if response was successful (< 400)
    if (statusCode >= 400) {
      return null;
    }

    const mismatch = validatePaymentBinding(paymentPayload as any, paymentRequirements);
    if (mismatch) {
      console.error('Settlement refused:', mismatch);
      return { success: false, errorReason: mismatch };
    }

    try {
      const settlementResult = await this.client.settlePayment(paymentPayload, paymentRequirements);

      if (settlementResult.success && settlementResult.transaction) {
        console.log(
          `Payment settled: ${settlementResult.transaction} on ${settlementResult.network || 'unknown'} by ${settlementResult.payer}`
        );
      } else if (settlementResult.errorReason) {
        console.error('Settlement failed:', settlementResult.errorReason);
      }

      return settlementResult;
    } catch (error: any) {
      console.error('Error during settlement:', error);
      return null;
    }
  }
}
