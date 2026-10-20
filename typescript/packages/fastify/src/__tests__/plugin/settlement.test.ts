import Fastify, { FastifyInstance } from 'fastify';
import prismPlugin from '../../index';

const mockGetPaymentRequirements = jest.fn();
const mockVerifyPayment = jest.fn();
const mockSettlePayment = jest.fn();

const PAY_TO = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
const PAID_CONTENT = 'paid-content-secret';

const requirement = {
  scheme: 'exact',
  network: 'eip155:84532',
  amount: '10000',
  asset: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  payTo: PAY_TO,
  maxTimeoutSeconds: 60,
};

const requirements = { x402Version: 2, accepts: [requirement] };

let nonceCounter = 0;

const paymentHeader = () =>
  Buffer.from(
    JSON.stringify({
      x402Version: 2,
      accepted: requirement,
      payload: {
        signature: '0xsignature',
        authorization: {
          from: '0x1111111111111111111111111111111111111111',
          to: PAY_TO,
          value: '10000',
          validAfter: '0',
          validBefore: '9999999999',
          nonce: `0xfastify-settlement-${++nonceCounter}`,
        },
      },
    })
  ).toString('base64');

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(prismPlugin, {
    apiKey: 'test-api-key',
    client: {
      getPaymentRequirements: mockGetPaymentRequirements,
      verifyPayment: mockVerifyPayment,
      settlePayment: mockSettlePayment,
      getAuthInfo: jest.fn(),
    } as any,
    routes: {
      '/paid/send': { price: '10000', description: 'Paid send' },
      '/paid/raw': { price: '10000', description: 'Paid raw' },
    },
  });
  app.get('/paid/send', async (_request, reply) => {
    reply.send({ content: PAID_CONTENT });
  });
  app.get('/paid/raw', (_request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, { 'Content-Type': 'text/plain' });
    reply.raw.write(PAID_CONTENT);
    reply.raw.end();
  });
  await app.ready();
  return app;
}

describe('fastify settlement before delivery', () => {
  let app: FastifyInstance | undefined;

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

  describe.each([
    ['reply.send', '/paid/send'],
    ['reply.hijack with raw writes', '/paid/raw'],
  ])('%s', (_label, url) => {
    it.each([
      ['a declined settlement', { success: false, errorReason: 'insufficient_funds' }],
      ['success without a transaction', { success: true }],
      ['an empty transaction', { success: true, transaction: '' }],
    ])('withholds the content on %s', async (_reason, reply) => {
      mockSettlePayment.mockResolvedValue(reply);
      app = await buildApp();

      const response = await app.inject({ method: 'GET', url, headers: { 'payment-signature': paymentHeader() } });

      expect(response.statusCode).toBe(402);
      expect(response.body).not.toContain(PAID_CONTENT);
      expect(response.headers['payment-response']).toBeUndefined();
    });

    it('withholds the content when settlement throws', async () => {
      mockSettlePayment.mockRejectedValue(new Error('gateway down'));
      app = await buildApp();

      const response = await app.inject({ method: 'GET', url, headers: { 'payment-signature': paymentHeader() } });

      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.body).not.toContain(PAID_CONTENT);
    });

    it('delivers the content once the transaction is settled', async () => {
      mockSettlePayment.mockResolvedValue({ success: true, transaction: '0x1' });
      app = await buildApp();

      const response = await app.inject({ method: 'GET', url, headers: { 'payment-signature': paymentHeader() } });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(PAID_CONTENT);
      expect(response.headers['payment-response']).toBeDefined();
    });
  });
});
