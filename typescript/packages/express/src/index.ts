/**
 * @1stdigital/prism-express
 * Express.js middleware for Prism payment protocol
 */

export { prismPaymentMiddleware } from './middleware/prism-middleware';
export type {
  PrismMiddlewareConfig,
  RoutePaymentConfig,
  RoutesConfig,
  PaymentPayload,
  PaymentRequirements,
} from '@1stdigital/prism-core';
