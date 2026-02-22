import axios, { AxiosInstance } from 'axios';
import {
  AuthInfoResponse,
  PaymentRequirementsRequest,
  PaymentRequiredResponse,
  PaymentRequirements,
  PaymentPayload,
  PrismMiddlewareConfig,
} from '../types';
import {
  PrismError,
  PrismGatewayError,
  PrismNetworkError,
  PrismConfigError,
} from '../types/errors';

/**
 * Client for interacting with Prism Gateway API
 */
export class PrismClient {
  private client: AxiosInstance;
  private apiKey: string;
  private debug: boolean;
  private protocolVersion: 1 | 2;
  private static readonly DEFAULT_BASE_URL = 'https://prism-gw.test.1stdigital.tech';

  constructor(config: PrismMiddlewareConfig) {
    this.apiKey = config.apiKey;
    this.debug = config.debug || false;
    this.protocolVersion = config.x402Version || 2; // Default to v2

    // Use provided baseUrl or default to test environment
    const baseUrl = config.baseUrl || PrismClient.DEFAULT_BASE_URL;

    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Handle Axios errors and convert to structured Prism errors
   */
  private handleError(error: any, context: string): never {
    // Axios error with response from server (4xx, 5xx)
    if (error.response) {
      const { status, data } = error.response;

      // Extract error details from RFC 7807 Problem Details format
      const message = data.title || data.error || `${context} failed`;
      const details = data.detail;
      const traceId = data.traceId;
      const timestamp = data.timestamp;

      throw new PrismGatewayError(
        message,
        status,
        traceId,
        timestamp,
        details
      );
    }

    // Network error (timeout, connection refused, DNS error, etc.)
    if (error.request) {
      throw new PrismNetworkError(
        `Failed to reach Prism Gateway: ${error.message}`,
        error
      );
    }

    // Request setup error (invalid config, etc.)
    if (error.code === 'ERR_BAD_OPTION_VALUE' || error.code === 'ERR_BAD_OPTION') {
      throw new PrismConfigError(
        `Invalid Prism client configuration: ${error.message}`,
        error
      );
    }

    // Unknown error
    throw new PrismError(
      error.message || `${context} failed`,
      'UNKNOWN_ERROR',
      500,
      error
    );
  }

  /**
   * Get authentication info for the API key
   */
  async getAuthInfo(): Promise<AuthInfoResponse> {
    try {
      const response = await this.client.get<AuthInfoResponse>(`/api/v${this.protocolVersion}/auth-info`);
      return response.data;
    } catch (error: any) {
      return this.handleError(error, 'Get auth info');
    }
  }

  /**
   * Get payment requirements for a resource (On-demand mode)
   */
  async getPaymentRequirements(
    request: PaymentRequirementsRequest
  ): Promise<PaymentRequiredResponse> {
    try {
      if (this.debug) {
        console.log('[PrismClient] getPaymentRequirements request:', JSON.stringify(request, null, 2));
      }

      const response = await this.client.post<PaymentRequiredResponse>(
        `/api/v${this.protocolVersion}/payment/requirements`,
        request
      );

      if (this.debug) {
        console.log('[PrismClient] getPaymentRequirements response:', JSON.stringify(response.data, null, 2));
      }

      return response.data;
    } catch (error: any) {
      if (this.debug) {
        console.log('[PrismClient] getPaymentRequirements error:', error.message);
      }
      return this.handleError(error, 'Get payment requirements');
    }
  }

  /**
   * Verify a payment payload
   * Verifies the cryptographic signature and payment authorization
   * 
   * @param paymentPayload - Decoded payment payload from X-PAYMENT header
   * @param paymentRequirements - Payment requirements for validation
   * @returns Verification result with payer address if valid
   */
  async verifyPayment(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements
  ): Promise<{ isValid: boolean; payer?: string; error?: string }> {
    try {
      if (this.debug) {
        console.log('[PrismClient] verifyPayment request:', {
          paymentPayload,
          paymentRequirements
        });
      }

      const response = await this.client.post<{
        isValid: boolean;
        payer?: string;
        error?: string;
      }>(`/api/v${this.protocolVersion}/payment/verify`, {
        paymentPayload,
        paymentRequirements,
      });

      if (this.debug) {
        console.log('[PrismClient] verifyPayment response:', response.data);
      }

      return response.data;
    } catch (error: any) {
      if (this.debug) {
        console.log('[PrismClient] verifyPayment error:', error.message);
      }
      return this.handleError(error, 'Verify payment');
    }
  }

  /**
   * Settle/execute a payment
   * Submits the signed payment authorization to blockchain via Prism Gateway
   */
  async settlePayment(
    paymentPayload: PaymentPayload,
    paymentRequirements: PaymentRequirements,
  ): Promise<{
    success: boolean;
    payer?: string;
    transaction?: string;
    network?: string;
    errorReason?: string;
  }> {
    try {
      if (this.debug) {
        console.log('[PrismClient] settlePayment request:', {
          paymentPayload,
          paymentRequirements
        });
      }

      const response = await this.client.post<{
        success: boolean;
        payer: string;
        transaction: string;
        network: string;
        errorReason?: string;
      }>(`/api/v${this.protocolVersion}/payment/settle`, {
        paymentPayload,
        paymentRequirements,
      });

      if (this.debug) {
        console.log('[PrismClient] settlePayment response:', response.data);
      }

      return {
        success: response.data.success,
        payer: response.data.payer,
        transaction: response.data.transaction,
        network: response.data.network,
        errorReason: response.data.errorReason,
      };
    } catch (error: any) {
      if (this.debug) {
        console.log('[PrismClient] settlePayment error:', error.message);
      }
      return this.handleError(error, 'Settle payment');
    }
  }
}
