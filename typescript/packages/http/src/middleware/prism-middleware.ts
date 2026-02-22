import { IncomingMessage, ServerResponse } from 'http';
import * as url from 'url';
import {
  PrismMiddlewareConfig,
  RoutesConfig,
  PaymentPayload,
  PrismMiddlewareCore,
  HeaderAdapter,
  detectProtocolVersion,
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

      // Set up response interception for settlement
      const originalEnd = res.end.bind(res);
      const originalWriteHead = res.writeHead.bind(res);
      let endCalled = false;
      let settlementDone = false;
      let transactionHash: string | undefined;

      // Intercept writeHead to add X-PAYMENT-RESPONSE header if available
      res.writeHead = function (statusCode: number, statusMessage?: any, headers?: any): any {
        // Handle both writeHead(statusCode, headers) and writeHead(statusCode, statusMessage, headers)
        let finalHeaders = headers;
        if (typeof statusMessage === 'object' && !headers) {
          finalHeaders = statusMessage;
        }

        // Add transaction hash header if settlement completed
        if (settlementDone && transactionHash) {
          if (!finalHeaders) {
            finalHeaders = {};
          }
          // Determine which header to use based on protocol version
          const headerName = protocolVersion === 1 ? 'X-PAYMENT-RESPONSE' : 'PAYMENT-RESPONSE';
          finalHeaders[headerName] = transactionHash;
        }

        if (typeof statusMessage === 'string') {
          return originalWriteHead(statusCode, statusMessage, finalHeaders);
        } else {
          return originalWriteHead(statusCode, finalHeaders);
        }
      };

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
              const settlementResponse = JSON.stringify(settlementResult);
              transactionHash = Buffer.from(settlementResponse).toString('base64');
              settlementDone = true;

              // If writeHead wasn't called yet, add header now
              if (!res.headersSent) {
                HeaderAdapter.setSettlementResponse(
                  (name, value) => res.setHeader(name, value),
                  transactionHash,
                  protocolVersion
                );
              }
            } else if (!settlementResult || (settlementResult && !settlementResult.success)) {
              // Settlement failed or returned null - DO NOT send data, return 402 Payment Required
              const errorReason = settlementResult?.errorReason || 'Settlement processing failed';
              console.error('Settlement failed:', errorReason);
              if (!res.headersSent) {
                res.statusCode = 402;
                res.setHeader('Content-Type', 'application/json');
              }
              return originalEnd(JSON.stringify({
                x402Version: protocolVersion,
                error: 'Payment settlement failed',
                details: errorReason,
              }), encodingOrCallback, callback);
            }
          } catch (err: any) {
            console.error('Settlement error:', err);
            // Settlement error - DO NOT send data, return 500 error
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
            }
            return originalEnd(JSON.stringify({
              x402Version: protocolVersion,
              error: 'Settlement processing error',
              details: 'An error occurred while settling the payment. Please try again.',
            }), encodingOrCallback, callback);
          }
        }

        return originalEnd(chunk, encodingOrCallback, callback);
      } as any;
    }

    // Allow request to continue (payment verified or route not protected)
    return false;
  };
}
