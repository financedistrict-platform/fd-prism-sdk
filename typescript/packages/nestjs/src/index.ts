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
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response, NextFunction } from 'express';
import {
  PrismMiddlewareCore,
  type PrismMiddlewareConfig,
  type RoutesConfig,
  type RoutePaymentConfig,
  HeaderAdapter,
  detectProtocolVersion,
} from '@financedistrict/prism-x402-sdk';

/**
 * Prism module configuration
 */
export interface PrismModuleOptions extends PrismMiddlewareConfig {
  routes?: RoutesConfig;
}

const PRISM_PAYMENT_KEY = 'prism:payment';

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
export const Payment = (config: RoutePaymentConfig) => SetMetadata(PRISM_PAYMENT_KEY, config);

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
 * @example
 * ```typescript
 * @UseGuards(PrismPaymentGuard)
 * @Controller('api')
 * export class ApiController { ... }
 * ```
 */
@Injectable()
export class PrismPaymentGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Inject('PRISM_CORE') private core: PrismMiddlewareCore,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get payment config from decorator
    const paymentConfig = this.reflector.get<RoutePaymentConfig>(
      PRISM_PAYMENT_KEY,
      context.getHandler(),
    );

    // If no payment config, allow access
    if (!paymentConfig) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    // Construct resource URL
    const resourceUrl = `${request.protocol}://${request.get('host')}${request.originalUrl}`;

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

    // Build routes config for this endpoint
    const routes: RoutesConfig = {
      [request.path]: paymentConfig,
    };

    // Create temporary core with this route
    const tempCore = new PrismMiddlewareCore(
      (this.core as any).config,
      routes,
    );

    // Process request
    const result = await tempCore.handleRequest({
      path: request.path,
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
      (request as any).payment = result.paymentInfo.payment;
      (request as any).payer = result.paymentInfo.payer;

      // Add settlement callback
      const originalEnd = response.end.bind(response);
      let endCalled = false;

      (response as any).end = async function (chunk?: any, encodingOrCallback?: any, callback?: any): Promise<any> {
        if (endCalled) {
          return originalEnd(chunk, encodingOrCallback, callback);
        }
        endCalled = true;

        if (response.statusCode < 400) {
          try {
            const settlementResult = await tempCore.settlementCallback(
              result.paymentInfo!.payment,
              result.paymentInfo!.paymentRequirements,
              response.statusCode
            );

            if (settlementResult && settlementResult.success && settlementResult.transaction) {
              if (!response.headersSent) {
                const settlementResponse = JSON.stringify(settlementResult);
                const settlementBase64 = Buffer.from(settlementResponse).toString('base64');
                HeaderAdapter.setSettlementResponse(
                  (name, value) => response.setHeader(name, value),
                  settlementBase64,
                  protocolVersion
                );
              }
            } else if (!settlementResult || (settlementResult && !settlementResult.success)) {
              // Settlement failed or returned null - DO NOT send data, return 402 Payment Required
              const errorReason = settlementResult?.errorReason || 'Settlement processing failed';
              console.error('Settlement failed:', errorReason);
              if (!response.headersSent) {
                response.status(402);
                response.setHeader('Content-Type', 'application/json');
              }
              return originalEnd(JSON.stringify({
                x402Version: protocolVersion,
                error: 'Payment settlement failed',
                details: errorReason,
              }));
            }
          } catch (error: any) {
            console.error('Settlement error:', error);
            // Settlement error - DO NOT send data, return 500 error
            if (!response.headersSent) {
              response.status(500);
              response.setHeader('Content-Type', 'application/json');
            }
            return originalEnd(JSON.stringify({
              x402Version: protocolVersion,
              error: 'Settlement processing error',
              details: 'An error occurred while settling the payment. Please try again.',
            }));
          }
        }

        return originalEnd(chunk, encodingOrCallback, callback);
      };
    }

    return true;
  }
}

/**
 * Prism payment middleware (global route protection)
 */
@Injectable()
export class PrismPaymentMiddleware implements NestMiddleware {
  constructor(@Inject('PRISM_CORE') private core: PrismMiddlewareCore) { }

  async use(req: Request, res: Response, next: NextFunction) {
    const resourceUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
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
      path: req.path,
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
      (req as any).payment = result.paymentInfo.payment;
      (req as any).payer = result.paymentInfo.payer;

      const originalEnd = res.end.bind(res);
      let endCalled = false;

      (res as any).end = async function (chunk?: any, encodingOrCallback?: any, callback?: any): Promise<any> {
        if (endCalled) {
          return originalEnd(chunk, encodingOrCallback, callback);
        }
        endCalled = true;

        if (res.statusCode < 400) {
          try {
            const settlementResult = await (this as any).core.settlementCallback(
              result.paymentInfo!.payment,
              result.paymentInfo!.paymentRequirements,
              res.statusCode
            );

            if (settlementResult && settlementResult.success && settlementResult.transaction) {
              if (!res.headersSent) {
                const settlementResponse = JSON.stringify(settlementResult);
                const settlementBase64 = Buffer.from(settlementResponse).toString('base64');
                HeaderAdapter.setSettlementResponse(
                  (name, value) => res.setHeader(name, value),
                  settlementBase64,
                  protocolVersion
                );
              }
            } else if (!settlementResult || (settlementResult && !settlementResult.success)) {
              // Settlement failed or returned null - DO NOT send data, return 402 Payment Required
              const errorReason = settlementResult?.errorReason || 'Settlement processing failed';
              console.error('Settlement failed:', errorReason);
              if (!res.headersSent) {
                res.status(402);
                res.setHeader('Content-Type', 'application/json');
              }
              return originalEnd(JSON.stringify({
                x402Version: protocolVersion,
                error: 'Payment settlement failed',
                details: errorReason,
              }));
            }
          } catch (error: any) {
            console.error('Settlement error:', error);
            // Settlement error - DO NOT send data, return 500 error
            if (!res.headersSent) {
              res.status(500);
              res.setHeader('Content-Type', 'application/json');
            }
            return originalEnd(JSON.stringify({
              x402Version: protocolVersion,
              error: 'Settlement processing error',
              details: 'An error occurred while settling the payment. Please try again.',
            }));
          }
        }

        return originalEnd(chunk, encodingOrCallback, callback);
      };
    }

    next();
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
        Reflector,
      ],
      exports: [PrismPaymentGuard, PrismPaymentMiddleware, 'PRISM_CORE'],
      global: true,
    };
  }
}
