import * as http from 'http';
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
      const mockRequirements = {
        x402Version: 1,
        accepts: [
          {
            scheme: 'eip3009',
            network: '1',
            maxAmountRequired: '10000',
            resource: 'http://localhost/api/premium',
            description: 'Premium API access',
          },
        ],
      };

      const mockPayment = {
        x402Version: 1,
        scheme: 'eip3009',
        network: '1',
        asset: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        payload: {
          from: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
          to: '0x1234567890123456789012345678901234567890',
          value: '10000',
          validAfter: '0',
          validBefore: '999999999999',
          nonce: '0x1234',
          v: 27,
          r: '0xabc',
          s: '0xdef',
        },
      };

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
          'X-PAYMENT': Buffer.from(JSON.stringify(mockPayment)).toString('base64'),
        },
      });

      expect(response.statusCode).toBe(200);
      const data = JSON.parse(response.body);
      expect(data.message).toBe('Premium content');
      expect(data.payer).toBe('0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb');
      expect(mockVerifyPayment).toHaveBeenCalled();
    });

    it('should reject invalid payment', async () => {
      const mockRequirements = {
        x402Version: 1,
        accepts: [
          {
            scheme: 'eip3009',
            network: '1',
            maxAmountRequired: '10000',
            resource: 'http://localhost/api/premium',
            description: 'Premium API access',
          },
        ],
      };

      mockGetPaymentRequirements.mockResolvedValue(mockRequirements);
      mockVerifyPayment.mockResolvedValue({
        isValid: false,
        error: 'Invalid signature',
      });

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
          'X-PAYMENT': Buffer.from(JSON.stringify({ invalid: 'payment' })).toString('base64'),
        },
      });

      expect(response.statusCode).toBe(402);
      expect(mockVerifyPayment).toHaveBeenCalled();
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
});
