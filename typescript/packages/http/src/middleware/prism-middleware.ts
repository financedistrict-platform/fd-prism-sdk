import { IncomingMessage, ServerResponse } from 'http';
import * as url from 'url';
import {
  PrismMiddlewareConfig,
  RoutesConfig,
  PaymentPayload,
  PrismMiddlewareCore,
} from '@1stdigital/prism-core';

/**
 * Extended IncomingMessage with parsed data
 */
export interface PrismHttpRequest extends IncomingMessage {
  path?: string;
  payment?: PaymentPayload;
  payer?: string;
}

/**
 * Helper to send response from middleware result
 */
function sendResponse(res: ServerResponse, statusCode: number, headers: Record<string, string>, body: any) {
  res.statusCode = statusCode;

  // Set all headers
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  res.end(JSON.stringify(body));
}

/**
 * Create Prism payment middleware for Node.js HTTP server
 * 
 * @param config - Prism middleware configuration
 * @param routes - Routes configuration with payment requirements
 * @returns HTTP middleware function
 * 
 * @example
 * ```typescript
 * const http = require('http');
 * const { prismPaymentMiddleware } = require('@1stdigital/prism-http');
 * 
 * const middleware = prismPaymentMiddleware(
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
 * );
 * 
 * const server = http.createServer(async (req, res) => {
 *   const handled = await middleware(req, res);
 *   if (!handled) {
 *     // Handle your routes here
 *     res.writeHead(200);
 *     res.end('Hello World');
 *   }
 * });
 * ```
 */
export function prismPaymentMiddleware(
  config: PrismMiddlewareConfig,
  routes: RoutesConfig
) {
  // Create middleware core instance
  const core = new PrismMiddlewareCore(config, routes);

  return async function (
    req: PrismHttpRequest,
    res: ServerResponse
  ): Promise<boolean> {
    // Parse URL
    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '/';
    req.path = pathname;

    // Determine protocol and construct resource URL
    const protocol = (req.socket as any).encrypted ? 'https' : 'http';
    const host = req.headers.host || 'localhost';
    const resourceUrl = `${protocol}://${host}${req.url}`;

    // Get payment header
    const paymentHeader = req.headers['x-payment'] as string | undefined;

    // Process request through middleware core
    const result = await core.handleRequest({
      path: pathname,
      paymentHeader,
      resourceUrl,
    });

    // If middleware handled the request (returned error or 402)
    if (result.handled) {
      sendResponse(res, result.statusCode!, result.headers!, result.body);
      return true;
    }

    // Payment verified or route not protected
    if (result.paymentInfo) {
      // Store payment info for route handler access
      req.payment = result.paymentInfo.payment;
      req.payer = result.paymentInfo.payer;

      // Set up response interception for settlement
      const originalEnd = res.end.bind(res);
      let endCalled = false;

      res.end = function (chunk?: any, encodingOrCallback?: any, callback?: any): any {
        if (endCalled) {
          return originalEnd(chunk, encodingOrCallback, callback);
        }
        endCalled = true;

        // Trigger settlement callback after response is sent
        setImmediate(() => {
          core.settlementCallback(
            result.paymentInfo!.payment,
            result.paymentInfo!.paymentRequirements,
            res.statusCode
          ).catch((err: any) => {
            console.error('Settlement callback error:', err);
          });
        });

        return originalEnd(chunk, encodingOrCallback, callback);
      };
    }

    // Allow request to continue (payment verified or route not protected)
    return false;
  };
}
