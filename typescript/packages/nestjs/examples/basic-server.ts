/**
 * Basic NestJS Server Example with Prism Payment Module
 * 
 * This example demonstrates how to set up a NestJS app with payment-protected routes.
 */

import { Module, Controller, Get, UseGuards } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  PrismModule,
  PrismPaymentGuard,
  Payment,
  Payer,
} from '@financedistrict/prism-x402-sdk-nestjs';

/**
 * API Controller with payment-protected endpoints
 */
@Controller('api')
@UseGuards(PrismPaymentGuard)
export class ApiController {
  // Payment-protected endpoint using decorator
  @Payment({ price: 0.01, description: 'Premium API access' })
  @Get('premium')
  getPremium(@Payer() payer: string) {
    return {
      message: 'Welcome to Premium API!',
      payer,
      data: {
        premium: true,
        features: ['Advanced analytics', 'Priority support', 'Custom integrations'],
      },
    };
  }

  @Payment({ price: '$0.001', description: 'Weather data access' })
  @Get('weather')
  getWeather(@Payer() payer: string) {
    return {
      location: 'San Francisco',
      temperature: 72,
      condition: 'Sunny',
      humidity: 65,
      payer,
    };
  }
}

/**
 * Data Controller with wildcard route
 */
@Controller('data')
@UseGuards(PrismPaymentGuard)
export class DataController {
  @Payment({ price: 0.005, description: 'Data API access' })
  @Get(':resource')
  getData(@Payer() payer: string) {
    return {
      resource: 'users',
      data: ['item1', 'item2', 'item3'],
      payer,
    };
  }
}

/**
 * Home Controller (free routes)
 */
@Controller()
export class HomeController {
  @Get()
  getHome() {
    return {
      html: `
        <html>
          <head><title>Prism NestJS Demo</title></head>
          <body>
            <h1>Prism NestJS Payment Demo</h1>
            <p>This is a free route. Try these payment-protected routes:</p>
            <ul>
              <li><a href="/api/premium">/api/premium</a> - Premium API (0.01 ETH)</li>
              <li><a href="/api/weather">/api/weather</a> - Weather data ($0.001)</li>
              <li><a href="/data/users">/data/users</a> - Data API (0.005 ETH)</li>
            </ul>
            <p>Without payment, you'll receive a 402 Payment Required response.</p>
          </body>
        </html>
      `,
    };
  }
}

/**
 * App Module
 */
@Module({
  imports: [
    PrismModule.forRoot({
      // API Configuration
      apiKey: process.env.PRISM_API_KEY || 'dev-key-123',
      baseUrl: process.env.PRISM_BASE_URL || 'https://prism-gw.test.1stdigital.tech',

      // Enable debug mode
      debug: true,
    }),
  ],
  controllers: [HomeController, ApiController, DataController],
})
export class AppModule { }

/**
 * Bootstrap application
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const PORT = Number(process.env.PORT) || 3000;
  await app.listen(PORT);

  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Routes:');
  console.log('  GET /              - Free route');
  console.log('  GET /api/premium   - Requires payment (0.01 ETH)');
  console.log('  GET /api/weather   - Requires payment ($0.001)');
  console.log('  GET /data/:resource - Requires payment (0.005 ETH)');
}

bootstrap();
