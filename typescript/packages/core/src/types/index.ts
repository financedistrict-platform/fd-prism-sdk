/**
 * Prism x402 Payment Protocol Types
 * 
 * NOTE: These types are being migrated to v2 protocol.
 * - v2 types (new, default): ./v2.ts
 * - v1 types (legacy, deprecated): ./v1.ts
 * 
 * Current types in this file follow v1 schema and will be updated to v2.
 */

// Re-export v2 types as default
export type * from './v2';

// Export v1 types with V1 suffix for backward compatibility
export type * from './v1';

/**
 * @deprecated Use PaymentRequirements from v2.ts instead
 * Payment requirement configuration following x402 spec v1
 */
export interface PaymentRequirementsLegacy {
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

// Note: PaymentRequiredResponse, PaymentRequirements, and PaymentPayload are exported from v2.ts above

/**
 * Configuration options for Prism middleware
 */
export interface PrismMiddlewareConfig {
  // API Key for authentication with Prism Gateway
  apiKey: string;

  // Base URL for Prism Gateway (defaults to test environment)
  // Test: https://prism-gw.test.1stdigital.tech
  // Production: https://prism-api.1stdigital.tech
  baseUrl?: string;

  // Enable debug logging (logs requests/responses to console)
  debug?: boolean;

  // x402 protocol version to use (1 or 2, defaults to 2)
  // v2 is the current standard, v1 is supported for backward compatibility
  x402Version?: 1 | 2;

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
