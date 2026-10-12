import 'reflect-metadata';
import { Controller, Get, INestApplication, MiddlewareConsumer, Module, NestModule, RequestMethod, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Payer, PrismModule, PrismPaymentMiddleware } from '../index';

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
class ApiController {
  @Get('premium')
  premium(@Payer() payer: string) {
    handlerSpy('premium');
    return { data: 'Premium content', payer };
  }

  @Get('stream')
  stream(@Res() res: Response) {
    handlerSpy('stream');
    res.setHeader('Content-Type', 'text/plain');
    res.write('secret-chunk-1;');
    res.end('secret-chunk-2');
  }

  @Get('stream-head')
  streamHead(@Res() res: Response) {
    handlerSpy('stream-head');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.flushHeaders();
    res.write('secret-chunk-1;');
    res.end('secret-chunk-2');
  }

  @Get('free')
  free() {
    handlerSpy('free');
    return { data: 'Free content' };
  }
}

type Target = Parameters<ReturnType<MiddlewareConsumer['apply']>['forRoutes']>[0];

async function createApp(
  target: Target,
  routes: Record<string, { price: string; description?: string }> = {
    '/api/premium': { price: '10000' },
    '/api/stream': { price: '10000' },
    '/api/stream-head': { price: '10000' },
  },
): Promise<INestApplication> {
  @Module({
    imports: [PrismModule.forRoot({ apiKey: 'test-api-key', allowedVersions: [1, 2], client: mockClient as any, routes })],
    controllers: [ApiController],
  })
  class TestAppModule implements NestModule {
    configure(consumer: MiddlewareConsumer) {
      consumer.apply(PrismPaymentMiddleware).forRoutes(target);
    }
  }

  const moduleRef = await Test.createTestingModule({ imports: [TestAppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}

describe('PrismPaymentMiddleware registered globally', () => {
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

  const targets: Array<[string, () => Target]> = [
    ["forRoutes('*')", () => '*'],
    ["forRoutes({ path: '*', method: ALL })", () => ({ path: '*', method: RequestMethod.ALL })],
    ["forRoutes({ path: '*', method: GET })", () => ({ path: '*', method: RequestMethod.GET })],
    ['forRoutes(controller)', () => ApiController],
  ];

  describe.each(targets)('%s', (_label, target) => {
    it('returns 402 for a priced route without a payment', async () => {
      app = await createApp(target());

      const response = await request(app.getHttpServer()).get('/api/premium');

      expect(response.status).toBe(402);
      expect(handlerSpy).not.toHaveBeenCalled();
    });

    it('verifies once and settles once for a valid payment', async () => {
      app = await createApp(target());

      const response = await request(app.getHttpServer())
        .get('/api/premium')
        .set('X-Payment', paymentHeader);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ data: 'Premium content', payer: '0xabcdef1234567890' });
      expect(mockVerifyPayment).toHaveBeenCalledTimes(1);
      expect(mockSettlePayment).toHaveBeenCalledTimes(1);
      expect(response.headers['x-payment-response']).toBeDefined();
    });

    it('does not run the handler when verification fails', async () => {
      mockVerifyPayment.mockResolvedValue({ isValid: false, error: 'Invalid signature' });
      app = await createApp(target());

      const response = await request(app.getHttpServer())
        .get('/api/premium')
        .set('X-Payment', paymentHeader);

      expect(response.status).toBe(402);
      expect(handlerSpy).not.toHaveBeenCalled();
      expect(mockSettlePayment).not.toHaveBeenCalled();
    });

    it('withholds the response when settlement fails', async () => {
      mockSettlePayment.mockResolvedValue({ success: false, errorReason: 'insufficient funds' });
      app = await createApp(target());

      const response = await request(app.getHttpServer())
        .get('/api/premium')
        .set('X-Payment', paymentHeader);

      expect(response.status).toBe(402);
      expect(response.body).not.toHaveProperty('data');
    });

    it('withholds the response when settlement throws', async () => {
      mockSettlePayment.mockRejectedValue(new Error('facilitator down'));
      app = await createApp(target());

      const response = await request(app.getHttpServer())
        .get('/api/premium')
        .set('X-Payment', paymentHeader);

      expect(response.status).toBe(402);
      expect(response.body).not.toHaveProperty('data');
    });

    describe.each(['stream', 'stream-head'])('streaming handler on /api/%s', (route) => {
      it('delivers every chunk once settlement succeeds', async () => {
        app = await createApp(target());

        const response = await request(app.getHttpServer())
          .get(`/api/${route}`)
          .set('X-Payment', paymentHeader);

        expect(response.status).toBe(200);
        expect(response.text).toBe('secret-chunk-1;secret-chunk-2');
        expect(response.headers['x-payment-response']).toBeDefined();
        expect(mockSettlePayment).toHaveBeenCalledTimes(1);
      });

      it('returns a clean 402 without any chunk when settlement fails', async () => {
        mockSettlePayment.mockResolvedValue({ success: false, errorReason: 'insufficient funds' });
        app = await createApp(target());

        const response = await request(app.getHttpServer())
          .get(`/api/${route}`)
          .set('X-Payment', paymentHeader);

        expect(response.status).toBe(402);
        expect(response.text).not.toContain('secret-chunk');
        expect(response.body).toMatchObject({ error: 'Payment settlement failed' });
      });

      it('returns a clean error without any chunk when settlement throws', async () => {
        mockSettlePayment.mockRejectedValue(new Error('facilitator down'));
        app = await createApp(target());

        const response = await request(app.getHttpServer())
          .get(`/api/${route}`)
          .set('X-Payment', paymentHeader);

        expect(response.status).toBe(402);
        expect(response.text).not.toContain('secret-chunk');
      });
    });

    it('leaves unpriced routes free', async () => {
      app = await createApp(target());

      const response = await request(app.getHttpServer()).get('/api/free');

      expect(response.status).toBe(200);
      expect(mockVerifyPayment).not.toHaveBeenCalled();
    });

  });
});
