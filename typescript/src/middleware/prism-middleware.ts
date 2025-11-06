import { Request, Response, NextFunction } from 'express';
import { PrismClient } from '../client/prism-client';
// import { ConfigLoader } from '../config/loader'; // For future cloud/file modes
import {
  PrismMiddlewareConfig,
  RoutesConfig,
  PaymentRequirementsRequest,
  PaymentPayload,
  ConfigurationMode,
} from '../types';

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
 *     apiKey: 'dev-key-123',
 *     useSandbox: true
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
      } catch (error) {
        console.error('Error generating payment requirements:', error);
        return res.status(500).json({
          error: 'Failed to generate payment requirements',
        });
      }
    }

    // Payment header exists, verify and settle payment
    try {
      // Decode payment payload from header
      const paymentPayload = decodePaymentHeader(paymentHeader);

      // Reconstruct payment requirements for settlement
      const resourceUrl = routeConfig.resource || `${req.protocol}://${req.get('host')}${req.originalUrl}`;
      const price = parsePrice(routeConfig.price);

      const request: PaymentRequirementsRequest = {
        resourceUrl,
        requestedAmount: price,
        description: routeConfig.description || 'Payment required',
        mimeType: routeConfig.mimeType || 'application/json',
      };

      // Get payment requirements for settlement
      const paymentRequirementsResponse = await client.getPaymentRequirements(request);
      const paymentRequirements = paymentRequirementsResponse.accepts[0]; // Use first accepted method

      // Verify payment
      // FUTURE: Implement verification when Prism Gateway provides endpoint
      const verificationResult = await client.verifyPayment(paymentHeader);

      if (!verificationResult.isValid) {
        return res.status(402).json({
          x402Version: 1,
          error: verificationResult.error || 'Invalid payment',
        });
      }

      // Payment is valid, proceed with the request
      // Store payment info in res.locals for route handler access
      res.locals.payment = paymentPayload;

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
    } catch (error) {
      console.error('Error processing payment:', error);
      return res.status(402).json({
        x402Version: 1,
        error: 'Failed to process payment',
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
