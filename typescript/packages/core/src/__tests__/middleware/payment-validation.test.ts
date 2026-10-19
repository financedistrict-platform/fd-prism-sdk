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

let nonceSequence = 0;

const buildAuthorization = (overrides: Record<string, string> = {}) => ({
  from: '0x1111111111111111111111111111111111111111',
  to: PAY_TO,
  value: '10000',
  validAfter: String(NOW_SECONDS - 60),
  validBefore: String(NOW_SECONDS + 60),
  nonce: `0x${(++nonceSequence).toString(16)}`,
  ...overrides,
});

const buildV2Payload = (
  options: {
    accepted?: Record<string, unknown>;
    authorization?: Record<string, string>;
    resource?: { url: string };
  } = {}
) => ({
  x402Version: 2,
  ...(options.resource ? { resource: options.resource } : {}),
  accepted: { ...v2Requirement, ...options.accepted },
  payload: {
    signature: '0xsignature',
    authorization: buildAuthorization(options.authorization),
  },
});

const encode = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), 'utf-8').toString('base64');

describe('PrismMiddlewareCore local payment validation', () => {
  const mockClient = {
    getPaymentRequirements: jest.fn(),
    verifyPayment: jest.fn(),
    settlePayment: jest.fn(),
  };

  const createCore = () => new PrismMiddlewareCore({ apiKey: 'test-key', client: mockClient as any }, routes);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW_SECONDS * 1000);
    mockClient.getPaymentRequirements.mockResolvedValue(v2RequirementsResponse);
    mockClient.verifyPayment.mockResolvedValue({ isValid: true, payer: '0xpayer' });
    mockClient.settlePayment.mockResolvedValue({
      success: true,
      transaction: '0xtx',
      network: 'eip155:84532',
      payer: '0xpayer',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  async function submit(payload: unknown, core = createCore()) {
    return core.handleRequest({
      path: ROUTE_PATH,
      paymentHeader: encode(payload),
      resourceUrl: RESOURCE_URL,
    });
  }

  async function expectRejectedLocally(payload: unknown, core = createCore()) {
    const result = await submit(payload, core);
    expect(result.handled).toBe(true);
    expect(result.statusCode).toBe(402);
    expect(result.paymentInfo).toBeUndefined();
    expect(mockClient.verifyPayment).not.toHaveBeenCalled();
    expect(mockClient.settlePayment).not.toHaveBeenCalled();
  }

  describe('v2 payload that satisfies the route requirement', () => {
    it('is forwarded to verify with the server-built requirement', async () => {
      const result = await submit(buildV2Payload());

      expect(result.handled).toBe(false);
      expect(result.paymentInfo?.payer).toBe('0xpayer');
      expect(mockClient.verifyPayment).toHaveBeenCalledTimes(1);
      expect(mockClient.verifyPayment.mock.calls[0][1]).toEqual(v2Requirement);
    });

    it('accepts addresses that differ only by letter case', async () => {
      const result = await submit(
        buildV2Payload({
          accepted: { payTo: PAY_TO.toLowerCase(), asset: ASSET.toLowerCase() },
          authorization: { to: PAY_TO.toUpperCase().replace('0X', '0x') },
        })
      );

      expect(result.handled).toBe(false);
      expect(mockClient.verifyPayment).toHaveBeenCalledTimes(1);
    });

    it('selects the requirement the payload accepted when several are offered', async () => {
      const second = { ...v2Requirement, amount: '20000', payTo: '0xSecondPayee' };
      mockClient.getPaymentRequirements.mockResolvedValue({
        ...v2RequirementsResponse,
        accepts: [v2Requirement, second],
      });

      const result = await submit(
        buildV2Payload({
          accepted: { amount: '20000', payTo: '0xSecondPayee' },
          authorization: { to: '0xSecondPayee', value: '20000' },
        })
      );

      expect(result.handled).toBe(false);
      expect(mockClient.verifyPayment.mock.calls[0][1]).toEqual(second);
    });
  });

  describe('v2 payload that does not satisfy the route requirement', () => {
    it('rejects an authorization paying a different recipient', async () => {
      await expectRejectedLocally(
        buildV2Payload({ authorization: { to: '0x2222222222222222222222222222222222222222' } })
      );
    });

    it('rejects an authorization with a lower value', async () => {
      await expectRejectedLocally(buildV2Payload({ authorization: { value: '1' } }));
    });

    it('rejects an authorization with a higher value', async () => {
      await expectRejectedLocally(buildV2Payload({ authorization: { value: '10001' } }));
    });

    it('rejects a non-numeric authorization value', async () => {
      await expectRejectedLocally(buildV2Payload({ authorization: { value: '1e4' } }));
    });

    it('rejects an accepted block naming a different recipient', async () => {
      await expectRejectedLocally(
        buildV2Payload({ accepted: { payTo: '0x2222222222222222222222222222222222222222' } })
      );
    });

    it('rejects an accepted block naming a different amount', async () => {
      await expectRejectedLocally(
        buildV2Payload({ accepted: { amount: '1' }, authorization: { value: '1' } })
      );
    });

    it('rejects an accepted block naming a different asset', async () => {
      await expectRejectedLocally(
        buildV2Payload({ accepted: { asset: '0x3333333333333333333333333333333333333333' } })
      );
    });

    it('rejects an accepted block naming a different network', async () => {
      await expectRejectedLocally(buildV2Payload({ accepted: { network: 'eip155:1' } }));
    });

    it('rejects an accepted block that omits the amount', async () => {
      const payload = buildV2Payload();
      delete (payload.accepted as any).amount;
      await expectRejectedLocally(payload);
    });

    it('rejects an accepted block that omits the recipient', async () => {
      const payload = buildV2Payload();
      delete (payload.accepted as any).payTo;
      await expectRejectedLocally(payload);
    });

    it('rejects an authorization that has already expired', async () => {
      await expectRejectedLocally(
        buildV2Payload({ authorization: { validBefore: String(NOW_SECONDS - 1) } })
      );
    });

    it('rejects an authorization that expires at the current second', async () => {
      await expectRejectedLocally(
        buildV2Payload({ authorization: { validBefore: String(NOW_SECONDS) } })
      );
    });

    it('rejects an authorization that is not yet valid', async () => {
      await expectRejectedLocally(
        buildV2Payload({ authorization: { validAfter: String(NOW_SECONDS + 1) } })
      );
    });

    it('rejects a non-numeric validity window', async () => {
      await expectRejectedLocally(buildV2Payload({ authorization: { validBefore: 'soon' } }));
    });

    it('rejects a payload bound to a different resource', async () => {
      await expectRejectedLocally(
        buildV2Payload({ resource: { url: 'https://example.com/api/other' } })
      );
    });
  });

  describe('settlementCallback', () => {
    it('settles a payment that matches its requirement', async () => {
      const result = await createCore().settlementCallback(
        buildV2Payload() as any,
        v2Requirement,
        200
      );

      expect(result?.success).toBe(true);
      expect(mockClient.settlePayment).toHaveBeenCalledTimes(1);
    });

    it('does not call the gateway when the authorization pays a different recipient', async () => {
      const result = await createCore().settlementCallback(
        buildV2Payload({
          authorization: { to: '0x2222222222222222222222222222222222222222' },
        }) as any,
        v2Requirement,
        200
      );

      expect(result?.success).toBe(false);
      expect(mockClient.settlePayment).not.toHaveBeenCalled();
    });

    it('does not call the gateway when the authorization value differs', async () => {
      const result = await createCore().settlementCallback(
        buildV2Payload({ authorization: { value: '1' } }) as any,
        v2Requirement,
        200
      );

      expect(result?.success).toBe(false);
      expect(mockClient.settlePayment).not.toHaveBeenCalled();
    });

    it('does not call the gateway when the accepted block differs from the requirement', async () => {
      const result = await createCore().settlementCallback(
        buildV2Payload({ accepted: { amount: '1' } }) as any,
        v2Requirement,
        200
      );

      expect(result?.success).toBe(false);
      expect(mockClient.settlePayment).not.toHaveBeenCalled();
    });
  });
});
