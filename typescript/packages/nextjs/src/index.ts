/**
 * @1stdigital/prism-nextjs
 * Next.js middleware for Prism payment protocol
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  PrismMiddlewareCore,
  PrismMiddlewareConfig,
  RoutePaymentConfig,
  MiddlewareResult,
  HeaderAdapter,
  detectProtocolVersion,
} from '@1stdigital/prism-core';

/**
 * Prism Next.js configuration
 */
export interface PrismNextConfig extends PrismMiddlewareConfig {
  routes: Record<string, RoutePaymentConfig>;
}

/**
 * Create Prism middleware for Next.js App Router
 * 
 * Note: Next.js App Router middleware cannot intercept responses after the route
 * handler executes. This means settlement (and X-PAYMENT-RESPONSE header) cannot
 * be performed in middleware. Use {@link withPrismPayment} on individual route
 * handlers for the full payment flow including settlement.
 * 
 * @example
 * ```typescript
 * // middleware.ts
 * import { createPrismMiddleware } from '@1stdigital/prism-nextjs';
 * 
 * export const middleware = createPrismMiddleware({
 *   apiKey: 'your-api-key',
 *   baseUrl: 'https://prism-api.1stdigital.tech',
 *   routes: {
 *     '/api/premium': { price: 0.01, description: 'Premium API' },
 *     '/api/weather': { price: '$0.001', description: 'Weather data' }
 *   }
 * });
 * 
 * export const config = {
 *   matcher: '/api/:path*'
 * };
 * ```
 */
export function createPrismMiddleware(config: PrismNextConfig) {
  const { routes, ...middlewareConfig } = config;
  const core = new PrismMiddlewareCore(middlewareConfig, routes);

  console.warn(
    '[prism-nextjs] createPrismMiddleware() only handles payment verification. ' +
    'Settlement and X-PAYMENT-RESPONSE header are not supported in Next.js middleware. ' +
    'Use withPrismPayment() on individual route handlers for the full payment flow.'
  );

  return async function middleware(request: NextRequest): Promise<NextResponse> {
    const pathname = request.nextUrl.pathname;
    const resourceUrl = request.url;

    // Get payment header (supports both v1 X-PAYMENT and v2 PAYMENT-SIGNATURE)
    const paymentHeader = HeaderAdapter.getPaymentPayload((name) => request.headers.get(name) || null);

    // Detect protocol version from header name or payload
    let protocolVersion: 1 | 2 = middlewareConfig.x402Version || 2; // Default to v2
    if (paymentHeader) {
      const detected = detectProtocolVersion(paymentHeader);
      if (detected) {
        protocolVersion = detected;
      }
    }

    // Process request through middleware core
    const result: MiddlewareResult = await core.handleRequest({
      path: pathname,
      paymentHeader: paymentHeader || undefined,
      resourceUrl,
      protocolVersion,
    });

    // If middleware handled the request (returned error or 402)
    if (result.handled) {
      // Build response with headers
      const responseHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(result.headers || {}),
      };

      return new NextResponse(
        JSON.stringify(result.body),
        {
          status: result.statusCode!,
          headers: responseHeaders,
        }
      );
    }

    // Payment verified or route not protected.
    // Clone the incoming request headers and overwrite them with the verified
    // values so the downstream Route Handler receives the verified payer/payment
    // info rather than any client-forged x-prism-* headers on the original request.
    const forwardedHeaders = new Headers(request.headers);

    if (result.paymentInfo) {
      forwardedHeaders.set('x-prism-payer', result.paymentInfo.payer);
      forwardedHeaders.set('x-prism-payment', JSON.stringify(result.paymentInfo.payment));
    } else {
      forwardedHeaders.delete('x-prism-payer');
      forwardedHeaders.delete('x-prism-payment');
    }

    const response = NextResponse.next({
      request: {
        headers: forwardedHeaders,
      },
    });

    // Also set on the outgoing response for clients that read these directly.
    if (result.paymentInfo) {
      response.headers.set('x-prism-payer', result.paymentInfo.payer);
      response.headers.set('x-prism-payment', JSON.stringify(result.paymentInfo.payment));
    }

    return response;
  };
}

/**
 * Prism API route wrapper for App Router
 * Wraps Next.js route handlers with payment protection
 * 
 * @example
 * ```typescript
 * // app/api/premium/route.ts
 * import { withPrismPayment } from '@1stdigital/prism-nextjs';
 * 
 * export const GET = withPrismPayment(
 *   async (request: Request) => {
 *     const payer = request.headers.get('x-prism-payer');
 *     return Response.json({ 
 *       message: 'Premium content',
 *       payer 
 *     });
 *   },
 *   { 
 *     price: 0.01, 
 *     description: 'Premium API'
 *   },
 *   {
 *     apiKey: process.env.PRISM_API_KEY || 'dev-key',
 *     baseUrl: process.env.PRISM_BASE_URL
 *   }
 * );
 * ```
 */
export function withPrismPayment(
  handler: (request: Request, context?: any) => Promise<Response>,
  routeConfig: RoutePaymentConfig,
  middlewareConfig: PrismMiddlewareConfig
): (request: Request, context?: any) => Promise<Response> {
  return async function wrappedHandler(request: Request, context?: any): Promise<Response> {
    // Get payment header
    const url = new URL(request.url);
    const paymentHeader = HeaderAdapter.getPaymentPayload((name) => request.headers.get(name) || null);

    // Detect protocol version
    let protocolVersion: 1 | 2 = middlewareConfig.x402Version || 2;
    if (paymentHeader) {
      const detected = detectProtocolVersion(paymentHeader);
      if (detected) {
        protocolVersion = detected;
      }
    }

    // Build a core keyed by the actual incoming pathname so the single route
    // config always exact-matches for this handler-wrapper use case.
    const core = new PrismMiddlewareCore(middlewareConfig, {
      [url.pathname]: routeConfig,
    });

    // Process request through middleware core
    const result: MiddlewareResult = await core.handleRequest({
      path: url.pathname,
      paymentHeader: paymentHeader || undefined,
      resourceUrl: request.url,
      protocolVersion,
    });

    // If middleware handled the request (returned error or 402)
    if (result.handled) {
      return new Response(
        JSON.stringify(result.body),
        {
          status: result.statusCode!,
          headers: {
            'Content-Type': 'application/json',
            ...(result.headers || {}),
          },
        }
      );
    }

    // Payment verified, call original handler
    const response = await handler(request, context);

    // Settlement callback after response (only if status < 400)
    if (result.paymentInfo && response.status < 400) {
      try {
        const settlementResult = await core.settlementCallback(
          result.paymentInfo.payment,
          result.paymentInfo.paymentRequirements,
          response.status
        );

        if (settlementResult && settlementResult.success && settlementResult.transaction) {
          // Settlement succeeded - add payment response header to response
          const settlementResponse = JSON.stringify(settlementResult);
          const settlementBase64 = Buffer.from(settlementResponse).toString('base64');
          const newHeaders = new Headers(response.headers);
          HeaderAdapter.setSettlementResponse(
            (name, value) => newHeaders.set(name, value),
            settlementBase64,
            protocolVersion
          );
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
          });
        }

        if (settlementResult && !settlementResult.success) {
          // Settlement failed - DO NOT return data, return 402 Payment Required
          const errorReason = settlementResult.errorReason || 'Settlement processing failed';
          console.error('Settlement failed:', errorReason);
          return new Response(
            JSON.stringify({
              x402Version: protocolVersion,
              error: 'Payment settlement failed',
              details: errorReason,
            }),
            {
              status: 402,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }

        if (!settlementResult) {
          // Settlement returned null (exception) - DO NOT return data, return 500 error
          console.error('Settlement error: returned null');
          return new Response(
            JSON.stringify({
              x402Version: protocolVersion,
              error: 'Settlement processing error',
              details: 'An error occurred while settling the payment. Please try again.',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
      } catch (error) {
        console.error('Settlement error:', error);
        // Settlement error - DO NOT return data, return 500 error
        return new Response(
          JSON.stringify({
            x402Version: protocolVersion,
            error: 'Settlement processing error',
            details: 'An error occurred while settling the payment. Please try again.',
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }

    return response;
  };
}

/**
 * Helper to extract payer from request in route handlers
 */
export function getPayer(request: Request): string | null {
  return request.headers.get('x-prism-payer');
}

/**
 * Helper to extract payment info from request in route handlers
 */
export function getPaymentInfo(request: Request): {
  payer: string | null;
  amount: string | null;
  transactionId: string | null;
} {
  return {
    payer: request.headers.get('x-prism-payer'),
    amount: request.headers.get('x-prism-amount'),
    transactionId: request.headers.get('x-prism-transaction-id'),
  };
}
