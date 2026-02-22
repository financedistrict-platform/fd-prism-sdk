import { Request, Response, NextFunction } from 'express';
import {
  PrismMiddlewareCore,
  PrismMiddlewareConfig,
  RoutesConfig,
  HeaderAdapter,
  detectProtocolVersion,
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

  return async function (req: Request, res: Response, next: NextFunction) {
    // Construct resource URL
    const resourceUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

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

      // Intercept res.end() to perform settlement before sending response
      const originalEnd = res.end.bind(res);
      let endCalled = false;

      res.end = async function (chunk?: any, encodingOrCallback?: any, callback?: any): Promise<any> {
        if (endCalled) {
          return originalEnd(chunk, encodingOrCallback, callback);
        }
        endCalled = true;

        // Perform settlement BEFORE sending response (if status < 400)
        if (res.statusCode < 400) {
          try {
            const settlementResult = await core.settlementCallback(
              result.paymentInfo!.payment,
              result.paymentInfo!.paymentRequirements,
              res.statusCode
            );

            if (settlementResult && settlementResult.success && settlementResult.transaction) {
              // Set settlement response header (v1 or v2 format)
              if (!res.headersSent) {
                const settlementResponse = JSON.stringify(settlementResult);
                const settlementBase64 = Buffer.from(settlementResponse).toString('base64');
                HeaderAdapter.setSettlementResponse(
                  (name, value) => res.setHeader(name, value),
                  settlementBase64,
                  protocolVersion
                );
              }
            } else if (!settlementResult || (settlementResult && !settlementResult.success)) {
              // Settlement failed or returned null - DO NOT send data, return 402 Payment Required
              const errorReason = settlementResult?.errorReason || 'Settlement processing failed';
              console.error('Settlement failed:', errorReason);
              if (!res.headersSent) {
                res.status(402);
                res.setHeader('Content-Type', 'application/json');
              }
              return originalEnd(JSON.stringify({
                x402Version: protocolVersion,
                error: 'Payment settlement failed',
                details: errorReason,
              }));
            }
          } catch (error: any) {
            console.error('Settlement error:', error);
            // Settlement eprotocolVersionror - DO NOT send data, return 500 error
            if (!res.headersSent) {
              res.status(500);
              res.setHeader('Content-Type', 'application/json');
            }
            return originalEnd(JSON.stringify({
              x402Version: 1,
              error: 'Settlement processing error',
              details: 'An error occurred while settling the payment. Please try again.',
            }));
          }
        }

        return originalEnd(chunk, encodingOrCallback, callback);
      } as any;
    }

    // Execute the route handler
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await next();
  };
}
