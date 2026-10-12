import * as nextjs from '../index';
import { withPrismPayment } from '../index';

const proof = Buffer.from(
  JSON.stringify({
    x402Version: 2,
    accepted: { scheme: 'exact', network: 'eip155:84532', asset: '0xasset' },
    payload: {
      signature: '0xsig',
      authorization: {
        from: '0xpayer',
        to: '0xmerchant',
        value: '10000',
        validAfter: '0',
        validBefore: '9999999999',
        nonce: '0xnonce',
      },
    },
  })
).toString('base64');

const createClient = () => ({
  getPaymentRequirements: jest.fn().mockResolvedValue({
    accepts: [{ scheme: 'exact', network: 'eip155:84532', asset: '0xasset' }],
  }),
  verifyPayment: jest.fn().mockResolvedValue({ isValid: true, payer: '0xpayer' }),
  settlePayment: jest.fn().mockResolvedValue({
    success: true,
    transaction: '0xtx',
    network: 'eip155:84532',
    payer: '0xpayer',
  }),
  getAuthInfo: jest.fn(),
});

const paidRequest = (path: string) =>
  new Request(`http://localhost${path}`, { headers: { 'PAYMENT-SIGNATURE': proof } });

describe('package surface', () => {
  it('exposes no verify-only middleware', () => {
    expect(Object.keys(nextjs).sort()).toEqual(['getPayer', 'getPaymentInfo', 'withPrismPayment']);
  });
});

describe('withPrismPayment', () => {
  it('returns 402 without a proof and never runs the handler', async () => {
    const client = createClient();
    const handler = jest.fn().mockResolvedValue(Response.json({ secret: true }));
    const route = withPrismPayment(handler, { price: 0.01, description: 'a' }, {
      apiKey: 'k',
      client: client as any,
    });

    const response = await route(new Request('http://localhost/api/a'));

    expect(response.status).toBe(402);
    expect(handler).not.toHaveBeenCalled();
    expect(client.settlePayment).not.toHaveBeenCalled();
  });

  it('settles once per request after the handler succeeds', async () => {
    const client = createClient();
    const handler = jest.fn().mockResolvedValue(Response.json({ ok: true }));
    const route = withPrismPayment(handler, { price: 0.01, description: 'a' }, {
      apiKey: 'k',
      client: client as any,
    });

    const response = await route(paidRequest('/api/a'));

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(client.settlePayment).toHaveBeenCalledTimes(1);
    expect(response.headers.get('PAYMENT-RESPONSE')).not.toBeNull();
  });

  it('settles on every protected route the proof is presented to', async () => {
    const client = createClient();
    const config = { apiKey: 'k', client: client as any };
    const routeA = withPrismPayment(
      jest.fn().mockResolvedValue(Response.json({ route: 'a' })),
      { price: 0.01, description: 'a' },
      config
    );
    const routeB = withPrismPayment(
      jest.fn().mockResolvedValue(Response.json({ route: 'b' })),
      { price: 0.01, description: 'b' },
      config
    );

    await routeA(paidRequest('/api/a'));
    await routeB(paidRequest('/api/b'));

    expect(client.verifyPayment).toHaveBeenCalledTimes(2);
    expect(client.settlePayment).toHaveBeenCalledTimes(2);
  });

  it('withholds the handler response when settlement fails', async () => {
    const client = createClient();
    client.settlePayment.mockResolvedValue({ success: false, errorReason: 'nonce_used' });
    const route = withPrismPayment(
      jest.fn().mockResolvedValue(Response.json({ secret: true })),
      { price: 0.01, description: 'a' },
      { apiKey: 'k', client: client as any }
    );

    const response = await route(paidRequest('/api/a'));

    expect(response.status).toBe(402);
    expect(await response.text()).not.toContain('secret');
  });
});
