import { PrismMiddlewareCore } from '../../middleware/middleware-core';
import { RoutesConfig } from '../../types';

describe('PrismMiddlewareCore.decodePaymentHeader (via handleRequest)', () => {
  const ROUTE_PATH = '/api/premium';
  const routes: RoutesConfig = {
    [ROUTE_PATH]: { price: 0.01, description: 'Premium API' },
  };

  // Mock client — should never be called when the payment header is structurally invalid,
  // since decodePaymentHeader must reject it before any gateway call is made.
  const mockClient = {
    getPaymentRequirements: jest.fn(),
    verifyPayment: jest.fn(),
    settlePayment: jest.fn(),
  };

  const createCore = () =>
    new PrismMiddlewareCore(
      { apiKey: 'test-key', client: mockClient as any },
      routes
    );

  const encode = (value: unknown): string =>
    Buffer.from(JSON.stringify(value), 'utf-8').toString('base64');

  const validV2Payload = {
    x402Version: 2,
    accepted: {
      scheme: 'eip3009',
      network: 'eip155:1',
      asset: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      amount: '10000',
      payTo: '0x1234567890abcdef',
      maxTimeoutSeconds: 60,
    },
    payload: {
      signature: '0xsignature',
      authorization: {
        from: '0xfrom',
        to: '0xto',
        value: '10000',
        validAfter: '1740672089',
        validBefore: '1740672154',
        nonce: '0xnonce',
      },
    },
  };

  const validV1Payload = {
    x402Version: 1,
    scheme: 'exact',
    network: 'base-sepolia',
    payload: {
      signature: '0xsignature',
      authorization: {
        from: '0xfrom',
        to: '0xto',
        value: '10000',
        validAfter: '1740672089',
        validBefore: '1740672154',
        nonce: '0xnonce',
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  async function expectInvalidHeader(payloadHeaderValue: string) {
    const core = createCore();
    const result = await core.handleRequest({
      path: ROUTE_PATH,
      paymentHeader: payloadHeaderValue,
      resourceUrl: 'https://example.com' + ROUTE_PATH,
    });

    expect(result.handled).toBe(true);
    expect(result.statusCode).toBe(400);
    expect(mockClient.getPaymentRequirements).not.toHaveBeenCalled();
    expect(mockClient.verifyPayment).not.toHaveBeenCalled();
  }

  it('rejects a non-object JSON payload (number)', async () => {
    await expectInvalidHeader(encode(12345));
  });

  it('rejects a non-object JSON payload (array)', async () => {
    await expectInvalidHeader(encode(['not', 'an', 'object']));
  });

  it('rejects a non-object JSON payload (string)', async () => {
    await expectInvalidHeader(encode('just a string'));
  });

  it('rejects a v2 payload missing accepted.scheme', async () => {
    const bad = JSON.parse(JSON.stringify(validV2Payload));
    delete bad.accepted.scheme;
    await expectInvalidHeader(encode(bad));
  });

  it('rejects a v2 payload missing accepted.network', async () => {
    const bad = JSON.parse(JSON.stringify(validV2Payload));
    delete bad.accepted.network;
    await expectInvalidHeader(encode(bad));
  });

  it('rejects a v2 payload missing accepted.asset', async () => {
    const bad = JSON.parse(JSON.stringify(validV2Payload));
    delete bad.accepted.asset;
    await expectInvalidHeader(encode(bad));
  });

  it('rejects a v2 payload missing payload.signature', async () => {
    const bad = JSON.parse(JSON.stringify(validV2Payload));
    delete bad.payload.signature;
    await expectInvalidHeader(encode(bad));
  });

  it('rejects a v2 payload missing payload.authorization', async () => {
    const bad = JSON.parse(JSON.stringify(validV2Payload));
    delete bad.payload.authorization;
    await expectInvalidHeader(encode(bad));
  });

  it.each(['from', 'to', 'value', 'validAfter', 'validBefore', 'nonce'])(
    'rejects a v2 payload missing authorization.%s',
    async (field) => {
      const bad = JSON.parse(JSON.stringify(validV2Payload));
      delete bad.payload.authorization[field];
      await expectInvalidHeader(encode(bad));
    }
  );

  it('rejects a v1 payload missing scheme', async () => {
    const bad = JSON.parse(JSON.stringify(validV1Payload));
    delete bad.scheme;
    await expectInvalidHeader(encode(bad));
  });

  it('rejects a v1 payload missing network', async () => {
    const bad = JSON.parse(JSON.stringify(validV1Payload));
    delete bad.network;
    await expectInvalidHeader(encode(bad));
  });

  it('rejects a v1 payload missing payload.signature', async () => {
    const bad = JSON.parse(JSON.stringify(validV1Payload));
    delete bad.payload.signature;
    await expectInvalidHeader(encode(bad));
  });

  it('rejects a v1 payload missing payload.authorization', async () => {
    const bad = JSON.parse(JSON.stringify(validV1Payload));
    delete bad.payload.authorization;
    await expectInvalidHeader(encode(bad));
  });

  it('rejects malformed base64/JSON', async () => {
    await expectInvalidHeader('not-valid-base64-json!!!');
  });
});
