import { Request, Response, NextFunction } from 'express';
import {
  PrismMiddlewareCore,
  PrismMiddlewareConfig,
  RoutesConfig,
  HeaderAdapter,
  detectProtocolVersion,
  holdResponseUntilSettled,
  createResponseSettler,
  resolveMaxHeldResponseBytes,
} from '@financedistrict/prism-x402-sdk';

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
  const maxHeldBytes = resolveMaxHeldResponseBytes(config.maxHeldResponseBytes);

  return async function (req: Request, res: Response, next: NextFunction) {
    // Construct resource URL — prefer config.resourceBaseUrl to avoid Host header injection
    const base = (config.resourceBaseUrl ?? `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const resourceUrl = `${base}${req.originalUrl}`;

    // Get payment header (supports both v1 X-PAYMENT and v2 PAYMENT-SIGNATURE)
    const paymentHeader = HeaderAdapter.getPaymentPayload((name) => req.header(name) || null);

    // Detect protocol version from header name or payload
    let protocolVersion: 1 | 2 = config.x402Version || 2; // Default to v2
    if (paymentHeader) {
      const detected = detectProtocolVersion(paymentHeader);
      if (detected) {
        protocolVersion = detected;
      }
    }

    // Process request through middleware core
    const result = await core.handleRequest({
      path: req.path,
      paymentHeader: paymentHeader || undefined,
      resourceUrl,
      protocolVersion,
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

      holdResponseUntilSettled(
        res,
        createResponseSettler(core, result.paymentInfo, res, protocolVersion),
        { protocolVersion, maxHeldBytes }
      );
    }

    // Execute the route handler
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await next();
  };
}
