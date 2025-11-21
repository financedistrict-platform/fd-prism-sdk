/**
 * Prism x402 Payment Protocol Types
 */

/**
 * Payment requirement configuration following x402 spec
 */
export interface PaymentRequirements {
  // Scheme of the payment protocol to use
  scheme: string;

  // Network of the blockchain to send payment on
  network: string;

  // Maximum amount required to pay for the resource in atomic units of the asset
  maxAmountRequired: string;

  // URL of resource to pay for
  resource: string;

  // Description of the resource
  description: string;

  // MIME type of the resource response
  mimeType: string;

  // Output schema of the resource response
  outputSchema?: object | null;

  // Address to pay value to
  payTo: string;

  // Maximum time in seconds for the resource server to respond
  maxTimeoutSeconds: number;

  // Address of the EIP-3009 compliant ERC20 contract
  asset: string;

  // Extra information about the payment details specific to the scheme
  extra: object | null;
}

/**
 * Payment Required Response (402 response)
 */
export interface PaymentRequiredResponse {
  // Version of the x402 payment protocol
  x402Version: number;

  // List of payment requirements that the resource server accepts
  accepts: PaymentRequirements[];

  // Message from the resource server to the client to communicate errors
  error?: string;
}

/**
 * Payment Payload (from X-PAYMENT header)
 */
export interface PaymentPayload {
  // Version of the x402 payment protocol
  x402Version: number;

  // scheme is the scheme value of the accepted paymentRequirements
  scheme: string;

  // network is the network id of the accepted paymentRequirements
  network: string;

  // payload is scheme dependent
  payload: any;
}

/**
 * Configuration options for Prism middleware
 */
export interface PrismMiddlewareConfig {
  // API Key for authentication with Prism Gateway
  apiKey: string;

  // Base URL for Prism Gateway (defaults to test environment)
  // Test: https://prism-api.test.1stdigital.tech
  // Production: https://prism-api.1stdigital.tech
  baseUrl?: string;

  // Enable debug logging (logs requests/responses to console)
  debug?: boolean;

  // INTERNAL: Optional client instance for dependency injection (used in testing)
  // When provided, middleware will use this client instead of creating new one
  client?: any;
}

/**
 * INTERNAL: Configuration mode for payment requirements generation
 * Not exposed in public API - used internally to switch between implementation modes
 * 
 * Modes:
 * - 'on-demand': Calls Prism Gateway API to generate payment requirements dynamically (IMPLEMENTED)
 * - 'cloud': Loads static config from cloud-hosted URL (TODO: Future implementation)
 * - 'file': Loads static config from local file (TODO: Future implementation)
 */
export type ConfigurationMode =
  | 'on-demand'     // Call Prism Gateway API - CURRENT DEFAULT
  | 'cloud'         // Load config from cloud (PLACEHOLDER for future)
  | 'file';         // Load config from file (PLACEHOLDER for future)

/**
 * INTERNAL: Extended config with mode (not exposed to users)
 */
export interface InternalMiddlewareConfig extends PrismMiddlewareConfig {
  mode: ConfigurationMode;
  cloudConfigUrl?: string;  // For 'cloud' mode (future)
  configFilePath?: string;  // For 'file' mode (future)
}

/**
 * Route-specific payment configuration
 */
export interface RoutePaymentConfig {
  // Price/amount to charge
  price: number | string;

  // Description of what user is paying for
  description?: string;

  // MIME type of the response
  mimeType?: string;

  // Maximum timeout in seconds
  maxTimeoutSeconds?: number;

  // Custom resource URL (defaults to request URL)
  resource?: string;
}

/**
 * Routes configuration map
 * Key: route pattern (e.g., '/api/premium', '/weather')
 * Value: payment configuration for that route
 */
export type RoutesConfig = {
  [route: string]: RoutePaymentConfig;
};

/**
 * Auth info response from Prism Gateway
 */
export interface AuthInfoResponse {
  timestamp: string;
  clientId: string;
  clientName: string;
  pointOfServiceId: string;
  scopes: string[];
}

/**
 * Payment requirements request to Prism Gateway
 */
export interface PaymentRequirementsRequest {
  resourceUrl: string;
  requestedAmount: number;
  description: string;
  mimeType: string;
}

/**
 * Downloaded/Cloud config file structure (for future implementation)
 */
export interface PrismStaticConfig {
  x402Version: number;
  updatedAt: string;
  accepted: Array<{
    scheme: string;
    network: string;
    payTo: string;
    maxTimeoutSeconds: number;
    asset: string;
    extra: object | null;
  }>;
}

/**
 * Standard error response format
 */
export interface PrismErrorResponse {
  x402Version: number;
  error: string;
  details?: string;
  gateway?: {
    traceId?: string;
    timestamp?: string;
  };
  retryAfter?: number; // for 503 errors
}
