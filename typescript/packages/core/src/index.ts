/**
 * @financedistrict/prism-x402-sdk
 * Core library for Prism SDK - Shared types, client, and utilities
 */

// Export client
export { PrismClient } from './client/prism-client';

// Export all types (v2 by default, v1 for legacy)
export * from './types';
export * from './types/v1';
export * from './types/v2';

// Export compatibility layer for v1/v2 interop
export * from './compatibility';

// Export error classes for users who want to catch specific types
export {
  PrismError,
  PrismGatewayError,
  PrismNetworkError,
  PrismConfigError,
  PrismPaymentError,
  PrismValidationError,
  describeError,
  type ErrorSummary
} from './types/errors';

// Export middleware core
export {
  PrismMiddlewareCore,
  type MiddlewareResult,
  type MiddlewareRequestData,
  holdResponseUntilSettled,
  createResponseSettler,
  resolveMaxHeldResponseBytes,
  DEFAULT_MAX_HELD_RESPONSE_BYTES,
  type SettlementRejection,
  type VerifiedPaymentInfo,
} from './middleware';

// Export utility functions
export {
  parsePrice,
  findMatchingRoute,
  build402Response,
  buildErrorResponse,
  buildInvalidPaymentHeaderResponse,
  buildInvalidPaymentResponse,
  type MiddlewareResponse,
} from './utils';
