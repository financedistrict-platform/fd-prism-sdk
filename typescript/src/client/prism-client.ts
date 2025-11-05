import axios, { AxiosInstance } from 'axios';
import {
  AuthInfoResponse,
  PaymentRequirementsRequest,
  PaymentRequiredResponse,
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
   * TODO: Implement when Prism Gateway provides settlement endpoint
   */
  async settlePayment(paymentHeader: string): Promise<{ success: boolean; txHash?: string; error?: string }> {
    // PLACEHOLDER: This endpoint doesn't exist yet in Prism Gateway
    console.warn('Payment settlement endpoint not yet implemented in Prism Gateway');

    // TODO: Implement actual settlement call when available
    // Expected endpoint: POST /api/v1/payment/settle
    // Body: { paymentHeader: string }
    // Response: { success: boolean, txHash?: string, error?: string }

    return {
      success: false,
      error: 'Payment settlement not yet implemented',
    };
  }
}
