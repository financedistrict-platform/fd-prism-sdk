import * as http from 'http';
import { Readable } from 'stream';
import { AddressInfo } from 'net';
import { prismPaymentMiddleware, PrismHttpRequest } from '../../middleware/prism-middleware';

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

const paymentRequirement = {
  scheme: 'exact',
  network: 'eip155:84532',
  amount: '10000',
  asset: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  payTo: '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01',
  maxTimeoutSeconds: 60,
};

const paidRequirementsResponse = {
  x402Version: 2,
  accepts: [paymentRequirement],
};

let nonceCounter = 0;

const validPaymentHeader = () =>
  Buffer.from(
    JSON.stringify({
      x402Version: 2,
      accepted: paymentRequirement,
      payload: {
        signature: '0xsignature123',
        authorization: {
          from: '0x1111111111111111111111111111111111111111',
          to: paymentRequirement.payTo,
          value: '10000',
          validAfter: '0',
          validBefore: '9999999999',
          nonce: `0xnonce-${++nonceCounter}`,
        },
      },
    })
  ).toString('base64');

// Helper to make HTTP requests for testing
function makeRequest(
  server: http.Server,
  options: http.RequestOptions,
  body?: string
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const address = server.address();
    if (!address || typeof address === 'string') {
      reject(new Error('Server not listening'));
      return;
    }

    const req = http.request(
      {
        ...options,
        hostname: 'localhost',
        port: address.port,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk.toString();
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 500,
            headers: res.headers,
            body,
          });
        });
      }
    );

    req.on('error', reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

describe('prismPaymentMiddleware (HTTP)', () => {
  let server: http.Server;

  afterEach((done) => {
    if (server && server.listening) {
      server.close(done);
    } else {
      done();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic functionality', () => {
    it('should create middleware function', () => {
      const middleware = prismPaymentMiddleware(
        {
          apiKey: 'test-api-key',
          client: createMockClient(),
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
      const middleware = prismPaymentMiddleware(
        {
          apiKey: 'test-api-key',
          client: createMockClient(),
        },
        {}
      );

      server = http.createServer(async (req: PrismHttpRequest, res) => {
        const handled = await middleware(req, res);
        if (!handled) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Public content' }));
        }
      });

      await new Promise<void>((resolve) => {
        server.listen(0, () => resolve());
      });

      const response = await makeRequest(server, {
        method: 'GET',
        path: '/public',
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.message).toBe('Public content');
    });

    it('should handle POST requests to unprotected routes', async () => {
      const middleware = prismPaymentMiddleware(
        {
          apiKey: 'test-api-key',
          client: createMockClient(),
        },
        {}
      );

      server = http.createServer(async (req: PrismHttpRequest, res) => {
        const handled = await middleware(req, res);
        if (!handled) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ token: 'abc123' }));
        }
      });

      await new Promise<void>((resolve) => {
        server.listen(0, () => resolve());
      });

      const response = await makeRequest(
        server,
        {
          method: 'POST',
          path: '/api/login',
          headers: {
            'Content-Type': 'application/json',
          },
        },
        JSON.stringify({ username: 'test', password: 'test' })
      );

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.token).toBe('abc123');
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
            payTo: '0x1234567890abcdef',
            resource: 'http://localhost/api/premium',
            description: 'Premium API access',
          },
        ],
      };

      mockGetPaymentRequirements.mockResolvedValue(mockRequirements);

      const middleware = prismPaymentMiddleware(
        {
          apiKey: 'test-api-key',
          client: createMockClient(),
        },
        {
          '/api/premium': {
            price: '10000',
            description: 'Premium API access',
          },
        }
      );

      server = http.createServer(async (req: PrismHttpRequest, res) => {
        const handled = await middleware(req, res);
        if (!handled) {
          res.writeHead(200);
          res.end('Should not reach here');
        }
      });

      await new Promise<void>((resolve) => {
        server.listen(0, () => resolve());
      });

      const response = await makeRequest(server, {
        method: 'GET',
        path: '/api/premium',
      });

      expect(response.statusCode).toBe(402);
      expect(response.headers['x-payment-requirements']).toBeDefined();
      const data = JSON.parse(response.body);
      expect(data.x402Version).toBe(1);
      expect(mockGetPaymentRequirements).toHaveBeenCalled();
    });

    it('should allow access with valid payment header', async () => {
      const mockRequirements = paidRequirementsResponse;


      mockGetPaymentRequirements.mockResolvedValue(mockRequirements);
      mockVerifyPayment.mockResolvedValue({
        isValid: true,
        payer: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
      });
      mockSettlePayment.mockResolvedValue({
        success: true,
        transaction: '0xtxhash',
        payer: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        network: '1',
      });

      const middleware = prismPaymentMiddleware(
        {
          apiKey: 'test-api-key',
          allowedVersions: [2],
          client: createMockClient(),
        },
        {
          '/api/premium': {
            price: '10000',
            description: 'Premium API access',
          },
        }
      );

      server = http.createServer(async (req: PrismHttpRequest, res) => {
        const handled = await middleware(req, res);
        if (!handled) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Premium content', payer: req.payer }));
        }
      });

      await new Promise<void>((resolve) => {
        server.listen(0, () => resolve());
      });

      const response = await makeRequest(server, {
        method: 'GET',
        path: '/api/premium',
        headers: {
          'PAYMENT-SIGNATURE': validPaymentHeader(),
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.message).toBe('Premium content');
      expect(data.payer).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');
      expect(mockVerifyPayment).toHaveBeenCalled();
    });

    it('should reject invalid payment', async () => {
      const mockRequirements = paidRequirementsResponse;

      mockGetPaymentRequirements.mockResolvedValue(mockRequirements);
      mockVerifyPayment.mockResolvedValue({
        isValid: false,
        error: 'Invalid signature',
      });

      const middleware = prismPaymentMiddleware(
        {
          apiKey: 'test-api-key',
          allowedVersions: [2],
          client: createMockClient(),
        },
        {
          '/api/premium': {
            price: '10000',
            description: 'Premium API access',
          },
        }
      );

      server = http.createServer(async (req: PrismHttpRequest, res) => {
        const handled = await middleware(req, res);
        if (!handled) {
          res.writeHead(200);
          res.end('Should not reach here');
        }
      });

      await new Promise<void>((resolve) => {
        server.listen(0, () => resolve());
      });

      const response = await makeRequest(server, {
        method: 'GET',
        path: '/api/premium',
        headers: {
          'PAYMENT-SIGNATURE': validPaymentHeader(),
        },
      });

      expect(response.statusCode).toBe(402);
      expect(mockVerifyPayment).toHaveBeenCalled();
    });

    it('should reject a v1 payment with 402 before any gateway call when only v2 is allowed', async () => {
      const middleware = prismPaymentMiddleware(
        {
          apiKey: 'test-api-key',
          client: createMockClient(),
        },
        {
          '/api/premium': {
            price: '10000',
            description: 'Premium API access',
          },
        }
      );

      server = http.createServer(async (req: PrismHttpRequest, res) => {
        const handled = await middleware(req, res);
        if (!handled) {
          res.writeHead(200);
          res.end('Should not reach here');
        }
      });

      await new Promise<void>((resolve) => {
        server.listen(0, () => resolve());
      });

      const response = await makeRequest(server, {
        method: 'GET',
        path: '/api/premium',
        headers: {
          'X-PAYMENT': Buffer.from(JSON.stringify({
            x402Version: 1,
            scheme: 'exact',
            network: 'base-sepolia',
            payload: {
              signature: '0xsignature',
              authorization: {
                from: '0x1111111111111111111111111111111111111111',
                to: '0xAbCdEf0123456789aBcDeF0123456789AbCdEf01',
                value: '10000',
                validAfter: '0',
                validBefore: '99999999999',
                nonce: '0xnonce',
              },
            },
          })).toString('base64'),
        },
      });

      expect(response.statusCode).toBe(402);
      expect(response.body).not.toContain('Should not reach here');
      expect(mockGetPaymentRequirements).not.toHaveBeenCalled();
      expect(mockVerifyPayment).not.toHaveBeenCalled();
      expect(mockSettlePayment).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle Gateway errors gracefully', async () => {
      const { PrismGatewayError } = require('@financedistrict/prism-x402-sdk');

      mockGetPaymentRequirements.mockRejectedValue(
        new PrismGatewayError('Gateway unavailable', 500, '0HNGT483NH6I8:00000001')
      );

      const middleware = prismPaymentMiddleware(
        {
          apiKey: 'test-api-key',
          client: createMockClient(),
        },
        {
          '/api/premium': {
            price: '10000',
            description: 'Premium API access',
          },
        }
      );

      server = http.createServer(async (req: PrismHttpRequest, res) => {
        await middleware(req, res);
      });

      await new Promise<void>((resolve) => {
        server.listen(0, () => resolve());
      });

      const response = await makeRequest(server, {
        method: 'GET',
        path: '/api/premium',
      });

      expect(response.statusCode).toBe(500);
      const data = JSON.parse(response.body);
      expect(data.error).toBe('Gateway unavailable');
      expect(data.gateway?.traceId).toBe('0HNGT483NH6I8:00000001');
    });

    it('should handle Network errors gracefully', async () => {
      const { PrismNetworkError } = require('@financedistrict/prism-x402-sdk');

      mockGetPaymentRequirements.mockRejectedValue(
        new PrismNetworkError('Connection refused', { code: 'ECONNREFUSED' })
      );

      const middleware = prismPaymentMiddleware(
        {
          apiKey: 'test-api-key',
          client: createMockClient(),
        },
        {
          '/api/premium': {
            price: '10000',
            description: 'Premium API access',
          },
        }
      );

      server = http.createServer(async (req: PrismHttpRequest, res) => {
        await middleware(req, res);
      });

      await new Promise<void>((resolve) => {
        server.listen(0, () => resolve());
      });

      const response = await makeRequest(server, {
        method: 'GET',
        path: '/api/premium',
      });

      expect(response.statusCode).toBe(503);
      const data = JSON.parse(response.body);
      expect(data.error).toBe('Payment service unavailable');
      expect(data.retryAfter).toBe(60);
    });
  });

  describe('Streaming settlement', () => {
    const SECRET = 'PAID-CONTENT-SECRET';

    const paidRequirements = paidRequirementsResponse;

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

    const startServer = async (
      handler: (req: PrismHttpRequest, res: http.ServerResponse) => void,
      extraConfig: { maxHeldResponseBytes?: number } = {}
    ) => {
      const middleware = prismPaymentMiddleware(
        { apiKey: 'test-api-key', allowedVersions: [2], client: createMockClient(), ...extraConfig },
        { '/api/premium': { price: '10000', description: 'Premium API access' } }
      );
      server = http.createServer(async (req: PrismHttpRequest, res) => {
        const handled = await middleware(req, res);
        if (!handled) {
          handler(req, res);
        }
      });
      await new Promise<void>((resolve) => {
        server.listen(0, () => resolve());
      });
    };

    const pay = () =>
      makeRequest(server, {
        method: 'GET',
        path: '/api/premium',
        headers: { 'PAYMENT-SIGNATURE': validPaymentHeader() },
      });

    it('does not deliver res.write chunks when settlement fails', async () => {
      failSettlement();
      await startServer((_req, res) => {
        res.write(SECRET);
        res.end();
      });

      const response = await pay();

      expect(response.statusCode).toBe(402);
      expect(response.body).not.toContain(SECRET);
      expect(JSON.parse(response.body).error).toBe('Payment settlement failed');
    });

    it('does not deliver piped streams when settlement fails', async () => {
      failSettlement();
      await startServer((_req, res) => {
        Readable.from([SECRET, SECRET]).pipe(res);
      });

      const response = await pay();

      expect(response.statusCode).toBe(402);
      expect(response.body).not.toContain(SECRET);
    });

    it('does not deliver writeHead and write content when settlement fails', async () => {
      failSettlement();
      await startServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Content-Length': '999' });
        res.write(`data: ${SECRET}\n\n`);
        res.end();
      });

      const response = await pay();

      expect(response.statusCode).toBe(402);
      expect(response.body).not.toContain(SECRET);
      expect(JSON.parse(response.body).error).toBe('Payment settlement failed');
    });

    it('returns 402 when the settlement call rejects', async () => {
      allowPayment();
      mockSettlePayment.mockRejectedValue(new Error('gateway down'));
      await startServer((_req, res) => {
        res.write(SECRET);
        res.end();
      });

      const response = await pay();

      expect(response.statusCode).toBe(402);
      expect(response.body).not.toContain(SECRET);
    });

    it('delivers every chunk and the settlement header when settlement succeeds', async () => {
      allowSettlement();
      await startServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.write('alpha-');
        res.write(Buffer.from('beta-'));
        res.end('gamma');
      });

      const response = await pay();

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('alpha-beta-gamma');
      expect(response.headers['payment-response']).toBeDefined();
      expect(mockSettlePayment).toHaveBeenCalledTimes(1);
    });

    it('does not settle when the handler answers with an error status', async () => {
      allowPayment();
      await startServer((_req, res) => {
        res.statusCode = 500;
        res.write('boom');
        res.end();
      });

      const response = await pay();

      expect(response.statusCode).toBe(500);
      expect(response.body).toBe('boom');
      expect(mockSettlePayment).not.toHaveBeenCalled();
    });

    it('fails closed when the response exceeds the configured hold limit', async () => {
      allowSettlement();
      await startServer(
        (_req, res) => {
          for (let i = 0; i < 4; i += 1) {
            res.write(`${SECRET}-`.padEnd(512, 'x'));
          }
          res.end();
        },
        { maxHeldResponseBytes: 1024 }
      );

      const response = await pay();

      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain(SECRET);
      expect(JSON.parse(response.body).error).toBe('Response too large to settle');
      expect(mockSettlePayment).not.toHaveBeenCalled();
    });

    it('does not settle when the client disconnects before the handler finishes', async () => {
      allowSettlement();
      await startServer((_req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.write('partial-');
        setTimeout(() => res.end(SECRET), 150);
      });

      const { port } = server.address() as AddressInfo;
      const clientReq = http.get(
        { port, path: '/api/premium', headers: { 'PAYMENT-SIGNATURE': validPaymentHeader() } },
        () => undefined
      );
      clientReq.on('error', () => undefined);
      await new Promise((resolve) => setTimeout(resolve, 30));
      clientReq.destroy();
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(mockSettlePayment).not.toHaveBeenCalled();
    });
  });
});
