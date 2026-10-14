import fs from 'fs';
import http from 'http';
import path from 'path';
import { AddressInfo } from 'net';
import { format } from 'util';
import { PrismMiddlewareCore } from '../../middleware/middleware-core';
import { RoutesConfig } from '../../types';

const ROUTE_PATH = '/api/premium';
const RESOURCE_URL = 'https://example.com' + ROUTE_PATH;
const PAY_TO = '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01';
const ASSET = '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85';
const NOW_SECONDS = 1_800_000_000;
const API_KEY = 'pk_test_logging_api_key_value';
const SIGNATURE = '0xdeadbeefsignaturematerialthatmustnotbelogged';
const NONCE = '0xnoncematerialthatmustnotbelogged';
const PAYER = '0x1111111111111111111111111111111111111111';

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

const payload = {
  x402Version: 2,
  accepted: requirement,
  payload: {
    signature: SIGNATURE,
    authorization: {
      from: PAYER,
      to: PAY_TO,
      value: '10000',
      validAfter: String(NOW_SECONDS - 60),
      validBefore: String(NOW_SECONDS + 60),
      nonce: NONCE,
    },
  },
};

const encode = (value: unknown): string =>
  Buffer.from(JSON.stringify(value), 'utf-8').toString('base64');

type Answer = 'requirements' | 'verify' | 'drop';

describe('PrismMiddlewareCore error logging', () => {
  let server: http.Server;
  let baseUrl: string;
  let logged: string[];

  const answerWith = (decide: (url: string) => Answer) => {
    server.removeAllListeners('request');
    server.on('request', (req, res) => {
      req.resume();
      req.on('end', () => {
        const answer = decide(req.url ?? '');
        if (answer === 'drop') {
          req.socket.destroy();
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(answer === 'requirements' ? requirementsResponse : { isValid: true, payer: PAYER }));
      });
    });
  };

  beforeAll(async () => {
    server = http.createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    logged = [];
    jest.spyOn(Date, 'now').mockReturnValue(NOW_SECONDS * 1000);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(format(...args));
    });
  });

  const createCore = () => new PrismMiddlewareCore({ apiKey: API_KEY, baseUrl }, routes);

  const expectNothingSensitiveLogged = () => {
    const output = logged.join('\n');
    expect(logged.length).toBeGreaterThan(0);
    expect(output).not.toContain(SIGNATURE);
    expect(output).not.toContain(NONCE);
    expect(output).not.toContain(API_KEY);
    expect(output).not.toMatch(/paymentPayload/);
  };

  it('does not log the signed payload or the api key when settlement cannot reach the gateway', async () => {
    answerWith((url) => {
      if (url.endsWith('/payment/requirements')) return 'requirements';
      if (url.endsWith('/payment/verify')) return 'verify';
      return 'drop';
    });
    const core = createCore();

    const handled = await core.handleRequest({
      path: ROUTE_PATH,
      paymentHeader: encode(payload),
      resourceUrl: RESOURCE_URL,
    });
    expect(handled.paymentInfo).toBeDefined();

    const settled = await core.settlementCallback(
      handled.paymentInfo!.payment,
      handled.paymentInfo!.paymentRequirements,
      200
    );

    expect(settled).toBeNull();
    expectNothingSensitiveLogged();
    expect(logged.join('\n')).toContain('Error during settlement');
  });

  it('does not log the signed payload or the api key when verification cannot reach the gateway', async () => {
    answerWith((url) => (url.endsWith('/payment/requirements') ? 'requirements' : 'drop'));
    const core = createCore();

    const handled = await core.handleRequest({
      path: ROUTE_PATH,
      paymentHeader: encode(payload),
      resourceUrl: RESOURCE_URL,
    });

    expect(handled.handled).toBe(true);
    expectNothingSensitiveLogged();
    expect(logged.join('\n')).toContain('Error processing payment');
  });

  it('does not log the api key when the requirements request cannot reach the gateway', async () => {
    answerWith(() => 'drop');
    const core = createCore();

    const handled = await core.handleRequest({ path: ROUTE_PATH, resourceUrl: RESOURCE_URL });

    expect(handled.handled).toBe(true);
    expectNothingSensitiveLogged();
    expect(logged.join('\n')).toContain('Error generating payment requirements');
  });

  it('does not expose the signed payload through the error thrown by the client', async () => {
    answerWith(() => 'drop');
    const { PrismClient } = await import('../../client/prism-client');
    const client = new PrismClient({ apiKey: API_KEY, baseUrl });

    const error = await client.settlePayment(payload as any, requirement as any).catch((e) => e);

    const rendered = [JSON.stringify(error), format('%O', error)].join(' ');
    expect(error.code).toBe('NETWORK_ERROR');
    expect(rendered).not.toContain(SIGNATURE);
    expect(rendered).not.toContain(NONCE);
    expect(rendered).not.toContain(API_KEY);
  });
});

describe('core sources', () => {
  const sourceRoot = path.resolve(__dirname, '../..');

  const sourceFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return entry.name === '__tests__' ? [] : sourceFiles(full);
      }
      return entry.name.endsWith('.ts') ? [full] : [];
    });

  it('never logs a caught error object directly', () => {
    const rawErrorLog = /console\.(error|warn|log)\((?:[^()]*,\s*)?(error|err|e)(\.(config|request|response))?\s*[,)]/;
    const offenders = sourceFiles(sourceRoot).flatMap((file) =>
      fs
        .readFileSync(file, 'utf-8')
        .split(/\r?\n/)
        .map((line, index) => ({ line, location: `${path.relative(sourceRoot, file)}:${index + 1}` }))
        .filter(({ line }) => rawErrorLog.test(line))
        .map(({ location }) => location)
    );

    expect(offenders).toEqual([]);
  });
});
