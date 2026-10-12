import * as nextjs from '../index';
import { withPrismPayment, getPayer, getPaymentInfo } from '../index';

const requirement = {
  scheme: 'exact',
  network: 'eip155:84532',
  asset: '0xasset',
  payTo: '0xmerchant',
  amount: '10000',
};

const proofFor = (nonce: string) =>
  Buffer.from(
    JSON.stringify({
      x402Version: 2,
      accepted: requirement,
      payload: {
        signature: '0xsig',
        authorization: {
          from: '0xpayer',
          to: '0xmerchant',
          value: '10000',
          validAfter: '0',
          validBefore: '9999999999',
          nonce,
        },
      },
    })
  ).toString('base64');

const proof = proofFor('0xnonce');

const createClient = () => ({
  getPaymentRequirements: jest.fn().mockResolvedValue({
    accepts: [requirement],
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

const paidRequest = (path: string, extraHeaders: Record<string, string> = {}, paymentProof: string = proof) =>
  new Request(`http://localhost${path}`, {
    headers: { 'PAYMENT-SIGNATURE': paymentProof, ...extraHeaders },
  });

const forgedHeaders = {
  'x-prism-payer': '0xattacker',
  'X-Prism-Amount': '999999',
  'x-prism-transaction-id': '0xforged',
  'x-prism-anything': 'else',
};

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

  it('settles on every protected route a proof is presented to', async () => {
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

    await routeA(paidRequest('/api/a', {}, proofFor('0xnonce-a')));
    await routeB(paidRequest('/api/b', {}, proofFor('0xnonce-b')));

    expect(client.verifyPayment).toHaveBeenCalledTimes(2);
    expect(client.settlePayment).toHaveBeenCalledTimes(2);
  });

  it('rejects a proof that was already settled on another protected route', async () => {
    const client = createClient();
    const config = { apiKey: 'k', client: client as any };
    const handlerB = jest.fn().mockResolvedValue(Response.json({ route: 'b' }));
    const routeA = withPrismPayment(
      jest.fn().mockResolvedValue(Response.json({ route: 'a' })),
      { price: 0.01, description: 'a' },
      config
    );
    const routeB = withPrismPayment(handlerB, { price: 0.01, description: 'b' }, config);

    const first = await routeA(paidRequest('/api/a'));
    const second = await routeB(paidRequest('/api/b'));

    expect(first.status).toBe(200);
    expect(second.status).toBe(402);
    expect(handlerB).not.toHaveBeenCalled();
    expect(client.settlePayment).toHaveBeenCalledTimes(1);
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

describe('forged payment headers', () => {
  const routeConfig = { price: 0.01, description: 'a' };

  it('removes client-supplied x-prism headers before the handler runs', async () => {
    const client = createClient();
    let seen: string[] = [];
    const route = withPrismPayment(
      async (request) => {
        seen = [];
        request.headers.forEach((_, name) => seen.push(name));
        return Response.json({ ok: true });
      },
      routeConfig,
      { apiKey: 'k', client: client as any }
    );

    await route(paidRequest('/api/a', forgedHeaders));

    expect(seen.filter((name) => name.startsWith('x-prism-'))).toEqual([]);
  });

  it('removes the payment proof headers before the handler runs', async () => {
    const client = createClient();
    let seen: string[] = [];
    const route = withPrismPayment(
      async (request) => {
        seen = [];
        request.headers.forEach((_, name) => seen.push(name));
        return Response.json({ ok: true });
      },
      routeConfig,
      { apiKey: 'k', client: client as any }
    );

    await route(paidRequest('/api/a', { 'X-PAYMENT': proof }));

    expect(seen).not.toContain('payment-signature');
    expect(seen).not.toContain('x-payment');
    expect(client.verifyPayment).toHaveBeenCalledTimes(1);
  });

  it('reports the verified payer and amount, not forged header values', async () => {
    const client = createClient();
    let payer: string | null = null;
    let info: ReturnType<typeof getPaymentInfo> | null = null;
    const route = withPrismPayment(
      async (request) => {
        payer = getPayer(request);
        info = getPaymentInfo(request);
        return Response.json({ ok: true });
      },
      routeConfig,
      { apiKey: 'k', client: client as any }
    );

    await route(paidRequest('/api/a', forgedHeaders));

    expect(payer).toBe('0xpayer');
    expect(info).toEqual({ payer: '0xpayer', amount: '10000' });
  });

  it('never trusts payment headers on a request that did not pass verification', () => {
    const forged = new Request('http://localhost/api/a', { headers: forgedHeaders });

    expect(getPayer(forged)).toBeNull();
    expect(getPaymentInfo(forged)).toEqual({ payer: null, amount: null });
  });

  it('does not carry verified payment info over to a different request', async () => {
    const client = createClient();
    let other: Request | null = null;
    const route = withPrismPayment(
      async (request) => {
        other = request.clone();
        return Response.json({ ok: true });
      },
      routeConfig,
      { apiKey: 'k', client: client as any }
    );

    await route(paidRequest('/api/a', forgedHeaders));

    expect(getPayer(other!)).toBeNull();
  });
});
