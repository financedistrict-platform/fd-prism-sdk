import express, { Express, NextFunction, Request, Response } from 'express';
import request from 'supertest';
import http from 'http';
import path from 'path';
import { Readable } from 'stream';
import { AddressInfo } from 'net';
import { prismPaymentMiddleware } from '../../middleware/prism-middleware';

// Create mock client methods
const mockGetPaymentRequirements = jest.fn();
const mockVerifyPayment = jest.fn();
const mockSettlePayment = jest.fn();
const mockGetAuthInfo = jest.fn();

// Create mock client object
const createMockClient = () => ({
  getPaymentRequirements: mockGetPaymentRequirements,
  verifyPayment: mockVerifyPayment,
  settlePayment: mockSettlePayment,
  getAuthInfo: mockGetAuthInfo,
});

let nonceSequence = 0;

const validPaymentHeader = () =>
  Buffer.from(
    JSON.stringify({
      x402Version: 1,
      scheme: 'eip3009',
      network: '1',
      payload: {
        signature: '0xsignature123',
        authorization: {
          from: '0xabcdef1234567890',
          to: '0x1234567890abcdef',
          value: '10000',
          validAfter: '0',
          validBefore: '9999999999',
          nonce: `0x${(++nonceSequence).toString(16)}`,
        },
      },
    })
  ).toString('base64');

const paidRequirements = {
  x402Version: 1,
  accepts: [
    {
      scheme: 'eip3009',
      network: '1',
      maxAmountRequired: '10000',
      resource: 'http://127.0.0.1/api/premium',
      description: 'Premium API access',
      mimeType: 'application/json',
      payTo: '0x1234567890abcdef',
      maxTimeoutSeconds: 60,
      asset: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
      extra: null,
    },
  ],
};

describe('prismPaymentMiddleware', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    jest.clearAllMocks();
  });

  describe('Basic functionality', () => {
    it('should create middleware with config and routes', () => {
      const middleware = prismPaymentMiddleware(
        {
          apiKey: 'test-api-key',
          client: createMockClient(), // Inject mock client
        },
        {
          '/api/premium': {
            price: '10000',
            description: 'Premium API access',
          },
        }
      );

      expect(middleware).toBeInstanceOf(Function);
    });

    it('should allow access to unprotected routes', async () => {
      app.use(
        prismPaymentMiddleware(
          {
            apiKey: 'test-api-key',
            client: createMockClient(), // Inject mock client
          },
          {}
        )
      );

      app.get('/public', (req: Request, res: Response) => {
        res.json({ message: 'Public content' });
      });

      const response = await request(app).get('/public');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Public content');
    });

    it('should handle POST requests to unprotected routes', async () => {
      app.use(
        prismPaymentMiddleware(
          {
            apiKey: 'test-api-key',
            client: createMockClient(), // Inject mock client
          },
          {}
        )
      );

      app.post('/api/login', (req: Request, res: Response) => {
        res.json({ token: 'abc123' });
      });

      const response = await request(app)
        .post('/api/login')
        .send({ username: 'test', password: 'test' });

      expect(response.status).toBe(200);
      expect(response.body.token).toBe('abc123');
    });
  });

  describe('Protected routes', () => {
    it('should return 402 for protected route without payment header', async () => {
      const mockRequirements = {
        x402Version: 1,
        accepts: [
          {
            scheme: 'eip3009',
            network: '1',
            maxAmountRequired: '10000',
            resource: 'http://127.0.0.1/api/premium',
            description: 'Premium API access',
            mimeType: 'application/json',
            payTo: '0x1234567890abcdef',
            maxTimeoutSeconds: 60,
            asset: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
            extra: null,
          },
        ],
      };

      mockGetPaymentRequirements.mockResolvedValue(mockRequirements);

      app.use(
        prismPaymentMiddleware(
          {
            apiKey: 'test-api-key',
            client: createMockClient(), // Inject mock client
          },
          {
            '/api/premium': {
              price: '10000',
              description: 'Premium API access',
            },
          }
        )
      );

      app.get('/api/premium', (req: Request, res: Response) => {
        res.json({ data: 'Premium content' });
      });

      const response = await request(app).get('/api/premium');

      expect(response.status).toBe(402);
      expect(response.headers['x-payment-requirements']).toBeDefined();
    });

    it.each(['/API/PREMIUM', '/Api/Premium', '/api/premium/', '/API/PREMIUM/'])(
      'should return 402 for %s, which Express routes to the protected handler',
      async (requestPath) => {
        mockGetPaymentRequirements.mockResolvedValue({
          x402Version: 1,
          accepts: [
            {
              scheme: 'eip3009',
              network: '1',
              maxAmountRequired: '10000',
              resource: 'http://127.0.0.1/api/premium',
              description: 'Premium API access',
              mimeType: 'application/json',
              payTo: '0x1234567890abcdef',
              maxTimeoutSeconds: 60,
              asset: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
              extra: null,
            },
          ],
        });
        const handler = jest.fn((req: Request, res: Response) => {
          res.json({ data: 'Premium content' });
        });

        app.use(
          prismPaymentMiddleware(
            { apiKey: 'test-api-key', client: createMockClient() },
            { '/api/premium': { price: '10000', description: 'Premium API access' } }
          )
        );
        app.get('/api/premium', handler);

        const response = await request(app).get(requestPath);

        expect(response.status).toBe(402);
        expect(handler).not.toHaveBeenCalled();
      }
    );

    it('should allow access with valid payment header', async () => {
      const mockRequirements = {
        x402Version: 1,
        accepts: [
          {
            scheme: 'eip3009',
            network: '1',
            maxAmountRequired: '10000',
            resource: 'http://127.0.0.1/api/premium',
            description: 'Premium API access',
            mimeType: 'application/json',
            payTo: '0x1234567890abcdef',
            maxTimeoutSeconds: 60,
            asset: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
            extra: null,
          },
        ],
      };

      const mockVerification = {
        isValid: true,
        payer: '0xabcdef1234567890',
      };

      const mockSettlement = {
        success: true,
        payer: '0xabcdef1234567890',
        transaction: '0xtxhash123',
        network: '1',
      };

      mockGetPaymentRequirements.mockResolvedValue(mockRequirements);
      mockVerifyPayment.mockResolvedValue(mockVerification);
      mockSettlePayment.mockResolvedValue(mockSettlement);

      app.use(
        prismPaymentMiddleware(
          {
            apiKey: 'test-api-key',
            allowedVersions: [1, 2],
            client: createMockClient(), // Inject mock client
          },
          {
            '/api/premium': {
              price: '10000',
              description: 'Premium API access',
            },
          }
        )
      );

      app.get('/api/premium', (req: Request, res: Response) => {
        res.json({ data: 'Premium content' });
      });

      const paymentHeader = validPaymentHeader();

      const response = await request(app)
        .get('/api/premium')
        .set('X-Payment', paymentHeader);

      expect(response.status).toBe(200);
      expect(response.body.data).toBe('Premium content');
      expect(mockVerifyPayment).toHaveBeenCalledTimes(1);
      expect(mockSettlePayment).toHaveBeenCalledTimes(1);
    });

    it('should reject invalid payment', async () => {
      const mockRequirements = {
        x402Version: 1,
        accepts: [
          {
            scheme: 'eip3009',
            network: '1',
            maxAmountRequired: '10000',
            resource: 'http://127.0.0.1/api/premium',
            description: 'Premium API access',
            mimeType: 'application/json',
            payTo: '0x1234567890abcdef',
            maxTimeoutSeconds: 60,
            asset: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
            extra: null,
          },
        ],
      };

      const mockVerification = {
        isValid: false,
        error: 'Invalid signature',
      };

      mockGetPaymentRequirements.mockResolvedValue(mockRequirements);
      mockVerifyPayment.mockResolvedValue(mockVerification);

      app.use(
        prismPaymentMiddleware(
          {
            apiKey: 'test-api-key',
            client: createMockClient(), // Inject mock client
          },
          {
            '/api/premium': {
              price: '10000',
              description: 'Premium API access',
            },
          }
        )
      );

      app.get('/api/premium', (req: Request, res: Response) => {
        res.json({ data: 'Premium content' });
      });

      const paymentHeader = validPaymentHeader();

      const response = await request(app)
        .get('/api/premium')
        .set('X-Payment', paymentHeader);

      expect(response.status).toBe(402);
    });
  });

  describe('Error handling', () => {
    it('should handle Gateway errors gracefully', async () => {
      const { PrismGatewayError } = jest.requireActual('@financedistrict/prism-x402-sdk');

      const gatewayError = new PrismGatewayError(
        'Gateway unavailable',
        500,
        '0HNGT483NH6I8:00000001'
      );

      mockGetPaymentRequirements.mockRejectedValue(gatewayError);

      app.use(
        prismPaymentMiddleware(
          {
            apiKey: 'test-api-key',
            client: createMockClient(), // Inject mock client
          },
          {
            '/api/premium': {
              price: '10000',
              description: 'Premium API access',
            },
          }
        )
      );

      app.get('/api/premium', (req: Request, res: Response) => {
        res.json({ data: 'Premium content' });
      });

      const response = await request(app).get('/api/premium');

      expect(response.status).toBe(500);
    });

    it('should handle Network errors gracefully', async () => {
      const { PrismNetworkError } = jest.requireActual('@financedistrict/prism-x402-sdk');

      const networkError = new PrismNetworkError('Connection refused', {
        code: 'ECONNREFUSED',
      });

      mockGetPaymentRequirements.mockRejectedValue(networkError);

      app.use(
        prismPaymentMiddleware(
          {
            apiKey: 'test-api-key',
            client: createMockClient(), // Inject mock client
          },
          {
            '/api/premium': {
              price: '10000',
              description: 'Premium API access',
            },
          }
        )
      );

      app.get('/api/premium', (req: Request, res: Response) => {
        res.json({ data: 'Premium content' });
      });

      const response = await request(app).get('/api/premium');

      expect(response.status).toBe(503);
    });
  });

  describe('Streaming settlement', () => {
    const SECRET = 'PAID-CONTENT-SECRET';

    const mountProtected = (
      handler: (req: Request, res: Response) => void,
      extraConfig: { maxHeldResponseBytes?: number } = {}
    ) => {
      app.use(
        prismPaymentMiddleware(
          { apiKey: 'test-api-key', allowedVersions: [1, 2], client: createMockClient(), ...extraConfig },
          { '/api/premium': { price: '10000', description: 'Premium API access' } }
        )
      );
      app.get('/api/premium', handler);
    };

    const pay = () => request(app).get('/api/premium').set('X-Payment', validPaymentHeader());

    const allowPayment = () => {
      mockGetPaymentRequirements.mockResolvedValue(paidRequirements);
      mockVerifyPayment.mockResolvedValue({ isValid: true, payer: '0xabcdef1234567890' });
    };

    const allowSettlement = () => {
      allowPayment();
      mockSettlePayment.mockResolvedValue({
        success: true,
        payer: '0xabcdef1234567890',
        transaction: '0xtxhash123',
        network: '1',
      });
    };

    const failSettlement = () => {
      allowPayment();
      mockSettlePayment.mockResolvedValue({ success: false, errorReason: 'insufficient_funds' });
    };

    const expectNothingLeaked = (response: request.Response) => {
      expect(response.status).toBe(402);
      expect(response.text).not.toContain(SECRET);
      expect(response.body.error).toBe('Payment settlement failed');
    };

    it('does not deliver res.write chunks when settlement fails', async () => {
      failSettlement();
      mountProtected((_req, res) => {
        res.write(SECRET);
        res.end();
      });

      expectNothingLeaked(await pay());
    });

    it('does not deliver res.write followed by res.end(chunk) when settlement fails', async () => {
      failSettlement();
      mountProtected((_req, res) => {
        res.setHeader('Content-Type', 'text/plain');
        res.write(SECRET);
        res.end(SECRET);
      });

      expectNothingLeaked(await pay());
    });

    it('does not deliver piped streams when settlement fails', async () => {
      failSettlement();
      mountProtected((_req, res) => {
        Readable.from([SECRET, SECRET]).pipe(res);
      });

      expectNothingLeaked(await pay());
    });

    it('does not deliver res.sendFile content when settlement fails', async () => {
      failSettlement();
      mountProtected((_req, res) => {
        res.sendFile(path.join(__dirname, '../../../package.json'));
      });

      const response = await pay();

      expect(response.status).toBe(402);
      expect(response.body.error).toBe('Payment settlement failed');
    });

    it('does not deliver writeHead + write content when settlement fails', async () => {
      failSettlement();
      mountProtected((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Content-Length': '999' });
        res.write(`data: ${SECRET}\n\n`);
        res.end();
      });

      expectNothingLeaked(await pay());
    });

    it('does not deliver SSE flushHeaders + write content when settlement fails', async () => {
      failSettlement();
      mountProtected((_req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.flushHeaders();
        res.write(`data: ${SECRET}\n\n`);
        res.end();
      });

      expectNothingLeaked(await pay());
    });

    it('returns a parseable 402 when the handler set a Content-Length', async () => {
      failSettlement();
      mountProtected((_req, res) => {
        res.json({ secret: SECRET, padding: 'x'.repeat(500) });
      });

      expectNothingLeaked(await pay());
    });

    it('returns 402 when the settlement call rejects', async () => {
      allowPayment();
      mockSettlePayment.mockRejectedValue(new Error('gateway down'));
      mountProtected((_req, res) => {
        res.write(SECRET);
        res.end();
      });

      const response = await pay();

      expect(response.status).toBe(402);
      expect(response.text).not.toContain(SECRET);
    });

    it('delivers no byte to the client before settlement completes', async () => {
      allowPayment();
      let settled = false;
      mockSettlePayment.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        settled = true;
        return { success: true, payer: '0xabcdef1234567890', transaction: '0xtxhash123', network: '1' };
      });
      mountProtected((_req, res) => {
        res.setHeader('Content-Type', 'text/plain');
        res.write('first-');
        setTimeout(() => {
          res.write('second-');
          res.end('third');
        }, 20);
      });

      const server = app.listen(0);
      try {
        const { port } = server.address() as AddressInfo;
        const settledAtFirstByte = await new Promise<boolean>((resolve, reject) => {
          const clientReq = http.get(
            { port, path: '/api/premium', headers: { 'X-Payment': validPaymentHeader() } },
            (clientRes) => {
              const settledAtHeaders = settled;
              clientRes.once('data', () => resolve(settledAtHeaders && settled));
              clientRes.resume();
            }
          );
          clientReq.on('error', reject);
        });

        expect(settledAtFirstByte).toBe(true);
      } finally {
        server.close();
      }
    });

    it('delivers every chunk and the settlement header when settlement succeeds', async () => {
      allowSettlement();
      mountProtected((_req, res) => {
        res.setHeader('Content-Type', 'text/plain');
        res.write('alpha-');
        res.write(Buffer.from('beta-'));
        res.end('gamma');
      });

      const response = await pay();

      expect(response.status).toBe(200);
      expect(response.text).toBe('alpha-beta-gamma');
      expect(response.headers['x-payment-response']).toBeDefined();
      expect(mockSettlePayment).toHaveBeenCalledTimes(1);
    });

    it('delivers piped streams when settlement succeeds', async () => {
      allowSettlement();
      mountProtected((_req, res) => {
        res.setHeader('Content-Type', 'text/plain');
        Readable.from(['one-', 'two-', 'three']).pipe(res);
      });

      const response = await pay();

      expect(response.status).toBe(200);
      expect(response.text).toBe('one-two-three');
      expect(mockSettlePayment).toHaveBeenCalledTimes(1);
    });

    it('delivers sendFile content when settlement succeeds', async () => {
      allowSettlement();
      mountProtected((_req, res) => {
        res.sendFile(path.join(__dirname, '../../../package.json'));
      });

      const response = await pay();

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('@financedistrict/prism-x402-sdk-express');
      expect(mockSettlePayment).toHaveBeenCalledTimes(1);
    });

    it('does not settle when the handler answers with an error status', async () => {
      allowPayment();
      mountProtected((_req, res) => {
        res.status(500);
        res.write('boom');
        res.end();
      });

      const response = await pay();

      expect(response.status).toBe(500);
      expect(response.text).toBe('boom');
      expect(mockSettlePayment).not.toHaveBeenCalled();
    });

    describe('hold limit', () => {
      const expectTooLarge = (response: request.Response) => {
        expect(response.status).toBe(500);
        expect(response.text).not.toContain(SECRET);
        expect(response.body.error).toBe('Response too large to settle');
        expect(mockSettlePayment).not.toHaveBeenCalled();
      };

      it('fails closed when res.write exceeds the configured limit', async () => {
        allowSettlement();
        mountProtected(
          (_req, res) => {
            for (let i = 0; i < 4; i += 1) {
              res.write(`${SECRET}-`.padEnd(512, 'x'));
            }
            res.end();
          },
          { maxHeldResponseBytes: 1024 }
        );

        expectTooLarge(await pay());
      });

      it('fails closed when res.end(chunk) crosses the configured limit', async () => {
        allowSettlement();
        mountProtected(
          (_req, res) => {
            res.write('a'.repeat(600));
            res.end(`${SECRET}${'b'.repeat(600)}`);
          },
          { maxHeldResponseBytes: 1024 }
        );

        expectTooLarge(await pay());
      });

      it('fails closed for a piped stream larger than the limit and lets the source finish', async () => {
        allowSettlement();
        let sourceEnded = false;
        mountProtected(
          (_req, res) => {
            const source = Readable.from(Array.from({ length: 64 }, () => Buffer.alloc(1024, 0x41)));
            source.on('end', () => {
              sourceEnded = true;
            });
            source.pipe(res);
          },
          { maxHeldResponseBytes: 8 * 1024 }
        );

        const response = await pay();

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Response too large to settle');
        expect(mockSettlePayment).not.toHaveBeenCalled();
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(sourceEnded).toBe(true);
      });

      it('applies a default limit when none is configured', async () => {
        allowSettlement();
        mountProtected((_req, res) => {
          for (let i = 0; i < 9; i += 1) {
            res.write(Buffer.alloc(1024 * 1024, 0x41));
          }
          res.end();
        });

        const response = await pay();

        expect(response.status).toBe(500);
        expect(response.body.error).toBe('Response too large to settle');
        expect(mockSettlePayment).not.toHaveBeenCalled();
      });

      it('still delivers and settles a response exactly at the limit', async () => {
        allowSettlement();
        mountProtected(
          (_req, res) => {
            res.setHeader('Content-Type', 'text/plain');
            res.write('a'.repeat(512));
            res.end('b'.repeat(512));
          },
          { maxHeldResponseBytes: 1024 }
        );

        const response = await pay();

        expect(response.status).toBe(200);
        expect(response.text).toHaveLength(1024);
        expect(mockSettlePayment).toHaveBeenCalledTimes(1);
      });

      it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
        'rejects an invalid maxHeldResponseBytes of %p at construction',
        (maxHeldResponseBytes) => {
          expect(() =>
            prismPaymentMiddleware(
              { apiKey: 'test-api-key', client: createMockClient(), maxHeldResponseBytes },
              {}
            )
          ).toThrow('maxHeldResponseBytes');
        }
      );
    });

    describe('client disconnect', () => {
      const getPaid = (port: number) =>
        http.get(
          { port, path: '/api/premium', headers: { 'X-Payment': validPaymentHeader() } },
          () => undefined
        );

      it('does not settle when the client disconnects before the handler finishes', async () => {
        allowSettlement();
        mountProtected((_req, res) => {
          res.setHeader('Content-Type', 'text/plain');
          res.write('partial-');
          setTimeout(() => res.end(SECRET), 150);
        });

        const server = app.listen(0);
        try {
          const { port } = server.address() as AddressInfo;
          const clientReq = getPaid(port);
          clientReq.on('error', () => undefined);
          await new Promise((resolve) => setTimeout(resolve, 30));
          clientReq.destroy();

          await new Promise((resolve) => setTimeout(resolve, 300));

          expect(mockSettlePayment).not.toHaveBeenCalled();
        } finally {
          server.close();
        }
      });

      it('does not settle when res.end is called after the client already left', async () => {
        allowSettlement();
        let handlerEnded: () => void = () => undefined;
        const handlerDone = new Promise<void>((resolve) => {
          handlerEnded = resolve;
        });
        mountProtected((_req, res) => {
          res.on('close', () => {
            res.end(SECRET);
            handlerEnded();
          });
        });

        const server = app.listen(0);
        try {
          const { port } = server.address() as AddressInfo;
          const clientReq = getPaid(port);
          clientReq.on('error', () => undefined);
          await new Promise((resolve) => setTimeout(resolve, 30));
          clientReq.destroy();

          await handlerDone;
          await new Promise((resolve) => setTimeout(resolve, 100));

          expect(mockSettlePayment).not.toHaveBeenCalled();
        } finally {
          server.close();
        }
      });

      it('destroys the connection instead of hanging when releasing the response throws', async () => {
        allowPayment();
        mockSettlePayment.mockResolvedValue({ success: false, errorReason: 'insufficient_funds' });
        mountProtected((_req, res) => {
          res.removeHeader = () => {
            throw new Error('header removal failed');
          };
          res.end(SECRET);
        });

        const server = app.listen(0);
        try {
          const { port } = server.address() as AddressInfo;
          const outcome = await new Promise<string>((resolve) => {
            const clientReq = http.get(
              { port, path: '/api/premium', headers: { 'X-Payment': validPaymentHeader() } },
              (clientRes) => {
                clientRes.on('data', () => undefined);
                clientRes.on('end', () => resolve('completed'));
                clientRes.on('error', () => resolve('destroyed'));
                clientRes.on('aborted', () => resolve('destroyed'));
              }
            );
            clientReq.on('error', () => resolve('destroyed'));
            setTimeout(() => resolve('hung'), 1500);
          });

          expect(outcome).toBe('destroyed');
        } finally {
          server.close();
        }
      });
    });
  });

  describe('Stacked payment middleware', () => {
    const SECRET = 'PAID-CONTENT-SECRET';
    const config = () => ({ apiKey: 'test-api-key', allowedVersions: [1, 2] as (1 | 2)[], client: createMockClient() });
    const globalRoutes = { '/api/*': { price: '10000', description: 'API' } };
    const overrideRoutes = { '/api/expensive': { price: '10000', description: 'Expensive operation' } };

    const mountStacked = (handler: (req: Request, res: Response) => void) => {
      app.use(prismPaymentMiddleware(config(), globalRoutes));
      app.get('/api/expensive', prismPaymentMiddleware(config(), overrideRoutes), handler);
    };

    const pay = () => request(app).get('/api/expensive').set('X-Payment', validPaymentHeader());

    const allowPayment = () => {
      mockGetPaymentRequirements.mockResolvedValue(paidRequirements);
      mockVerifyPayment.mockResolvedValue({ isValid: true, payer: '0xabcdef1234567890' });
    };

    const settlementResult = {
      success: true,
      payer: '0xabcdef1234567890',
      transaction: '0xtxhash123',
      network: '1',
    };

    it('settles exactly once when a route-level middleware overrides a global one', async () => {
      allowPayment();
      mockSettlePayment.mockResolvedValue(settlementResult);
      mountStacked((_req, res) => {
        res.json({ result: SECRET });
      });

      const response = await pay();

      expect(response.status).toBe(200);
      expect(response.body.result).toBe(SECRET);
      expect(response.headers['x-payment-response'] || response.headers['payment-response']).toBeDefined();
      expect(mockSettlePayment).toHaveBeenCalledTimes(1);
    });

    it('still delivers the paid content when the same middleware is mounted twice', async () => {
      allowPayment();
      mockSettlePayment.mockResolvedValue(settlementResult);
      const shared = prismPaymentMiddleware(config(), globalRoutes);
      app.use(shared);
      app.get('/api/expensive', shared, (_req, res) => {
        res.json({ result: SECRET });
      });

      const response = await pay();

      expect(response.status).toBe(200);
      expect(response.body.result).toBe(SECRET);
      expect(mockSettlePayment).toHaveBeenCalledTimes(1);
    });

    it('settles once and withholds the content when the single settlement fails', async () => {
      allowPayment();
      mockSettlePayment.mockResolvedValue({ success: false, errorReason: 'insufficient_funds' });
      mountStacked((_req, res) => {
        res.json({ result: SECRET });
      });

      const response = await pay();

      expect(response.status).toBe(402);
      expect(response.text).not.toContain(SECRET);
      expect(response.body.error).toBe('Payment settlement failed');
      expect(mockSettlePayment).toHaveBeenCalledTimes(1);
    });

    it('does not settle when the route-level middleware rejects the payment', async () => {
      mockGetPaymentRequirements.mockResolvedValue(paidRequirements);
      mockVerifyPayment
        .mockResolvedValueOnce({ isValid: true, payer: '0xabcdef1234567890' })
        .mockResolvedValueOnce({ isValid: false, error: 'insufficient_amount' });
      mockSettlePayment.mockResolvedValue(settlementResult);
      const handler = jest.fn((_req: Request, res: Response) => {
        res.json({ result: SECRET });
      });
      mountStacked(handler);

      const response = await pay();

      expect(response.status).toBe(402);
      expect(response.text).not.toContain(SECRET);
      expect(handler).not.toHaveBeenCalled();
      expect(mockSettlePayment).not.toHaveBeenCalled();
    });

    it('settles against the route-level requirements, not the global ones', async () => {
      const globalRequirements = {
        ...paidRequirements,
        accepts: [{ ...paidRequirements.accepts[0], maxAmountRequired: '10000' }],
      };
      const overrideRequirements = {
        ...paidRequirements,
        accepts: [{ ...paidRequirements.accepts[0], maxAmountRequired: '10000', description: 'override' }],
      };
      mockGetPaymentRequirements
        .mockResolvedValueOnce(globalRequirements)
        .mockResolvedValueOnce(overrideRequirements);
      mockVerifyPayment.mockResolvedValue({ isValid: true, payer: '0xabcdef1234567890' });
      mockSettlePayment.mockResolvedValue(settlementResult);
      mountStacked((_req, res) => {
        res.json({ result: SECRET });
      });

      await pay();

      expect(mockSettlePayment).toHaveBeenCalledTimes(1);
      expect(mockSettlePayment.mock.calls[0][1].description).toBe('override');
    });

    describe('payment middleware reached after the response ended', () => {
      const mountLate = (errorHandler: jest.Mock) => {
        app.use(prismPaymentMiddleware(config(), globalRoutes));
        app.get('/api/expensive', (_req, res, next) => {
          res.end(SECRET);
          next();
        });
        app.use(prismPaymentMiddleware(config(), globalRoutes));
        app.use((error: Error, _req: Request, res: Response, next: NextFunction) => {
          errorHandler(error);
          res.status(500).send(`<html>${'x'.repeat(400)}</html>`);
        });
      };

      const getWithTimeout = (port: number) =>
        new Promise<{ status: number; body: string }>((resolve, reject) => {
          const clientReq = http.get(
            { port, path: '/api/expensive', headers: { 'X-Payment': validPaymentHeader() }, timeout: 1500 },
            (res) => {
              let body = '';
              res.on('data', (chunk) => (body += chunk));
              res.on('end', () => resolve({ status: res.statusCode || 0, body }));
            }
          );
          clientReq.on('timeout', () => {
            clientReq.destroy();
            reject(new Error('response never completed'));
          });
          clientReq.on('error', reject);
        });

      it('delivers the response once, settles once and never reaches the error handler', async () => {
        allowPayment();
        mockSettlePayment.mockResolvedValue(settlementResult);
        const errorHandler = jest.fn();
        mountLate(errorHandler);

        const server = app.listen(0);
        try {
          const { port } = server.address() as AddressInfo;
          const response = await getWithTimeout(port);

          expect(response.status).toBe(200);
          expect(response.body).toBe(SECRET);
          expect(errorHandler).not.toHaveBeenCalled();
          expect(mockSettlePayment).toHaveBeenCalledTimes(1);
        } finally {
          server.close();
        }
      });

      it('still withholds the content when the single settlement fails', async () => {
        allowPayment();
        mockSettlePayment.mockResolvedValue({ success: false, errorReason: 'insufficient_funds' });
        const errorHandler = jest.fn();
        mountLate(errorHandler);

        const server = app.listen(0);
        try {
          const { port } = server.address() as AddressInfo;
          const response = await getWithTimeout(port);

          expect(response.status).toBe(402);
          expect(response.body).not.toContain(SECRET);
          expect(errorHandler).not.toHaveBeenCalled();
          expect(mockSettlePayment).toHaveBeenCalledTimes(1);
        } finally {
          server.close();
        }
      });
    });
  });
});

describe('prismPaymentMiddleware under a mount prefix', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPaymentRequirements.mockResolvedValue(paidRequirements);
  });

  const mountedApp = () => {
    const app = express();
    const router = express.Router();
    router.use(
      prismPaymentMiddleware(
        { apiKey: 'test-api-key', client: createMockClient() },
        { '/api/paid': { price: '10000', description: 'Mounted paid route' } }
      )
    );
    router.get('/paid', (_req: Request, res: Response) => {
      res.json({ content: 'paid-content-secret' });
    });
    router.get('/free', (_req: Request, res: Response) => {
      res.json({ content: 'free' });
    });
    app.use('/api', router);
    return app;
  };

  it('charges the configured full path of a route mounted under a prefix', async () => {
    const response = await request(mountedApp()).get('/api/paid');

    expect(response.status).toBe(402);
    expect(response.text).not.toContain('paid-content-secret');
  });

  it('charges the mounted route when a query string is present', async () => {
    const response = await request(mountedApp()).get('/api/paid?x=1');

    expect(response.status).toBe(402);
  });

  it('leaves other mounted routes free', async () => {
    const response = await request(mountedApp()).get('/api/free');

    expect(response.status).toBe(200);
  });
});
