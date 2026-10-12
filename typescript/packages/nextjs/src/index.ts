/**
 * @financedistrict/prism-x402-sdk-nextjs
 * Route handler wrappers for the Prism payment protocol
 */

import {
  PrismMiddlewareCore,
  PrismMiddlewareConfig,
  RoutePaymentConfig,
  MiddlewareResult,
  HeaderAdapter,
  detectProtocolVersion,
} from '@financedistrict/prism-x402-sdk';

export interface VerifiedPaymentInfo {
  payer: string | null;
  amount: string | null;
}

const verifiedPayments = new WeakMap<Request, VerifiedPaymentInfo>();

const UNTRUSTED_HEADER_PREFIX = 'x-prism-';

const PAYMENT_HEADER_NAMES = new Set(
  [...HeaderAdapter.getAllPaymentHeaders(), ...HeaderAdapter.getAllResponseHeaders()].map((name) =>
    name.toLowerCase()
  )
);

function stripUntrustedHeaders(headers: Headers): void {
  const names: string[] = [];
  headers.forEach((_, name) => names.push(name.toLowerCase()));
  for (const name of names) {
    if (name.startsWith(UNTRUSTED_HEADER_PREFIX) || PAYMENT_HEADER_NAMES.has(name)) {
      headers.delete(name);
    }
  }
}

/**
 * Prism API route wrapper for App Router
 * Wraps Next.js route handlers with payment protection: it verifies the proof,
 * runs the handler, then settles the payment before returning the response.
 * Next.js middleware cannot observe the handler response, so it cannot settle;
 * protect each paid route with this wrapper instead.
 *
 * @example
 * ```typescript
 * // app/api/premium/route.ts
 * import { withPrismPayment } from '@financedistrict/prism-x402-sdk-nextjs';
 * 
 * export const GET = withPrismPayment(
 *   async (request: Request) => {
 *     return Response.json({ message: 'Premium content' });
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
    stripUntrustedHeaders(request.headers);

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

    if (result.paymentInfo) {
      const requirements = result.paymentInfo.paymentRequirements;
      verifiedPayments.set(request, {
        payer: result.paymentInfo.payer ?? null,
        amount: requirements?.amount ?? requirements?.maxAmountRequired ?? null,
      });
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
  return verifiedPayments.get(request)?.payer ?? null;
}

/**
 * Helper to extract payment info from request in route handlers
 */
export function getPaymentInfo(request: Request): VerifiedPaymentInfo {
  const info = verifiedPayments.get(request);
  return { payer: info?.payer ?? null, amount: info?.amount ?? null };
}
