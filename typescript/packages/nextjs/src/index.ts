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

  return async function middleware(request: NextRequest): Promise<NextResponse> {
    const pathname = request.nextUrl.pathname;
    const resourceUrl = request.url;

    // Get payment header
    const paymentHeader = request.headers.get('X-PAYMENT') || undefined;

    // Process request through middleware core
    const result: MiddlewareResult = await core.handleRequest({
      path: pathname,
      paymentHeader,
      resourceUrl,
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

    // Payment verified or route not protected
    const response = NextResponse.next();

    // Store payment info for route handler access via headers
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
  const core = new PrismMiddlewareCore(middlewareConfig, { 
    ['']: routeConfig // Single route config
  });

  return async function wrappedHandler(request: Request, context?: any): Promise<Response> {
    // Get payment header
    const url = new URL(request.url);
    const paymentHeader = request.headers.get('X-PAYMENT') || undefined;

    // Process request through middleware core
    const result: MiddlewareResult = await core.handleRequest({
      path: url.pathname,
      paymentHeader,
      resourceUrl: request.url,
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
        await core.settlementCallback(
          result.paymentInfo.payment,
          result.paymentInfo.paymentRequirements,
          response.status
        );
      } catch (error) {
        console.error('Settlement error:', error);
        // Continue returning response even if settlement fails
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
