/**
 * @financedistrict/prism-x402-sdk-nestjs
 * NestJS module for Prism payment protocol
 */

import {
  Module,
  Injectable,
  CanActivate,
  ExecutionContext,
  SetMetadata,
  Inject,
  NestMiddleware,
  DynamicModule,
  InternalServerErrorException,
  OnModuleInit,
  UseGuards,
  applyDecorators,
  createParamDecorator,
} from '@nestjs/common';
import { APP_GUARD, DiscoveryModule, DiscoveryService, Reflector } from '@nestjs/core';
import { Request, Response, NextFunction } from 'express';
import {
  PrismMiddlewareCore,
  type PrismMiddlewareConfig,
  type RoutesConfig,
  type RoutePaymentConfig,
  type MiddlewareResult,
  HeaderAdapter,
  detectProtocolVersion,
  findMatchingRoute,
  parsePrice,
} from '@financedistrict/prism-x402-sdk';

/**
 * Prism module configuration
 */
export interface PrismModuleOptions extends PrismMiddlewareConfig {
  routes?: RoutesConfig;
}

const PRISM_PAYMENT_KEY = 'prism:payment';
const PRISM_PAYMENT_HANDLED = Symbol('prism:payment-handled');

type VerifiedPayment = NonNullable<MiddlewareResult['paymentInfo']>;

const requestPath = (req: Request): string => req.originalUrl.split('?')[0];

const toBuffer = (chunk: any, encoding?: BufferEncoding): Buffer =>
  Buffer.isBuffer(chunk) ? chunk : typeof chunk === 'string' ? Buffer.from(chunk, encoding) : Buffer.from(chunk);

const encodingOf = (value: unknown): BufferEncoding | undefined =>
  typeof value === 'string' ? (value as BufferEncoding) : undefined;

const applyHeaders = (res: Response, headers: unknown): void => {
  if (!headers) {
    return;
  }
  const pairs: Array<[string, any]> = Array.isArray(headers)
    ? Array.isArray(headers[0])
      ? (headers as Array<[string, any]>)
      : Array.from({ length: Math.floor(headers.length / 2) }, (_, i): [string, any] => [headers[2 * i], headers[2 * i + 1]])
    : Object.entries(headers as Record<string, any>);
  pairs.forEach(([name, value]) => {
    if (value !== undefined) {
      res.setHeader(name, value);
    }
  });
};

function settleBeforeEnd(
  res: Response,
  core: PrismMiddlewareCore,
  paymentInfo: VerifiedPayment,
  protocolVersion: 1 | 2,
): void {
  const originalEnd = res.end.bind(res);
  const originalWrite = res.write.bind(res) as (...args: any[]) => boolean;
  const originalWriteHead = res.writeHead.bind(res) as (...args: any[]) => Response;
  const originalFlushHeaders = res.flushHeaders.bind(res);
  const held: Buffer[] = [];
  let endCalled = false;
  let released = false;

  (res as any).writeHead = function (statusCode: number, reasonOrHeaders?: any, headers?: any) {
    if (released) {
      return originalWriteHead(statusCode, reasonOrHeaders, headers);
    }
    res.statusCode = statusCode;
    if (typeof reasonOrHeaders === 'string') {
      res.statusMessage = reasonOrHeaders;
      applyHeaders(res, headers);
    } else {
      applyHeaders(res, reasonOrHeaders);
    }
    return res;
  };

  res.flushHeaders = function () {
    if (released) {
      originalFlushHeaders();
    }
  };

  (res as any).write = function (chunk: any, encodingOrCallback?: any, callback?: any): boolean {
    if (released) {
      return originalWrite(chunk, encodingOrCallback, callback);
    }
    const done = typeof encodingOrCallback === 'function' ? encodingOrCallback : callback;
    if (endCalled) {
      if (typeof done === 'function') {
        process.nextTick(done, new Error('write after end'));
      }
      return false;
    }
    held.push(toBuffer(chunk, encodingOf(encodingOrCallback)));
    if (typeof done === 'function') {
      process.nextTick(done);
    }
    return true;
  };

  const failClosed = (status: number, body: Record<string, unknown>) => {
    released = true;
    held.length = 0;
    if (!res.headersSent) {
      res.status(status);
      res.setHeader('Content-Type', 'application/json');
      res.removeHeader('Content-Length');
      res.removeHeader('Transfer-Encoding');
      res.removeHeader('ETag');
    }
    return originalEnd(JSON.stringify({ x402Version: protocolVersion, ...body }));
  };

  (res as any).end = async function (chunk?: any, encodingOrCallback?: any, callback?: any): Promise<any> {
    if (released) {
      return originalEnd(chunk, encodingOrCallback, callback);
    }
    if (endCalled) {
      return res;
    }
    endCalled = true;

    if (res.statusCode < 400) {
      try {
        const settlementResult = await core.settlementCallback(
          paymentInfo.payment,
          paymentInfo.paymentRequirements,
          res.statusCode,
        );

        if (settlementResult && settlementResult.success && settlementResult.transaction) {
          if (!res.headersSent) {
            const settlementBase64 = Buffer.from(JSON.stringify(settlementResult)).toString('base64');
            HeaderAdapter.setSettlementResponse(
              (name, value) => res.setHeader(name, value),
              settlementBase64,
              protocolVersion,
            );
          }
        } else if (!settlementResult || !settlementResult.success) {
          const errorReason = settlementResult?.errorReason || 'Settlement processing failed';
          console.error('Settlement failed:', errorReason);
          return failClosed(402, { error: 'Payment settlement failed', details: errorReason });
        }
      } catch (error: any) {
        console.error('Settlement error:', error);
        return failClosed(500, {
          error: 'Settlement processing error',
          details: 'An error occurred while settling the payment. Please try again.',
        });
      }
    }

    released = true;
    held.forEach((part) => originalWrite(part));
    held.length = 0;
    return originalEnd(chunk, encodingOrCallback, callback);
  };
}

const routePrice = (routes: RoutesConfig, path: string): number | undefined => {
  const matched = findMatchingRoute(path, routes);
  return matched ? parsePrice(routes[matched].price) : undefined;
};

/**
 * Payment requirement decorator for routes
 * 
 * @example
 * ```typescript
 * @Payment({ price: 0.01, description: 'Premium endpoint' })
 * @Get('/premium')
 * getPremium(@Payer() payer: string) {
 *   return { data: 'premium content', payer };
 * }
 * ```
 */
export const Payment = (config?: RoutePaymentConfig) =>
  applyDecorators(
    SetMetadata(PRISM_PAYMENT_KEY, config ?? true),
    UseGuards(PrismPaymentGuard),
  );

/**
 * Payer decorator to extract payer address from request
 * 
 * @example
 * ```typescript
 * @Get('/data')
 * getData(@Payer() payer: string) {
 *   return { payer, data: [...] };
 * }
 * ```
 */
export const Payer = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.payer;
  },
);

/**
 * Payment info decorator to extract full payment details
 */
export const PaymentInfo = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.payment;
  },
);

/**
 * Prism payment guard
 * 
 * Registered globally by PrismModule.forRoot and applied by @Payment, so it
 * does not need to be added with @UseGuards.
 */
@Injectable()
export class PrismPaymentGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject('PRISM_CORE') private core: PrismMiddlewareCore,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get payment config from decorator (handler first, then controller)
    const paymentConfig = this.reflector.getAllAndOverride<RoutePaymentConfig | true | undefined>(
      PRISM_PAYMENT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no payment decorator, allow access
    if (!paymentConfig) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const charged = (request as any)[PRISM_PAYMENT_HANDLED] as { price: number | undefined } | undefined;
    if (charged) {
      if (paymentConfig !== true && parsePrice(paymentConfig.price) !== charged.price) {
        throw new InternalServerErrorException('Payment is configured with conflicting prices for this route');
      }
      return true;
    }

    // Construct resource URL — prefer config.resourceBaseUrl to avoid Host header injection
    const guardBase = ((this.core as any).config.resourceBaseUrl ?? `${request.protocol}://${request.get('host')}`).replace(/\/$/, '');
    const resourceUrl = `${guardBase}${request.originalUrl}`;

    // Get payment header (supports both v1 X-PAYMENT and v2 PAYMENT-SIGNATURE)
    const paymentHeader = HeaderAdapter.getPaymentPayload((name) => request.header(name) || null);

    // Detect protocol version from header name or payload
    let protocolVersion: 1 | 2 = (this.core as any).config.x402Version || 2; // Default to v2
    if (paymentHeader) {
      const detected = detectProtocolVersion(paymentHeader);
      if (detected) {
        protocolVersion = detected;
      }
    }

    // Inline config applies to this route; a bare @Payment() uses the forRoot routes
    const tempCore = paymentConfig === true
      ? this.core
      : new PrismMiddlewareCore((this.core as any).config, { [requestPath(request)]: paymentConfig });

    // Process request
    const result = await tempCore.handleRequest({
      path: requestPath(request),
      paymentHeader: paymentHeader || undefined,
      resourceUrl,
      protocolVersion,
    });

    // If middleware handled the request (returned error or 402)
    if (result.handled) {
      // Set headers
      if (result.headers) {
        Object.entries(result.headers).forEach(([key, value]) => {
          response.setHeader(key, value);
        });
      }

      response.status(result.statusCode!).json(result.body);
      return false;
    }

    // Payment verified
    if (result.paymentInfo) {
      // Store payment info in request
      (request as any)[PRISM_PAYMENT_HANDLED] = {
        price: paymentConfig === true
          ? routePrice((this.core as any).routes, requestPath(request))
          : parsePrice(paymentConfig.price),
      };
      (request as any).payment = result.paymentInfo.payment;
      (request as any).payer = result.paymentInfo.payer;

      settleBeforeEnd(response, tempCore, result.paymentInfo, protocolVersion);

      return true;
    }

    // A @Payment route that was neither charged nor rejected must never reach the handler
    throw new InternalServerErrorException('Payment is required but no price is configured for this route');
  }
}

/**
 * Prism payment middleware (global route protection)
 */
@Injectable()
export class PrismPaymentMiddleware implements NestMiddleware {
  constructor(@Inject('PRISM_CORE') private core: PrismMiddlewareCore) { }

  async use(req: Request, res: Response, next: NextFunction) {
    // Construct resource URL — prefer config.resourceBaseUrl to avoid Host header injection
    const middlewareBase = ((this.core as any).config.resourceBaseUrl ?? `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    const resourceUrl = `${middlewareBase}${req.originalUrl}`;
    const paymentHeader = HeaderAdapter.getPaymentPayload((name) => req.header(name) || null);

    // Detect protocol version
    let protocolVersion: 1 | 2 = (this.core as any).config.x402Version || 2;
    if (paymentHeader) {
      const detected = detectProtocolVersion(paymentHeader);
      if (detected) {
        protocolVersion = detected;
      }
    }

    const result = await this.core.handleRequest({
      path: requestPath(req),
      paymentHeader: paymentHeader || undefined,
      resourceUrl,
      protocolVersion,
    });

    if (result.handled) {
      if (result.headers) {
        Object.entries(result.headers).forEach(([key, value]) => {
          res.setHeader(key, value);
        });
      }
      return res.status(result.statusCode!).json(result.body);
    }

    if (result.paymentInfo) {
      (req as any)[PRISM_PAYMENT_HANDLED] = { price: routePrice((this.core as any).routes, requestPath(req)) };
      (req as any).payment = result.paymentInfo.payment;
      (req as any).payer = result.paymentInfo.payer;
      settleBeforeEnd(res, this.core, result.paymentInfo, protocolVersion);
    }

    next();
  }
}

@Injectable()
export class PrismRouteValidator implements OnModuleInit {
  constructor(
    private discovery: DiscoveryService,
    private reflector: Reflector,
    @Inject('PRISM_OPTIONS') private options: PrismModuleOptions,
  ) { }

  onModuleInit() {
    if (Object.keys(this.options.routes ?? {}).length > 0) {
      return;
    }

    for (const wrapper of this.discovery.getControllers()) {
      const controller = wrapper.metatype as (Function & { prototype: any }) | null;
      if (!controller?.prototype) {
        continue;
      }
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = controller.prototype[name];
        if (name === 'constructor' || typeof handler !== 'function') {
          continue;
        }
        const config = this.reflector.getAllAndOverride<RoutePaymentConfig | true | undefined>(
          PRISM_PAYMENT_KEY,
          [handler, controller],
        );
        if (config === true) {
          throw new Error(
            `@Payment() on ${controller.name}.${name} has no price: pass a price to @Payment or configure routes in PrismModule.forRoot`,
          );
        }
      }
    }
  }
}

/**
 * Prism module for NestJS
 * 
 * @example
 * ```typescript
 * @Module({
 *   imports: [
 *     PrismModule.forRoot({
 *       apiKey: 'dev-key-123',
 *       routes: {
 *         '/api/premium': { price: 0.01, description: 'Premium API' }
 *       }
 *     })
 *   ]
 * })
 * export class AppModule {}
 * ```
 */
@Module({})
export class PrismModule {
  static forRoot(options: PrismModuleOptions): DynamicModule {
    const { routes = {}, ...config } = options;

    // Create middleware core instance
    const core = new PrismMiddlewareCore(config, routes);

    return {
      module: PrismModule,
      imports: [DiscoveryModule],
      providers: [
        {
          provide: 'PRISM_OPTIONS',
          useValue: options,
        },
        {
          provide: 'PRISM_CORE',
          useValue: core,
        },
        PrismPaymentGuard,
        PrismPaymentMiddleware,
        PrismRouteValidator,
        Reflector,
        {
          provide: APP_GUARD,
          useClass: PrismPaymentGuard,
        },
      ],
      exports: [PrismPaymentGuard, PrismPaymentMiddleware, 'PRISM_CORE'],
      global: true,
    };
  }
}
