import express, { Express, Request, Response } from 'express';
import request from 'supertest';
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

      const paymentHeader = Buffer.from(
        JSON.stringify({
          x402Version: 1,
          scheme: 'eip3009',
          network: '1',
          asset: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
          payload: { authorization: '0xsignature123' },
        })
      ).toString('base64');

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

      const paymentHeader = Buffer.from(
        JSON.stringify({
          x402Version: 1,
          scheme: 'eip3009',
          network: '1',
          asset: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
          payload: { authorization: '0xinvalidsignature' },
        })
      ).toString('base64');

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
});
