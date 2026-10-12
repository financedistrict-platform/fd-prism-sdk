import { IncomingMessage, ServerResponse } from 'http';
import * as url from 'url';
import {
  PrismMiddlewareConfig,
  RoutesConfig,
  PaymentPayload,
  PrismMiddlewareCore,
  HeaderAdapter,
  detectProtocolVersion,
  holdResponseUntilSettled,
  createResponseSettler,
  resolveMaxHeldResponseBytes,
} from '@financedistrict/prism-x402-sdk';

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
 * const { prismPaymentMiddleware } = require('@financedistrict/prism-x402-sdk-http');
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
  const maxHeldBytes = resolveMaxHeldResponseBytes(config.maxHeldResponseBytes);

  return async function (
    req: PrismHttpRequest,
    res: ServerResponse
  ): Promise<boolean> {
    // Parse URL
    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '/';
    req.path = pathname;

    // Construct resource URL — prefer config.resourceBaseUrl to avoid Host header injection
    const protocol = (req.socket as any).encrypted ? 'https' : 'http';
    const host = req.headers.host || 'localhost';
    const base = (config.resourceBaseUrl ?? `${protocol}://${host}`).replace(/\/$/, '');
    const resourceUrl = `${base}${req.url}`;

    // Get payment header (supports both v1 X-PAYMENT and v2 PAYMENT-SIGNATURE)
    const paymentHeader = HeaderAdapter.getPaymentPayload((name) => req.headers[name.toLowerCase()] as string | undefined || null);

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
      path: pathname,
      paymentHeader: paymentHeader || undefined,
      resourceUrl,
      protocolVersion,
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

      holdResponseUntilSettled(
        res,
        createResponseSettler(core, result.paymentInfo, res, protocolVersion),
        { protocolVersion, maxHeldBytes }
      );
    }

    // Allow request to continue (payment verified or route not protected)
    return false;
  };
}
