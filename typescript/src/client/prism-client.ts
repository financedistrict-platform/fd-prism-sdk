import axios, { AxiosInstance } from 'axios';
import {
  AuthInfoResponse,
  PaymentRequirementsRequest,
  PaymentRequiredResponse,
  PaymentRequirements,
  PaymentPayload,
  PrismMiddlewareConfig,
} from '../types';

/**
 * Client for interacting with Prism Gateway API
 */
export class PrismClient {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(config: PrismMiddlewareConfig) {
    this.apiKey = config.apiKey;

    // Determine base URL
    let baseUrl = config.baseUrl;
    if (!baseUrl) {
      baseUrl = config.useSandbox !== false
        ? 'https://prism-api.test.1stdigital.tech'
        : 'https://prism-api.1stdigital.tech'; // TODO: Update with production URL when available
    }

    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'X-API-Key': this.apiKey,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get authentication info for the API key
   */
  async getAuthInfo(): Promise<AuthInfoResponse> {
    const response = await this.client.get<AuthInfoResponse>('/api/v1/auth-info');
    return response.data;
  }

  /**
   * Get payment requirements for a resource (On-demand mode)
   */
  async getPaymentRequirements(
    request: PaymentRequirementsRequest
  ): Promise<PaymentRequiredResponse> {
    const response = await this.client.post<PaymentRequiredResponse>(
      '/api/v1/payment/requirements',
      request
    );
    return response.data;
  }

  /**
   * Verify a payment payload
   * TODO: Implement when Prism Gateway provides verification endpoint
   */
  async verifyPayment(paymentHeader: string): Promise<{ isValid: boolean; error?: string }> {
    // PLACEHOLDER: This endpoint doesn't exist yet in Prism Gateway
    // For now, return a placeholder implementation
    console.warn('Payment verification endpoint not yet implemented in Prism Gateway');

    // TODO: Implement actual verification call when available
    // Expected endpoint: POST /api/v1/payment/verify
    // Body: { paymentHeader: string }
    // Response: { isValid: boolean, error?: string }

    return {
      isValid: false,
      error: 'Payment verification not yet implemented',
    };
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
      const response = await this.client.post<{
        success: boolean;
        payer: string;
        transaction: string;
        network: string;
        errorReason?: string;
      }>('/api/v1/payment/settle', {
        paymentPayload,
        paymentRequirements,
      });

      return {
        success: response.data.success,
        payer: response.data.payer,
        transaction: response.data.transaction,
        network: response.data.network,
        errorReason: response.data.errorReason,
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        return {
          success: false,
          errorReason: error.response.data?.errorReason || `Settlement failed with status ${error.response.status}`,
        };
      }

      console.error('Settlement request failed:', error);
      return {
        success: false,
        errorReason: error instanceof Error ? error.message : 'Settlement request failed',
      };
    }
  }
}
