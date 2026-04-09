/**
 * Prism SDK - Node.js HTTP Middleware
 * 
 * @packageDocumentation
 */

export { prismPaymentMiddleware, PrismHttpRequest } from './middleware/prism-middleware';

// Re-export types from core that users might need
export type {
  PrismMiddlewareConfig,
  RoutesConfig,
  RoutePaymentConfig,
  PaymentPayload,
  PaymentRequirements,
  PaymentRequirementsRequest,
  PaymentRequiredResponse,
  ConfigurationMode,
} from '@1stdigital/prism-core';

// Re-export error classes
export {
  PrismError,
  PrismConfigError,
  PrismPaymentError,
  PrismGatewayError,
  PrismNetworkError,
} from '@1stdigital/prism-core';
