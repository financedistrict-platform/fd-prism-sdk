import Fastify, { FastifyInstance } from 'fastify';
import prismPlugin from '../../index';

const mockGetPaymentRequirements = jest.fn();
const mockVerifyPayment = jest.fn();
const mockSettlePayment = jest.fn();

const createMockClient = () => ({
  getPaymentRequirements: mockGetPaymentRequirements,
  verifyPayment: mockVerifyPayment,
  settlePayment: mockSettlePayment,
  getAuthInfo: jest.fn(),
});

const requirements = {
  x402Version: 2,
  accepts: [
    {
      scheme: 'exact',
      network: 'eip155:1',
      amount: '10000',
      asset: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      payTo: '0x1234567890abcdef',
      maxTimeoutSeconds: 60,
    },
  ],
};

async function buildApp(routes: Record<string, { price: string; description: string }>) {
  const app = Fastify();
  await app.register(prismPlugin, {
    apiKey: 'test-api-key',
    client: createMockClient() as any,
    routes,
  });
  app.get('/users/:id', async (request) => ({ id: (request.params as { id: string }).id }));
  app.get('/files/*', async () => ({ file: true }));
  app.get('/reports/:name', async () => ({ report: true }));
  app.get('/public', async () => ({ ok: true }));
  await app.ready();
  return app;
}

describe('fastify route matching', () => {
  let app: FastifyInstance | undefined;

  beforeEach(() => {
    mockGetPaymentRequirements.mockResolvedValue(requirements);
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it('protects a concrete route key served by a parametric route', async () => {
    app = await buildApp({ '/users/42': { price: '10000', description: 'User 42' } });

    const response = await app.inject({ method: 'GET', url: '/users/42' });

    expect(response.statusCode).toBe(402);
  });

  it('keeps unlisted ids on the same parametric route open', async () => {
    app = await buildApp({ '/users/42': { price: '10000', description: 'User 42' } });

    const response = await app.inject({ method: 'GET', url: '/users/7' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: '7' });
  });

  it('protects a concrete route key when a query string is present', async () => {
    app = await buildApp({ '/users/42': { price: '10000', description: 'User 42' } });

    const response = await app.inject({ method: 'GET', url: '/users/42?x=1' });

    expect(response.statusCode).toBe(402);
  });

  it('still protects a route keyed by its registered parametric pattern', async () => {
    app = await buildApp({ '/users/:id': { price: '10000', description: 'Any user' } });

    const response = await app.inject({ method: 'GET', url: '/users/42' });

    expect(response.statusCode).toBe(402);
  });

  it('protects wildcard routes', async () => {
    app = await buildApp({ '/files/*': { price: '10000', description: 'Files' } });

    const response = await app.inject({ method: 'GET', url: '/files/report.pdf' });

    expect(response.statusCode).toBe(402);
  });

  it('prices a request by its registered pattern over an overlapping wildcard', async () => {
    app = await buildApp({
      '/reports/*': { price: '1', description: 'Any report' },
      '/reports/:name': { price: '2', description: 'Named report' },
    });

    const response = await app.inject({ method: 'GET', url: '/reports/q3' });

    expect(response.statusCode).toBe(402);
    expect(mockGetPaymentRequirements).toHaveBeenCalledWith(
      expect.objectContaining({ requestedAmount: 2 })
    );
  });

  it('prices a request by a concrete key over its registered pattern', async () => {
    app = await buildApp({
      '/users/:id': { price: '2', description: 'Any user' },
      '/users/42': { price: '5', description: 'User 42' },
    });

    const response = await app.inject({ method: 'GET', url: '/users/42' });

    expect(response.statusCode).toBe(402);
    expect(mockGetPaymentRequirements).toHaveBeenCalledWith(
      expect.objectContaining({ requestedAmount: 5 })
    );
  });

  it('leaves unprotected routes open', async () => {
    app = await buildApp({ '/users/42': { price: '10000', description: 'User 42' } });

    const response = await app.inject({ method: 'GET', url: '/public' });

    expect(response.statusCode).toBe(200);
    expect(mockGetPaymentRequirements).not.toHaveBeenCalled();
  });
});
