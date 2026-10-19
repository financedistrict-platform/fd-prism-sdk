/**
 * @financedistrict/prism-x402-sdk-fastify
 * Fastify plugin for Prism payment protocol
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import {
  PrismMiddlewareCore,
  type PrismMiddlewareConfig,
  type RoutesConfig,
  HeaderAdapter,
  createResponseSettler,
  detectProtocolVersion,
  findMatchingRoute,
  holdResponseUntilSettled,
  resolveMaxHeldResponseBytes,
} from '@financedistrict/prism-x402-sdk';

export interface PrismFastifyOptions extends PrismMiddlewareConfig {
  routes: RoutesConfig;
}

/**
 * Prism payment plugin for Fastify
 * 
 * @example
 * ```typescript
 * import Fastify from 'fastify';
 * import prismPlugin from '@financedistrict/prism-x402-sdk-fastify';
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
  const maxHeldBytes = resolveMaxHeldResponseBytes(config.maxHeldResponseBytes);

  // Add onRequest hook for payment verification
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Construct resource URL — prefer config.resourceBaseUrl to avoid Host header injection
    const protocol = request.protocol;
    const host = request.hostname;
    const base = (config.resourceBaseUrl ?? `${protocol}://${host}`).replace(/\/$/, '');
    const resourceUrl = `${base}${request.url}`;

    // Get payment header (supports both v1 X-PAYMENT and v2 PAYMENT-SIGNATURE)
    const paymentHeader = HeaderAdapter.getPaymentPayload((name) => request.headers[name.toLowerCase()] as string | undefined || null);

    // Detect protocol version from header name or payload
    let protocolVersion: 1 | 2 = config.x402Version || 2; // Default to v2
    if (paymentHeader) {
      const detected = detectProtocolVersion(paymentHeader);
      if (detected) {
        protocolVersion = detected;
      }
    }

    const requestPath = request.url.split('?')[0];
    const registeredPath = request.routeOptions?.url ?? request.routerPath;
    const isConfiguredKey = (candidate: string) => findMatchingRoute(candidate, routes) === candidate;
    const matchPath =
      registeredPath && !isConfiguredKey(requestPath) && isConfiguredKey(registeredPath)
        ? registeredPath
        : requestPath;

    // Process request through middleware core
    const result = await core.handleRequest({
      path: matchPath,
      paymentHeader: paymentHeader || undefined,
      resourceUrl,
      protocolVersion,
      requestScope: reply.raw,
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

    if (result.paymentInfo) {
      (request as any).payment = result.paymentInfo.payment;
      (request as any).payer = result.paymentInfo.payer;

      const registered = holdResponseUntilSettled(
        reply.raw,
        createResponseSettler(core, result.paymentInfo, reply.raw, protocolVersion),
        { protocolVersion, maxHeldBytes }
      );

      if (!registered) {
        reply.hijack();
      }
    }
  });

  // Add decorators for accessing payment info in routes
  fastify.decorateRequest('payment', null);
  fastify.decorateRequest('payer', null);
};

const prismPlugin = fp(prismPluginCore, {
  fastify: '4.x',
  name: '@financedistrict/prism-x402-sdk-fastify',
});

export default prismPlugin;
export { prismPlugin };
