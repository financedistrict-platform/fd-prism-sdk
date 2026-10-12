import 'reflect-metadata';
import { Controller, Get, INestApplication, MiddlewareConsumer, Module, NestModule, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Payer, Payment, PrismModule, PrismPaymentGuard, PrismPaymentMiddleware } from '../index';

const mockGetPaymentRequirements = jest.fn();
const mockVerifyPayment = jest.fn();
const mockSettlePayment = jest.fn();
const mockGetAuthInfo = jest.fn();
const handlerSpy = jest.fn();

const mockClient = {
  getPaymentRequirements: mockGetPaymentRequirements,
  verifyPayment: mockVerifyPayment,
  settlePayment: mockSettlePayment,
  getAuthInfo: mockGetAuthInfo,
};

const requirements = {
  x402Version: 1,
  accepts: [
    {
      scheme: 'eip3009',
      network: '1',
      maxAmountRequired: '10000',
      resource: 'http://127.0.0.1/api/premium',
      description: 'Premium API access',
      mimeType: 'application/json',
      payTo: '0x1234567890abcdef',
      maxTimeoutSeconds: 60,
      asset: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      extra: null,
    },
  ],
};

const paymentHeader = Buffer.from(
  JSON.stringify({
    x402Version: 1,
    scheme: 'eip3009',
    network: '1',
    asset: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    payload: {
      signature: '0xsignature123',
      authorization: {
        from: '0xabcdef1234567890',
        to: '0x1234567890abcdef',
        value: '10000',
        validAfter: '0',
        validBefore: '9999999999',
        nonce: '0x01',
      },
    },
  }),
).toString('base64');

@Controller('api')
class InlineConfigController {
  @Payment({ price: '10000', description: 'Premium API access' })
  @Get('premium')
  premium(@Payer() payer: string) {
    handlerSpy('premium');
    return { data: 'Premium content', payer };
  }

  @Get('free')
  free() {
    handlerSpy('free');
    return { data: 'Free content' };
  }
}

@Controller('api')
class RouteConfigController {
  @Payment()
  @Get('premium')
  premium(@Payer() payer: string) {
    handlerSpy('premium');
    return { data: 'Premium content', payer };
  }

  @Payment()
  @Get('unpriced')
  unpriced() {
    handlerSpy('unpriced');
    return { data: 'Unpriced content' };
  }
}

@Payment({ price: '10000', description: 'Whole controller' })
@Controller('vault')
class ClassLevelController {
  @Get('a')
  a() {
    handlerSpy('a');
    return { data: 'a' };
  }
}

@UseGuards(PrismPaymentGuard)
@Controller('legacy')
class ExplicitGuardController {
  @Payment({ price: '10000', description: 'Explicit guard' })
  @Get('premium')
  premium() {
    handlerSpy('legacy');
    return { data: 'Legacy content' };
  }
}

const prismModule = (routes: Record<string, { price: string; description?: string }> = {}) =>
  PrismModule.forRoot({ apiKey: 'test-api-key', client: mockClient as any, routes });

async function createAppWithMiddleware(routes: Record<string, { price: string }>): Promise<INestApplication> {
  @Module({ imports: [prismModule(routes)], controllers: [InlineConfigController] })
  class MiddlewareAppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
      consumer.apply(PrismPaymentMiddleware).forRoutes(InlineConfigController);
    }
  }

  const moduleRef = await Test.createTestingModule({ imports: [MiddlewareAppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

async function createApp(imports: any[], controllers: any[]): Promise<INestApplication> {
  @Module({ imports, controllers })
  class TestAppModule { }

  const moduleRef = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('PrismModule payment enforcement', () => {
  let app: INestApplication | undefined;

  beforeEach(() => {
    mockGetPaymentRequirements.mockResolvedValue(requirements);
    mockVerifyPayment.mockResolvedValue({ isValid: true, payer: '0xabcdef1234567890' });
    mockSettlePayment.mockResolvedValue({
      success: true,
      payer: '0xabcdef1234567890',
      transaction: '0xtxhash123',
      network: '1',
    });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  describe('forRoot registers the guard globally', () => {
    it('returns 402 for a @Payment route without @UseGuards', async () => {
      app = await createApp([prismModule()], [InlineConfigController]);

      const response = await request(app.getHttpServer()).get('/api/premium');

      expect(response.status).toBe(402);
      expect(handlerSpy).not.toHaveBeenCalled();
    });

    it('serves the route once a valid payment is presented', async () => {
      app = await createApp([prismModule()], [InlineConfigController]);

      const response = await request(app.getHttpServer())
        .get('/api/premium')
        .set('X-Payment', paymentHeader);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: 'Premium content', payer: '0xabcdef1234567890' });
      expect(mockVerifyPayment).toHaveBeenCalledTimes(1);
      expect(mockSettlePayment).toHaveBeenCalledTimes(1);
    });

    it('does not run the handler when the payment is invalid', async () => {
      mockVerifyPayment.mockResolvedValue({ isValid: false, error: 'Invalid signature' });
      app = await createApp([prismModule()], [InlineConfigController]);

      const response = await request(app.getHttpServer())
        .get('/api/premium')
        .set('X-Payment', paymentHeader);

      expect(response.status).toBe(402);
      expect(handlerSpy).not.toHaveBeenCalled();
      expect(mockSettlePayment).not.toHaveBeenCalled();
    });

    it('leaves undecorated routes free', async () => {
      app = await createApp([prismModule()], [InlineConfigController]);

      const response = await request(app.getHttpServer()).get('/api/free');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: 'Free content' });
    });

    it('enforces a class-level @Payment on every handler', async () => {
      app = await createApp([prismModule()], [ClassLevelController]);

      const response = await request(app.getHttpServer()).get('/vault/a');

      expect(response.status).toBe(402);
      expect(handlerSpy).not.toHaveBeenCalled();
    });
  });

  describe('@Payment() without inline config', () => {
    it('takes the price from the forRoot routes and returns 402 without payment', async () => {
      app = await createApp(
        [prismModule({ '/api/premium': { price: '10000', description: 'Premium API' } })],
        [RouteConfigController],
      );

      const response = await request(app.getHttpServer()).get('/api/premium');

      expect(response.status).toBe(402);
      expect(handlerSpy).not.toHaveBeenCalled();
    });

    it('serves the route once a valid payment is presented', async () => {
      app = await createApp(
        [prismModule({ '/api/premium': { price: '10000', description: 'Premium API' } })],
        [RouteConfigController],
      );

      const response = await request(app.getHttpServer())
        .get('/api/premium')
        .set('X-Payment', paymentHeader);

      expect(response.status).toBe(200);
      expect(mockSettlePayment).toHaveBeenCalledTimes(1);
    });

    it('fails closed when no price is configured for the route', async () => {
      app = await createApp(
        [prismModule({ '/api/premium': { price: '10000' } })],
        [RouteConfigController],
      );

      const response = await request(app.getHttpServer())
        .get('/api/unpriced')
        .set('X-Payment', paymentHeader);

      expect(response.status).toBe(500);
      expect(handlerSpy).not.toHaveBeenCalled();
      expect(mockVerifyPayment).not.toHaveBeenCalled();
    });
  });

  describe('fail closed without the guard', () => {
    it('refuses to start an app that uses @Payment without PrismModule', async () => {
      await expect(createApp([], [InlineConfigController])).rejects.toThrow();
    });
  });

  describe('guard applied more than once', () => {
    it('verifies and settles a request once when @UseGuards is also present', async () => {
      app = await createApp([prismModule()], [ExplicitGuardController]);

      const response = await request(app.getHttpServer())
        .get('/legacy/premium')
        .set('X-Payment', paymentHeader);

      expect(response.status).toBe(200);
      expect(mockVerifyPayment).toHaveBeenCalledTimes(1);
      expect(mockSettlePayment).toHaveBeenCalledTimes(1);
    });

    it('verifies and settles a request once when PrismPaymentMiddleware also covers the route', async () => {
      app = await createAppWithMiddleware({ '/api/premium': { price: '10000' } });

      const response = await request(app.getHttpServer())
        .get('/api/premium')
        .set('X-Payment', paymentHeader);

      expect(response.status).toBe(200);
      expect(mockVerifyPayment).toHaveBeenCalledTimes(1);
      expect(mockSettlePayment).toHaveBeenCalledTimes(1);
    });
  });
});
