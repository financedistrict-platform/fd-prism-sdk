/**
 * @1stdigital/prism-nestjs
 * NestJS module for Prism payment protocol
 * 
 * @status COMING SOON - Q1 2025
 */

import { Module, Injectable, CanActivate, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { PrismMiddlewareConfig, RoutePaymentConfig } from '@1stdigital/prism-core';

/**
 * Prism module configuration
 */
export interface PrismModuleOptions extends PrismMiddlewareConfig {
  routes?: Record<string, RoutePaymentConfig>;
}

/**
 * Payment requirement decorator
 * @example
 * ```typescript
 * @Payment({ price: 0.01, description: 'Premium endpoint' })
 * @Get('/premium')
 * getPremium() {
 *   return { data: 'premium content' };
 * }
 * ```
 */
export const Payment = (config: RoutePaymentConfig) => SetMetadata('prism:payment', config);

/**
 * Prism payment guard
 * @example
 * ```typescript
 * @UseGuards(PrismPaymentGuard)
 * @Controller('api')
 * export class ApiController { ... }
 * ```
 */
@Injectable()
export class PrismPaymentGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // TODO: Implement payment guard logic
    console.warn('Prism NestJS guard is not yet implemented');
    return true;
  }
}

/**
 * Prism module
 * @example
 * ```typescript
 * @Module({
 *   imports: [
 *     PrismModule.forRoot({
 *       apiKey: 'your-api-key',
 *       useSandbox: true
 *     })
 *   ]
 * })
 * export class AppModule {}
 * ```
 */
@Module({
  providers: [PrismPaymentGuard],
  exports: [PrismPaymentGuard],
})
export class PrismModule {
  static forRoot(options: PrismModuleOptions) {
    return {
      module: PrismModule,
      providers: [
        {
          provide: 'PRISM_OPTIONS',
          useValue: options,
        },
        PrismPaymentGuard,
      ],
      exports: [PrismPaymentGuard],
    };
  }
}
