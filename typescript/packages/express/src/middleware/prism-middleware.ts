import { Request, Response, NextFunction } from 'express';
import {
  PrismMiddlewareCore,
  PrismMiddlewareConfig,
  RoutesConfig,
} from '@1stdigital/prism-core';

/**
 * Create Prism payment middleware for Express
 * 
 * @param config - Prism middleware configuration
 * @param routes - Routes configuration with payment requirements
 * @returns Express middleware function
 * 
 * @example
 * ```typescript
 * app.use(prismPaymentMiddleware(
 *   {
 *     apiKey: 'dev-key-123'
 *   },
 *   {
 *     '/api/premium': {
 *       price: 0.01,
 *       description: 'Premium API access'
 *     },
 *     '/weather': {
 *       price: '$0.001',
 *       description: 'Weather data'
 *     }
 *   }
 * ));
 * ```
 */
export function prismPaymentMiddleware(
  config: PrismMiddlewareConfig,
  routes: RoutesConfig
) {
  // Create middleware core instance
  const core = new PrismMiddlewareCore(config, routes);

  return async function (req: Request, res: Response, next: NextFunction) {
    // Construct resource URL
    const resourceUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    // Get payment header
    const paymentHeader = req.header('X-PAYMENT');

    // Process request through middleware core
    const result = await core.handleRequest({
      path: req.path,
      paymentHeader,
      resourceUrl,
    });

    // If middleware handled the request (returned error or 402)
    if (result.handled) {
      // Set headers
      if (result.headers) {
        Object.entries(result.headers).forEach(([key, value]) => {
          res.setHeader(key, value);
        });
      }

      return res.status(result.statusCode!).json(result.body);
    }

    // Payment verified or route not protected
    if (result.paymentInfo) {
      // Store payment info in res.locals for route handler access
      res.locals.payment = result.paymentInfo.payment;
      res.locals.payer = result.paymentInfo.payer;
    }

    // Execute the route handler
    await next();

    // After successful response, settle the payment if there was one
    if (result.paymentInfo && res.statusCode < 400) {
      const settlementResult = await core.settlementCallback(
        result.paymentInfo.payment,
        result.paymentInfo.paymentRequirements,
        res.statusCode
      );

      if (settlementResult && settlementResult.success && settlementResult.transaction) {
        // Add payment response header with transaction hash
        res.setHeader('X-PAYMENT-RESPONSE', settlementResult.transaction);
      }
    }
  };
}
