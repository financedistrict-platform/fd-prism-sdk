/**
 * @1stdigital/prism-nextjs
 * Next.js middleware for Prism payment protocol
 * 
 * @status COMING SOON - Q1 2025
 */

import type { NextRequest, NextResponse } from 'next/server';
import type { PrismMiddlewareConfig, RoutePaymentConfig } from '@1stdigital/prism-core';

/**
 * Prism Next.js configuration
 */
export interface PrismNextConfig extends PrismMiddlewareConfig {
  routes: Record<string, RoutePaymentConfig>;
}

/**
 * Create Prism middleware for Next.js
 * @example
 * ```typescript
 * // middleware.ts
 * import { createPrismMiddleware } from '@1stdigital/prism-nextjs';
 * 
 * export const middleware = createPrismMiddleware({
 *   apiKey: 'your-api-key',
 *   // Defaults to test environment,
 *   routes: {
 *     '/api/paid': { price: 0.01, description: 'Paid API' }
 *   }
 * });
 * 
 * export const config = {
 *   matcher: '/api/:path*'
 * };
 * ```
 */
export function createPrismMiddleware(config: PrismNextConfig) {
  return async function middleware(request: NextRequest): Promise<NextResponse> {
    // TODO: Implement Next.js middleware logic
    console.warn('Prism Next.js middleware is not yet implemented');

    // For now, just pass through
    const { NextResponse } = await import('next/server');
    return NextResponse.next();
  };
}

/**
 * Prism API route wrapper for App Router
 * @example
 * ```typescript
 * // app/api/paid/route.ts
 * import { withPrismPayment } from '@1stdigital/prism-nextjs';
 * 
 * export const GET = withPrismPayment(
 *   async (req) => {
 *     return Response.json({ data: 'premium content' });
 *   },
 *   { price: 0.01, description: 'Premium API' }
 * );
 * ```
 */
export function withPrismPayment<T extends Function>(
  handler: T,
  paymentConfig: RoutePaymentConfig
): T {
  // TODO: Implement API route wrapper
  console.warn('Prism API route wrapper is not yet implemented');
  return handler;
}
