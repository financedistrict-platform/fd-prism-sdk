import { Request, Response, NextFunction } from 'express';
import {
  PrismClient,
  PrismMiddlewareConfig,
  RoutesConfig,
  PaymentRequirementsRequest,
  PaymentPayload,
  ConfigurationMode,
  PrismGatewayError,
  PrismNetworkError,
  PrismConfigError,
  PrismPaymentError,
} from '@1stdigital/prism-core';
// import { ConfigLoader } from '../config/loader'; // For future cloud/file modes

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
  // INTERNAL: Currently hardcoded to 'on-demand' mode
  // In future, this can be extended to support 'cloud' and 'file' modes
  // Mode options:
  //   - 'on-demand': Calls Prism Gateway API (current implementation)
  //   - 'cloud': Loads config from cloud URL (future feature)
  //   - 'file': Loads config from local file (future feature)
  const mode: ConfigurationMode = 'on-demand';

  // Initialize client for on-demand mode
  const client = new PrismClient(config);

  // PLACEHOLDER: Static config for cloud/file modes (future implementation)
  // When implementing cloud/file modes, uncomment and implement the config loading below:
  /*
  let staticConfig: any = null;
  
  if (mode === 'cloud') {
    ConfigLoader.loadFromCloud(cloudConfigUrl)
      .then(cfg => staticConfig = cfg)
      .catch(err => console.error('Failed to load cloud config:', err));
  } else if (mode === 'file') {
    ConfigLoader.loadFromFile(configFilePath)
      .then(cfg => staticConfig = cfg)
      .catch(err => console.error('Failed to load file config:', err));
  }
  */

  return async function (req: Request, res: Response, next: NextFunction) {
    // Check if current route matches any configured payment route
    const matchedRoute = findMatchingRoute(req.path, routes);

    if (!matchedRoute) {
      // Route doesn't require payment, continue
      return next();
    }

    const routeConfig = routes[matchedRoute];

    // Check for X-PAYMENT header
    const paymentHeader = req.header('X-PAYMENT');

    if (!paymentHeader) {
      // No payment provided, return 402 with payment requirements
      try {
        let paymentRequirements;

        if (mode === 'on-demand') {
          // Option 1: Call Prism Gateway API
          const resourceUrl = routeConfig.resource || `${req.protocol}://${req.get('host')}${req.originalUrl}`;
          const price = parsePrice(routeConfig.price);

          const request: PaymentRequirementsRequest = {
            resourceUrl,
            requestedAmount: price,
            description: routeConfig.description || 'Payment required',
            mimeType: routeConfig.mimeType || 'application/json',
          };

          paymentRequirements = await client.getPaymentRequirements(request);
        }

        // NOTE: Cloud and file modes are not yet implemented
        // When implemented, they will be handled here
        // else if (mode === 'cloud' || mode === 'file') { ... }

        // Return 402 Payment Required
        return res.status(402).json(paymentRequirements);
      } catch (error: any) {
        console.error('Error generating payment requirements:', error);

        // Handle PrismGatewayError (preserve status code and details)
        if (error instanceof PrismGatewayError) {
          return res.status(error.statusCode).json({
            x402Version: 1,
            error: error.message,
            details: error.details,
            gateway: {
              traceId: error.traceId,
              timestamp: error.timestamp
            }
          });
        }

        // Handle PrismNetworkError (service unavailable)
        if (error instanceof PrismNetworkError) {
          return res.status(503).json({
            x402Version: 1,
            error: 'Payment service unavailable',
            details: 'Could not connect to Prism Gateway. Please try again later.',
            retryAfter: 60 // seconds
          });
        }

        // Handle PrismConfigError (server misconfiguration)
        if (error instanceof PrismConfigError) {
          return res.status(500).json({
            x402Version: 1,
            error: 'Payment service misconfigured',
            details: 'Please contact the administrator.'
          });
        }

        // Unknown error - generic 500
        return res.status(500).json({
          x402Version: 1,
          error: 'Failed to generate payment requirements',
          details: error.message || 'An unexpected error occurred'
        });
      }
    }

    // Payment header exists, verify and settle payment
    try {
      // Decode payment payload from header
      const paymentPayload = decodePaymentHeader(paymentHeader);

      // TODO: OPTIMIZATION - Avoid redundant Gateway call for payment requirements
      // 
      // CURRENT ISSUE:
      // - We call /api/v1/payment/requirements again even though client already has requirements from initial 402 response
      // - This adds ~200ms latency and unnecessary load on Gateway
      // 
      // WHY WE DO THIS NOW:
      // - Gateway's /api/v1/payment/verify endpoint requires full PaymentRequirements object
      // - PaymentRequirements contains Gateway-specific data (payTo address, asset contract, etc.)
      // - Client doesn't send requirements back in X-PAYMENT header (only scheme, network, payload)
      // 
      // OPTIMIZATION PLAN:
      // When we implement cloud/file configuration modes, we can:
      // 1. Load static requirements from cloud URL or local file (no Gateway call needed)
      // 2. Use cached/pre-loaded requirements for verify instead of calling Gateway
      // 3. Requirements are relatively static (only change when provider updates config)
      // 
      // IMPLEMENTATION:
      // - In 'cloud' mode: Load from cloudConfigUrl, cache in memory, use for verify
      // - In 'file' mode: Load from configFilePath, cache in memory, use for verify  
      // - In 'on-demand' mode (current): Must call Gateway (requirements are dynamic per route)
      //
      // ALTERNATIVE (future):
      // - Extend x402 spec to include requirements in X-PAYMENT payload
      // - Client would send: { x402Version, scheme, network, payload, requirements }
      // - Would eliminate need for this call entirely
      //
      // For now, we accept the performance trade-off for correctness.

      // Reconstruct payment requirements for verification
      const resourceUrl = routeConfig.resource || `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const price = parsePrice(routeConfig.price);

      const request: PaymentRequirementsRequest = {
        resourceUrl,
        requestedAmount: price,
        description: routeConfig.description || 'Payment required',
        mimeType: routeConfig.mimeType || 'application/json',
      };

      // Get payment requirements for verification and settlement
      const paymentRequirementsResponse = await client.getPaymentRequirements(request);
      const paymentRequirements = paymentRequirementsResponse.accepts[0]; // Use first accepted method

      // Verify payment with Gateway
      const verificationResult = await client.verifyPayment(paymentHeader, paymentRequirements);

      if (!verificationResult.isValid) {
        return res.status(402).json({
          x402Version: 1,
          error: verificationResult.error || 'Invalid payment',
        });
      }

      // Payment is valid, proceed with the request
      // Store payment info in res.locals for route handler access
      res.locals.payment = paymentPayload;
      res.locals.payer = verificationResult.payer; // Store payer address

      // Execute the route handler
      await next();

      // After successful response, settle the payment on blockchain
      if (res.statusCode < 400) {
        const settlementResult = await client.settlePayment(paymentPayload, paymentRequirements);

        if (settlementResult.success && settlementResult.transaction) {
          // Add payment response header with transaction hash
          res.setHeader('X-PAYMENT-RESPONSE', settlementResult.transaction);

          // Optionally log settlement info
          console.log(`Payment settled: ${settlementResult.transaction} on ${settlementResult.network || 'unknown'} by ${settlementResult.payer}`);
        } else if (settlementResult.errorReason) {
          console.error('Settlement failed:', settlementResult.errorReason);
          // Note: Response already sent to client, settlement happens async
        }
      }
    } catch (error: any) {
      console.error('Error processing payment:', error);

      // Handle PrismPaymentError (invalid payment)
      if (error instanceof PrismPaymentError) {
        return res.status(402).json({
          x402Version: 1,
          error: error.message,
          details: error.details
        });
      }

      // Handle PrismGatewayError (preserve status code and details)
      if (error instanceof PrismGatewayError) {
        return res.status(error.statusCode).json({
          x402Version: 1,
          error: 'Payment processing failed',
          details: error.details,
          gateway: {
            traceId: error.traceId,
            timestamp: error.timestamp
          }
        });
      }

      // Handle PrismNetworkError (service unavailable)
      if (error instanceof PrismNetworkError) {
        return res.status(503).json({
          x402Version: 1,
          error: 'Payment service unavailable',
          details: 'Could not connect to Prism Gateway. Please try again later.',
          retryAfter: 60
        });
      }

      // Unknown error
      return res.status(500).json({
        x402Version: 1,
        error: 'Failed to process payment',
        details: error.message || 'An unexpected error occurred'
      });
    }
  };
}

/**
 * Find matching route pattern
 */
function findMatchingRoute(path: string, routes: RoutesConfig): string | null {
  // Exact match first
  if (routes[path]) {
    return path;
  }

  // Wildcard matching
  for (const route in routes) {
    if (route.endsWith('/*')) {
      const prefix = route.slice(0, -2);
      if (path.startsWith(prefix)) {
        return route;
      }
    }
  }

  return null;
}

/**
 * Parse price to number
 */
function parsePrice(price: number | string): number {
  if (typeof price === 'number') {
    return price;
  }

  // Handle string prices like "$0.01"
  const cleaned = price.replace(/[$,]/g, '');
  return Number.parseFloat(cleaned);
}

/**
 * Decode X-PAYMENT header to PaymentPayload
 * Header is base64 encoded JSON
 */
function decodePaymentHeader(header: string): PaymentPayload {
  const decoded = Buffer.from(header, 'base64').toString('utf-8');
  return JSON.parse(decoded) as PaymentPayload;
}
