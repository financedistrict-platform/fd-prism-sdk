import * as http from 'http';
import { AddressInfo } from 'net';
import {
  DEFAULT_MAX_HELD_RESPONSE_BYTES,
  holdResponseUntilSettled,
  resolveMaxHeldResponseBytes,
} from '../../middleware/response-hold';
import { PrismConfigError } from '../../types/errors';

describe('resolveMaxHeldResponseBytes', () => {
  it('defaults to 8 MiB', () => {
    expect(resolveMaxHeldResponseBytes(undefined)).toBe(8 * 1024 * 1024);
    expect(DEFAULT_MAX_HELD_RESPONSE_BYTES).toBe(8 * 1024 * 1024);
  });

  it('accepts a positive integer', () => {
    expect(resolveMaxHeldResponseBytes(1)).toBe(1);
    expect(resolveMaxHeldResponseBytes(1024)).toBe(1024);
  });

  it.each([0, -5, 0.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects %p', (value) => {
    expect(() => resolveMaxHeldResponseBytes(value)).toThrow(PrismConfigError);
  });
});

describe('holdResponseUntilSettled', () => {
  let server: http.Server;

  afterEach((done) => {
    server.close(() => done());
  });

  const get = (handler: http.RequestListener) =>
    new Promise<{ status: number; body: string }>((resolve, reject) => {
      server = http.createServer(handler);
      server.listen(0, () => {
        const { port } = server.address() as AddressInfo;
        http
          .get({ port, path: '/' }, (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => resolve({ status: res.statusCode || 0, body }));
          })
          .on('error', reject);
      });
    });

  it('releases held output after the settle callback resolves', async () => {
    const response = await get((_req, res) => {
      holdResponseUntilSettled(res, async () => null, { protocolVersion: 2, maxHeldBytes: 1024 });
      res.write('one-');
      res.end('two');
    });

    expect(response).toEqual({ status: 200, body: 'one-two' });
  });

  it('replaces the output with the rejection returned by the settle callback', async () => {
    const response = await get((_req, res) => {
      holdResponseUntilSettled(
        res,
        async () => ({ status: 402, body: { error: 'nope' } }),
        { protocolVersion: 2, maxHeldBytes: 1024 }
      );
      res.write('secret');
      res.end();
    });

    expect(response.status).toBe(402);
    expect(JSON.parse(response.body)).toEqual({ error: 'nope' });
  });

  it('answers 500 without calling settle once the hold limit is exceeded', async () => {
    const settle = jest.fn(async () => null);

    const response = await get((_req, res) => {
      holdResponseUntilSettled(res, settle, { protocolVersion: 2, maxHeldBytes: 8 });
      res.write('123456789');
      res.end();
    });

    expect(response.status).toBe(500);
    expect(JSON.parse(response.body).error).toBe('Response too large to settle');
    expect(settle).not.toHaveBeenCalled();
  });
});
