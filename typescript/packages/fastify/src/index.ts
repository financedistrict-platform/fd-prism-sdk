/**
 * @1stdigital/prism-fastify
 * Fastify plugin for Prism payment protocol
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import {
  PrismMiddlewareCore,
  type PrismMiddlewareConfig,
  type RoutesConfig,
} from '@1stdigital/prism-core';

export interface PrismFastifyOptions extends PrismMiddlewareConfig {
  routes: RoutesConfig;
}

/**
 * Prism payment plugin for Fastify
 * 
 * @example
 * ```typescript
 * import Fastify from 'fastify';
 * import prismPlugin from '@1stdigital/prism-fastify';
 * 
 * const app = Fastify();
 * 
 * await app.register(prismPlugin, {
 *   apiKey: 'dev-key-123',
 *   routes: {
 *     '/api/premium': { price: 0.01, description: 'Premium API' }
 *   }
 * });
 * ```
 */
const prismPluginCore: FastifyPluginAsync<PrismFastifyOptions> = async (fastify, options) => {
  const { routes, ...config } = options;

  // Create middleware core instance
  const core = new PrismMiddlewareCore(config, routes);

  // Store payment info per request
  const requestPaymentInfo = new WeakMap<FastifyRequest, any>();

  // Add onRequest hook for payment verification
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Construct resource URL
    const protocol = request.protocol;
    const host = request.hostname;
    const resourceUrl = `${protocol}://${host}${request.url}`;

    // Get payment header
    const paymentHeader = request.headers['x-payment'] as string | undefined;

    // Process request through middleware core
    const result = await core.handleRequest({
      path: request.routerPath || request.url.split('?')[0],
      paymentHeader,
      resourceUrl,
    });

    // If middleware handled the request (returned error or 402)
    if (result.handled) {
      // Set headers
      if (result.headers) {
        Object.entries(result.headers).forEach(([key, value]) => {
          reply.header(key, value);
        });
      }

      reply.code(result.statusCode!).send(result.body);
      return;
    }

    // Payment verified or route not protected
    if (result.paymentInfo) {
      // Store payment info in request for route handler access
      (request as any).payment = result.paymentInfo.payment;
      (request as any).payer = result.paymentInfo.payer;

      // Store for onSend hook
      requestPaymentInfo.set(request, result.paymentInfo);
    }
  });

  // Add onSend hook for settlement after successful response
  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload) => {
    const paymentInfo = requestPaymentInfo.get(request);

    // Perform settlement BEFORE sending response (if status < 400)
    if (paymentInfo && reply.statusCode < 400) {
      try {
        const settlementResult = await core.settlementCallback(
          paymentInfo.payment,
          paymentInfo.paymentRequirements,
          reply.statusCode
        );

        if (settlementResult && settlementResult.success && settlementResult.transaction) {
          reply.header('X-PAYMENT-RESPONSE', settlementResult.transaction);
        } else if (settlementResult && !settlementResult.success) {
          // Settlement failed - DO NOT send data, return 402 Payment Required
          fastify.log.error(`Settlement failed: ${settlementResult.errorReason || 'Unknown error'}`);
          reply.code(402);
          reply.header('Content-Type', 'application/json');
          requestPaymentInfo.delete(request);
          return JSON.stringify({
            x402Version: 1,
            error: 'Payment settlement failed',
            details: settlementResult.errorReason || 'Payment could not be settled. Please try again.',
          });
        }
      } catch (error: any) {
        fastify.log.error(`Settlement error: ${error.message || error}`);
        // Settlement error - DO NOT send data, return 500 error
        reply.code(500);
        reply.header('Content-Type', 'application/json');
        requestPaymentInfo.delete(request);
        return JSON.stringify({
          x402Version: 1,
          error: 'Settlement processing error',
          details: 'An error occurred while settling the payment. Please try again.',
        });
      }

      // Clean up
      requestPaymentInfo.delete(request);
    }

    return payload;
  });

  // Add decorators for accessing payment info in routes
  fastify.decorateRequest('payment', null);
  fastify.decorateRequest('payer', null);
};

const prismPlugin = fp(prismPluginCore, {
  fastify: '4.x',
  name: '@1stdigital/prism-fastify',
});

export default prismPlugin;
export { prismPlugin };
