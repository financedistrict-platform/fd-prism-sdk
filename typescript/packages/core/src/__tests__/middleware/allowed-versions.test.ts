import { PrismMiddlewareCore } from '../../middleware/middleware-core';
import { RoutesConfig } from '../../types';

const ROUTE_PATH = '/api/premium';
const RESOURCE_URL = 'https://example.com' + ROUTE_PATH;
const PAY_TO = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
const ASSET = '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85';
const NOW_SECONDS = 1_800_000_000;

const routes: RoutesConfig = {
  [ROUTE_PATH]: { price: 0.01, description: 'Premium API' },
};

const v2Requirement = {
  scheme: 'exact',
  network: 'eip155:84532',
  amount: '10000',
  asset: ASSET,
  payTo: PAY_TO,
  maxTimeoutSeconds: 60,
};

const v2RequirementsResponse = {
  x402Version: 2,
  resource: { url: RESOURCE_URL },
  accepts: [v2Requirement],
};

const v1Requirement = {
  scheme: 'exact',
  network: 'base-sepolia',
  maxAmountRequired: '10000',
  resource: RESOURCE_URL,
  description: 'Premium API',
  mimeType: 'application/json',
  payTo: PAY_TO,
  maxTimeoutSeconds: 60,
  asset: ASSET,
  extra: null,
};

let nonceSequence = 0;

const authorization = {
  from: '0x1111111111111111111111111111111111111111',
  to: PAY_TO,
  value: '10000',
  validAfter: String(NOW_SECONDS - 60),
  validBefore: String(NOW_SECONDS + 60),
  get nonce() {
    return `0x${(++nonceSequence).toString(16)}`;
  },
};

const v1Payload = {
  x402Version: 1,
  scheme: 'exact',
  network: 'base-sepolia',
  payload: { signature: '0xsignature', authorization },
};

const v2Payload = {
  x402Version: 2,
  accepted: v2Requirement,
  payload: { signature: '0xsignature', authorization },
};

const encode = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), 'utf-8').toString('base64');

describe('PrismMiddlewareCore allowedVersions enforcement', () => {
  const mockClient = {
    getPaymentRequirements: jest.fn(),
    verifyPayment: jest.fn(),
    settlePayment: jest.fn(),
  };

  const createCore = (allowedVersions?: (1 | 2)[]) =>
    new PrismMiddlewareCore(
      { apiKey: 'test-key', client: mockClient as any, allowedVersions },
      routes
    );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW_SECONDS * 1000);
    mockClient.getPaymentRequirements.mockResolvedValue(v2RequirementsResponse);
    mockClient.verifyPayment.mockResolvedValue({ isValid: true, payer: '0xpayer' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function expectNoGatewayCalls() {
    expect(mockClient.getPaymentRequirements).not.toHaveBeenCalled();
    expect(mockClient.verifyPayment).not.toHaveBeenCalled();
    expect(mockClient.settlePayment).not.toHaveBeenCalled();
  }

  it('rejects a v1 payload with 402 under the default allowed versions', async () => {
    const result = await createCore().handleRequest({
      path: ROUTE_PATH,
      paymentHeader: encode(v1Payload),
      resourceUrl: RESOURCE_URL,
    });

    expect(result.handled).toBe(true);
    expect(result.statusCode).toBe(402);
    expect(result.paymentInfo).toBeUndefined();
    expectNoGatewayCalls();
  });

  it('rejects a v1 payload when the adapter passes the version detected from that payload', async () => {
    const result = await createCore([2]).handleRequest({
      path: ROUTE_PATH,
      paymentHeader: encode(v1Payload),
      resourceUrl: RESOURCE_URL,
      protocolVersion: 1,
    });

    expect(result.handled).toBe(true);
    expect(result.statusCode).toBe(402);
    expectNoGatewayCalls();
  });

  it('rejects a v1 payload when the configured default protocol version is 1', async () => {
    const core = new PrismMiddlewareCore(
      { apiKey: 'test-key', client: mockClient as any, x402Version: 1, allowedVersions: [2] },
      routes
    );

    const result = await core.handleRequest({
      path: ROUTE_PATH,
      paymentHeader: encode(v1Payload),
      resourceUrl: RESOURCE_URL,
    });

    expect(result.statusCode).toBe(402);
    expectNoGatewayCalls();
  });

  it('rejects a v2 payload when only v1 is allowed', async () => {
    const result = await createCore([1]).handleRequest({
      path: ROUTE_PATH,
      paymentHeader: encode(v2Payload),
      resourceUrl: RESOURCE_URL,
      protocolVersion: 2,
    });

    expect(result.handled).toBe(true);
    expect(result.statusCode).toBe(402);
    expectNoGatewayCalls();
  });

  const { x402Version: _declared, ...flatPayloadWithoutVersion } = v1Payload;

  it.each([
    ['3', { ...v1Payload, x402Version: 3 }],
    ['"2"', { ...v1Payload, x402Version: '2' }],
    ['missing', flatPayloadWithoutVersion],
  ])('rejects a flat payload declaring x402Version %s under the default allowed versions', async (_label, payload) => {
    const result = await createCore().handleRequest({
      path: ROUTE_PATH,
      paymentHeader: encode(payload),
      resourceUrl: RESOURCE_URL,
      protocolVersion: 2,
    });

    expect(result.handled).toBe(true);
    expect(result.statusCode).toBe(402);
    expect(result.paymentInfo).toBeUndefined();
    expectNoGatewayCalls();
  });

  it('accepts a v1 payload when v1 is explicitly allowed', async () => {
    mockClient.getPaymentRequirements.mockResolvedValue({ x402Version: 1, accepts: [v1Requirement] });

    const result = await createCore([1, 2]).handleRequest({
      path: ROUTE_PATH,
      paymentHeader: encode(v1Payload),
      resourceUrl: RESOURCE_URL,
      protocolVersion: 1,
    });

    expect(result.handled).toBe(false);
    expect(mockClient.verifyPayment).toHaveBeenCalledTimes(1);
  });

  it('accepts a v2 payload under the default allowed versions', async () => {
    const result = await createCore().handleRequest({
      path: ROUTE_PATH,
      paymentHeader: encode(v2Payload),
      resourceUrl: RESOURCE_URL,
      protocolVersion: 2,
    });

    expect(result.handled).toBe(false);
    expect(mockClient.verifyPayment).toHaveBeenCalledTimes(1);
  });
});
