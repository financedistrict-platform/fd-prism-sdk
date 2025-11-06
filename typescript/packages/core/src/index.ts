/**
 * @1stdigital/prism-core
 * Core library for Prism SDK - Shared types, client, and utilities
 */

// Export client
export { PrismClient } from './client/prism-client';

// Export all types
export * from './types';

// Export error classes for users who want to catch specific types
export {
  PrismError,
  PrismGatewayError,
  PrismNetworkError,
  PrismConfigError,
  PrismPaymentError,
  PrismValidationError
} from './types/errors';
