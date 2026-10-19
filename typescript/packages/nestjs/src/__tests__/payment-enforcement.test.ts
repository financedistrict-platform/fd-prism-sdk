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

const requirement = {
  scheme: 'exact',
  network: 'eip155:84532',
  amount: '10000',
  asset: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  payTo: '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01',
  maxTimeoutSeconds: 60,
};

const requirements = {
  x402Version: 2,
  accepts: [requirement],
};

let nonceSequence = 0;

const paymentHeader = () =>
  Buffer.from(
    JSON.stringify({
      x402Version: 2,
      accepted: requirement,
      payload: {
        signature: '0xsignature123',
        authorization: {
          from: '0x1111111111111111111111111111111111111111',
          to: requirement.payTo,
          value: '10000',
          validAfter: '0',
          validBefore: '9999999999',
          nonce: `0x${(++nonceSequence).toString(16)}`,
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

@Controller('api')
class StrictPriceController {
  @Payment({ price: '$5.00', description: 'Strict price' })
  @Get('strict')
  strict() {
    handlerSpy('strict');
    return { data: 'Strict content' };
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
  PrismModule.forRoot({ apiKey: 'test-api-key', allowedVersions: [2], client: mockClient as any, routes });

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

async function createAppWithMiddlewareFor(
  routes: Record<string, { price: string }>,
  controller: any,
): Promise<INestApplication> {
  @Module({ imports: [prismModule(routes)], controllers: [controller] })
  class OverlapAppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
      consumer.apply(PrismPaymentMiddleware).forRoutes(controller);
    }
  }

  const moduleRef = await Test.createTestingModule({ imports: [OverlapAppModule] }).compile();
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
        .set('Payment-Signature', paymentHeader());

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: 'Premium content', payer: '0xabcdef1234567890' });
      expect(mockVerifyPayment).toHaveBeenCalledTimes(1);
      expect(mockSettlePayment).toHaveBeenCalledTimes(1);
    });

    it('refuses a replayed proof on an inline-priced route', async () => {
      app = await createApp([prismModule()], [InlineConfigController]);
      const proof = paymentHeader();

      const first = await request(app.getHttpServer()).get('/api/premium').set('Payment-Signature', proof);
      const replay = await request(app.getHttpServer()).get('/api/premium').set('Payment-Signature', proof);

      expect(first.status).toBe(200);
      expect(replay.status).toBe(402);
      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(mockSettlePayment).toHaveBeenCalledTimes(1);
    });

    it('does not run the handler when the payment is invalid', async () => {
      mockVerifyPayment.mockResolvedValue({ isValid: false, error: 'Invalid signature' });
      app = await createApp([prismModule()], [InlineConfigController]);

      const response = await request(app.getHttpServer())
        .get('/api/premium')
        .set('Payment-Signature', paymentHeader());

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
        .set('Payment-Signature', paymentHeader());

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
        .set('Payment-Signature', paymentHeader());

      expect(response.status).toBe(500);
      expect(handlerSpy).not.toHaveBeenCalled();
      expect(mockVerifyPayment).not.toHaveBeenCalled();
    });
  });

  describe('middleware and inline @Payment price overlap', () => {
    it('does not serve a $5.00 route that the middleware priced at $0.001', async () => {
      app = await createAppWithMiddlewareFor({ '/api/*': { price: '$0.001' } }, StrictPriceController);

      const response = await request(app.getHttpServer())
        .get('/api/strict')
        .set('Payment-Signature', paymentHeader());

      expect(response.status).toBe(500);
      expect(handlerSpy).not.toHaveBeenCalled();
      expect(mockSettlePayment).not.toHaveBeenCalled();
    });

    it('does not serve a route that the middleware priced above the inline price', async () => {
      app = await createAppWithMiddlewareFor({ '/api/*': { price: '$50.00' } }, StrictPriceController);

      const response = await request(app.getHttpServer())
        .get('/api/strict')
        .set('Payment-Signature', paymentHeader());

      expect(response.status).toBe(500);
      expect(handlerSpy).not.toHaveBeenCalled();
      expect(mockSettlePayment).not.toHaveBeenCalled();
    });

    it('serves and settles once when the middleware and inline prices agree', async () => {
      app = await createAppWithMiddlewareFor({ '/api/*': { price: '5' } }, StrictPriceController);

      const response = await request(app.getHttpServer())
        .get('/api/strict')
        .set('Payment-Signature', paymentHeader());

      expect(response.status).toBe(200);
      expect(mockVerifyPayment).toHaveBeenCalledTimes(1);
      expect(mockSettlePayment).toHaveBeenCalledTimes(1);
    });
  });

  describe('bare @Payment() startup validation', () => {
    it('refuses to start when no routes are configured', async () => {
      await expect(createApp([prismModule()], [RouteConfigController])).rejects.toThrow(
        /RouteConfigController\.premium has no price/,
      );
    });

    it('starts when routes are configured', async () => {
      app = await createApp([prismModule({ '/api/premium': { price: '10000' } })], [RouteConfigController]);

      expect(app).toBeDefined();
    });

    it('starts when every @Payment carries an inline price', async () => {
      app = await createApp([prismModule()], [InlineConfigController, ClassLevelController]);

      expect(app).toBeDefined();
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
        .set('Payment-Signature', paymentHeader());

      expect(response.status).toBe(200);
      expect(mockVerifyPayment).toHaveBeenCalledTimes(1);
      expect(mockSettlePayment).toHaveBeenCalledTimes(1);
    });

    it('verifies and settles a request once when PrismPaymentMiddleware also covers the route', async () => {
      app = await createAppWithMiddleware({ '/api/premium': { price: '10000' } });

      const response = await request(app.getHttpServer())
        .get('/api/premium')
        .set('Payment-Signature', paymentHeader());

      expect(response.status).toBe(200);
      expect(mockVerifyPayment).toHaveBeenCalledTimes(1);
      expect(mockSettlePayment).toHaveBeenCalledTimes(1);
    });
  });
});

const PAID_CONTENT = 'paid-content-secret';

@Controller('held')
class HeldContentController {
  @Payment({ price: '10000', description: 'Held content' })
  @Get('small')
  small() {
    handlerSpy('small');
    return { content: PAID_CONTENT };
  }

  @Payment({ price: '10000', description: 'Held content' })
  @Get('large')
  large() {
    handlerSpy('large');
    return { content: PAID_CONTENT.repeat(64) };
  }
}

describe('PrismModule settlement before delivery', () => {
  let app: INestApplication | undefined;

  const heldModule = () =>
    PrismModule.forRoot({ apiKey: 'test-api-key', client: mockClient as any, maxHeldResponseBytes: 256 });

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    mockGetPaymentRequirements.mockResolvedValue(requirements);
    mockVerifyPayment.mockResolvedValue({ isValid: true, payer: '0x1111111111111111111111111111111111111111' });
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it.each([
    ['success without a transaction', { success: true }],
    ['an empty transaction', { success: true, transaction: '' }],
    ['a declined settlement', { success: false, errorReason: 'insufficient_funds' }],
  ])('withholds the content on %s', async (_label, reply) => {
    mockSettlePayment.mockResolvedValue(reply);
    app = await createApp([heldModule()], [HeldContentController]);

    const response = await request(app.getHttpServer()).get('/held/small').set('Payment-Signature', paymentHeader());

    expect(response.status).toBe(402);
    expect(response.text).not.toContain(PAID_CONTENT);
    expect(response.headers['payment-response']).toBeUndefined();
  });

  it('delivers the content once the transaction is settled', async () => {
    mockSettlePayment.mockResolvedValue({ success: true, transaction: '0x1' });
    app = await createApp([heldModule()], [HeldContentController]);

    const response = await request(app.getHttpServer()).get('/held/small').set('Payment-Signature', paymentHeader());

    expect(response.status).toBe(200);
    expect(response.text).toContain(PAID_CONTENT);
    expect(response.headers['payment-response']).toBeDefined();
  });

  it('does not send a body larger than the hold limit and does not settle it', async () => {
    mockSettlePayment.mockResolvedValue({ success: true, transaction: '0x1' });
    app = await createApp([heldModule()], [HeldContentController]);

    const response = await request(app.getHttpServer()).get('/held/large').set('Payment-Signature', paymentHeader());

    expect(response.status).toBe(500);
    expect(response.text).not.toContain(PAID_CONTENT);
    expect(mockSettlePayment).not.toHaveBeenCalled();
  });
});
