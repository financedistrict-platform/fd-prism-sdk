import { PrismMiddlewareCore } from '../../middleware/middleware-core';
import { PaymentReplayGuard } from '../../utils';
import { RoutesConfig } from '../../types';
import { PrismGatewayError } from '../../types/errors';

const ROUTE_PATH = '/api/premium';
const RESOURCE_URL = 'https://example.com' + ROUTE_PATH;
const PAY_TO = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
const ASSET = '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85';
const NOW_SECONDS = 1_800_000_000;

const routes: RoutesConfig = {
  [ROUTE_PATH]: { price: 0.01, description: 'Premium API' },
};

const requirement = {
  scheme: 'exact',
  network: 'eip155:84532',
  amount: '10000',
  asset: ASSET,
  payTo: PAY_TO,
  maxTimeoutSeconds: 60,
};

const requirementsResponse = {
  x402Version: 2,
  resource: { url: RESOURCE_URL },
  accepts: [requirement],
};

const buildPayload = (
  nonce: string,
  options: { signature?: string; validBefore?: number } = {}
) => ({
  x402Version: 2,
  accepted: requirement,
  payload: {
    signature: options.signature ?? '0xsignature',
    authorization: {
      from: '0x1111111111111111111111111111111111111111',
      to: PAY_TO,
      value: '10000',
      validAfter: String(NOW_SECONDS - 60),
      validBefore: String(options.validBefore ?? NOW_SECONDS + 60),
      nonce,
    },
  },
});

const encode = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), 'utf-8').toString('base64');

describe('PrismMiddlewareCore parallel proof replay', () => {
  const mockClient = {
    getPaymentRequirements: jest.fn(),
    verifyPayment: jest.fn(),
    settlePayment: jest.fn(),
  };

  const createCore = (options: { replayReservationSeconds?: number } = {}) =>
    new PrismMiddlewareCore(
      { apiKey: 'test-key', client: mockClient as any, ...options },
      routes
    );

  const submit = (core: PrismMiddlewareCore, payload: unknown) =>
    core.handleRequest({
      path: ROUTE_PATH,
      paymentHeader: encode(payload),
      resourceUrl: RESOURCE_URL,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(NOW_SECONDS * 1000);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockClient.getPaymentRequirements.mockResolvedValue(requirementsResponse);
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

  it('lets exactly one of many parallel requests with the same proof through', async () => {
    const core = createCore();
    const payload = buildPayload('0xparallel');

    const results = await Promise.all(Array.from({ length: 20 }, () => submit(core, payload)));

    const admitted = results.filter((r) => !r.handled && r.paymentInfo);
    const rejected = results.filter((r) => r.handled);
    expect(admitted).toHaveLength(1);
    expect(rejected).toHaveLength(19);
    expect(rejected.every((r) => r.statusCode === 402)).toBe(true);
    expect(mockClient.verifyPayment).toHaveBeenCalledTimes(1);
  });

  it('rejects a second request with the same proof while the first is still in flight', async () => {
    const core = createCore();
    const payload = buildPayload('0xsequential');

    const first = await submit(core, payload);
    const second = await submit(core, payload);

    expect(first.paymentInfo).toBeDefined();
    expect(second.handled).toBe(true);
    expect(second.statusCode).toBe(402);
  });

  it('treats a different signature over the same authorization as the same proof', async () => {
    const core = createCore();

    const first = await submit(core, buildPayload('0xmalleable', { signature: '0xsignature-a' }));
    const second = await submit(core, buildPayload('0xmalleable', { signature: '0xsignature-b' }));

    expect(first.paymentInfo).toBeDefined();
    expect(second.handled).toBe(true);
  });

  it('does not block different nonces', async () => {
    const core = createCore();

    const results = await Promise.all([
      submit(core, buildPayload('0xone')),
      submit(core, buildPayload('0xtwo')),
    ]);

    expect(results.every((r) => r.paymentInfo)).toBe(true);
  });

  it('shares the guard between cores built from the same config object', async () => {
    const config = { apiKey: 'test-key', client: mockClient as any };
    const payload = buildPayload('0xshared');

    const first = await submit(new PrismMiddlewareCore(config, routes), payload);
    const second = await submit(new PrismMiddlewareCore(config, routes), payload);

    expect(first.paymentInfo).toBeDefined();
    expect(second.handled).toBe(true);
  });

  it('admits a proof again for the same request scope but not for another request', async () => {
    const core = createCore();
    const scope = {};
    const header = encode(buildPayload('0xscoped'));
    const handle = (requestScope: object) =>
      core.handleRequest({ path: ROUTE_PATH, paymentHeader: header, resourceUrl: RESOURCE_URL, requestScope });

    const first = await handle(scope);
    const again = await handle(scope);
    const other = await handle({});

    expect(first.paymentInfo).toBeDefined();
    expect(again.paymentInfo).toBeDefined();
    expect(other.handled).toBe(true);
    expect(other.statusCode).toBe(402);
  });

  it('does not let a request scope reuse a proof that was already settled', async () => {
    const core = createCore();
    const scope = {};
    const payload = buildPayload('0xscoped-settled');
    const handle = () =>
      core.handleRequest({ path: ROUTE_PATH, paymentHeader: encode(payload), resourceUrl: RESOURCE_URL, requestScope: scope });

    const first = await handle();
    await core.settlementCallback(first.paymentInfo!.payment, first.paymentInfo!.paymentRequirements, 200);
    const again = await handle();

    expect(again.handled).toBe(true);
    expect(again.statusCode).toBe(402);
  });

  it('releases the proof when gateway verification rejects it', async () => {
    const core = createCore();
    const payload = buildPayload('0xinvalid');
    mockClient.verifyPayment.mockResolvedValueOnce({ isValid: false, error: 'bad signature' });

    const rejected = await submit(core, payload);
    const retried = await submit(core, payload);

    expect(rejected.handled).toBe(true);
    expect(retried.paymentInfo).toBeDefined();
  });

  it('releases the proof when verification throws', async () => {
    const core = createCore();
    const payload = buildPayload('0xthrows');
    mockClient.verifyPayment.mockRejectedValueOnce(new Error('gateway down'));

    const failed = await submit(core, payload);
    const retried = await submit(core, payload);

    expect(failed.handled).toBe(true);
    expect(retried.paymentInfo).toBeDefined();
  });

  it('releases the proof when the handler responds with an error status', async () => {
    const core = createCore();
    const payload = buildPayload('0xhandler-error');

    const first = await submit(core, payload);
    await core.settlementCallback(first.paymentInfo!.payment, first.paymentInfo!.paymentRequirements, 500);
    const retried = await submit(core, payload);

    expect(mockClient.settlePayment).not.toHaveBeenCalled();
    expect(retried.paymentInfo).toBeDefined();
  });

  it('releases the proof when settlement fails', async () => {
    const core = createCore();
    const payload = buildPayload('0xsettle-fails');
    mockClient.settlePayment.mockResolvedValueOnce({ success: false, errorReason: 'insufficient funds' });

    const first = await submit(core, payload);
    await core.settlementCallback(first.paymentInfo!.payment, first.paymentInfo!.paymentRequirements, 200);
    const retried = await submit(core, payload);

    expect(retried.paymentInfo).toBeDefined();
  });

  it('keeps the proof reserved when settlement throws without a gateway answer', async () => {
    const core = createCore();
    const payload = buildPayload('0xsettle-throws');
    mockClient.settlePayment.mockRejectedValueOnce(new Error('request timed out'));

    const first = await submit(core, payload);
    const settled = await core.settlementCallback(
      first.paymentInfo!.payment,
      first.paymentInfo!.paymentRequirements,
      200
    );
    const retried = await submit(core, payload);

    expect(settled).toBeNull();
    expect(retried.handled).toBe(true);
    expect(retried.statusCode).toBe(402);
    expect(retried.paymentInfo).toBeUndefined();
    expect(mockClient.verifyPayment).toHaveBeenCalledTimes(1);
  });

  it('keeps the proof reserved when the gateway fails with a server error during settlement', async () => {
    const core = createCore();
    const payload = buildPayload('0xsettle-server-error');
    mockClient.settlePayment.mockRejectedValueOnce(new PrismGatewayError('Bad gateway', 502));

    const first = await submit(core, payload);
    await core.settlementCallback(first.paymentInfo!.payment, first.paymentInfo!.paymentRequirements, 200);
    const retried = await submit(core, payload);

    expect(retried.statusCode).toBe(402);
    expect(retried.paymentInfo).toBeUndefined();
  });

  it('releases the proof when the gateway refuses settlement with a client error', async () => {
    const core = createCore();
    const payload = buildPayload('0xsettle-refused');
    mockClient.settlePayment.mockRejectedValueOnce(new PrismGatewayError('Settlement refused', 400));

    const first = await submit(core, payload);
    await core.settlementCallback(first.paymentInfo!.payment, first.paymentInfo!.paymentRequirements, 200);
    const retried = await submit(core, payload);

    expect(retried.paymentInfo).toBeDefined();
  });

  it('keeps the proof consumed after a successful settlement', async () => {
    const core = createCore();
    const payload = buildPayload('0xsettled');

    const first = await submit(core, payload);
    const settled = await core.settlementCallback(
      first.paymentInfo!.payment,
      first.paymentInfo!.paymentRequirements,
      200
    );
    const replay = await submit(core, payload);

    expect(settled?.success).toBe(true);
    expect(replay.handled).toBe(true);
    expect(replay.statusCode).toBe(402);
  });

  it('keeps an in-flight reservation while a slow handler is still running', async () => {
    const core = createCore();
    const payload = buildPayload('0xslow-handler', { validBefore: NOW_SECONDS + 3600 });

    await submit(core, payload);
    (Date.now as jest.Mock).mockReturnValue(NOW_SECONDS * 1000 + 90_000);
    const whileHandlerRuns = await submit(core, payload);

    expect(whileHandlerRuns.handled).toBe(true);
    expect(whileHandlerRuns.statusCode).toBe(402);
    expect(whileHandlerRuns.paymentInfo).toBeUndefined();
    expect(mockClient.verifyPayment).toHaveBeenCalledTimes(1);
  });

  it('expires an abandoned in-flight reservation after the configured reservation time', async () => {
    const core = createCore({ replayReservationSeconds: 120 });
    const payload = buildPayload('0xabandoned', { validBefore: NOW_SECONDS + 3600 });

    await submit(core, payload);
    (Date.now as jest.Mock).mockReturnValue(NOW_SECONDS * 1000 + 119_000);
    const beforeExpiry = await submit(core, payload);
    (Date.now as jest.Mock).mockReturnValue(NOW_SECONDS * 1000 + 121_000);
    const afterExpiry = await submit(core, payload);

    expect(beforeExpiry.handled).toBe(true);
    expect(afterExpiry.paymentInfo).toBeDefined();
  });

  it('expires an abandoned in-flight reservation after ten minutes by default', async () => {
    const core = createCore();
    const payload = buildPayload('0xabandoned-default', { validBefore: NOW_SECONDS + 3600 });

    await submit(core, payload);
    (Date.now as jest.Mock).mockReturnValue(NOW_SECONDS * 1000 + 599_000);
    const beforeExpiry = await submit(core, payload);
    (Date.now as jest.Mock).mockReturnValue(NOW_SECONDS * 1000 + 601_000);
    const afterExpiry = await submit(core, payload);

    expect(beforeExpiry.handled).toBe(true);
    expect(afterExpiry.paymentInfo).toBeDefined();
  });

  it('never holds a reservation past the authorization validBefore', () => {
    const guard = new PaymentReplayGuard();

    expect(guard.tryReserve('key', NOW_SECONDS + 30)).toBe(true);
    (Date.now as jest.Mock).mockReturnValue(NOW_SECONDS * 1000 + 29_000);
    expect(guard.tryReserve('key', NOW_SECONDS + 30)).toBe(false);
    (Date.now as jest.Mock).mockReturnValue(NOW_SECONDS * 1000 + 31_000);
    expect(guard.tryReserve('key', NOW_SECONDS + 30)).toBe(true);
  });

  it('stays bounded and fails closed when every slot is an active reservation', async () => {
    const core = createCore();
    const results = await Promise.all(
      Array.from({ length: 10_050 }, (_, i) => submit(core, buildPayload(`0xflood-${i}`)))
    );

    const admitted = results.filter((r) => r.paymentInfo).length;
    expect(admitted).toBe(10_000);
    expect(results.filter((r) => r.handled)).toHaveLength(50);
  });

  describe('routes that settle before the handler', () => {
    const settlingRoutes: RoutesConfig = {
      [ROUTE_PATH]: { price: 0.01, description: 'Premium API', settleBeforeHandler: true },
    };

    const createSettlingCore = () =>
      new PrismMiddlewareCore({ apiKey: 'test-key', client: mockClient as any }, settlingRoutes);

    it('does not settle during request handling by default', async () => {
      const result = await submit(createCore(), buildPayload('0xdefault'));

      expect(result.paymentInfo).toBeDefined();
      expect(mockClient.settlePayment).not.toHaveBeenCalled();
    });

    it('settles before returning control to the handler', async () => {
      const core = createSettlingCore();

      const result = await submit(core, buildPayload('0xsettle-first'));

      expect(result.handled).toBe(false);
      expect(result.paymentInfo).toBeDefined();
      expect(mockClient.settlePayment).toHaveBeenCalledTimes(1);
    });

    it('reuses the settlement instead of settling again after the handler', async () => {
      const core = createSettlingCore();
      const admitted = await submit(core, buildPayload('0xsettle-once'));

      const settled = await core.settlementCallback(
        admitted.paymentInfo!.payment,
        admitted.paymentInfo!.paymentRequirements,
        200
      );

      expect(settled?.transaction).toBe('0xtx');
      expect(mockClient.settlePayment).toHaveBeenCalledTimes(1);
    });

    it('admits and settles exactly once under parallel requests', async () => {
      const core = createSettlingCore();
      const payload = buildPayload('0xsettle-parallel');

      const results = await Promise.all(Array.from({ length: 20 }, () => submit(core, payload)));

      expect(results.filter((r) => r.paymentInfo)).toHaveLength(1);
      expect(mockClient.settlePayment).toHaveBeenCalledTimes(1);
    });

    it('rejects the request and releases the proof when settlement fails', async () => {
      const core = createSettlingCore();
      const payload = buildPayload('0xsettle-first-fails');
      mockClient.settlePayment.mockResolvedValueOnce({ success: false, errorReason: 'insufficient funds' });

      const failed = await submit(core, payload);
      const retried = await submit(core, payload);

      expect(failed.handled).toBe(true);
      expect(failed.statusCode).toBe(402);
      expect(failed.paymentInfo).toBeUndefined();
      expect(retried.paymentInfo).toBeDefined();
    });

    it('rejects the request and keeps the proof reserved when settlement throws', async () => {
      const core = createSettlingCore();
      const payload = buildPayload('0xsettle-first-throws');
      mockClient.settlePayment.mockRejectedValueOnce(new Error('request timed out'));

      const failed = await submit(core, payload);
      const retried = await submit(core, payload);

      expect(failed.handled).toBe(true);
      expect(failed.statusCode).toBe(402);
      expect(failed.paymentInfo).toBeUndefined();
      expect(retried.handled).toBe(true);
      expect(retried.statusCode).toBe(402);
      expect(retried.paymentInfo).toBeUndefined();
    });

    it('keeps the proof consumed when the handler fails after settlement', async () => {
      const core = createSettlingCore();
      const payload = buildPayload('0xsettled-handler-fails');

      const admitted = await submit(core, payload);
      await core.settlementCallback(admitted.paymentInfo!.payment, admitted.paymentInfo!.paymentRequirements, 500);
      const replay = await submit(core, payload);

      expect(replay.handled).toBe(true);
      expect(replay.statusCode).toBe(402);
    });
  });
});
