import nock from 'nock';
import { PrismClient } from '../../client/prism-client';
import {
  PrismGatewayError,
  PrismNetworkError,
} from '../../types/errors';

describe('PrismClient', () => {
  const API_KEY = 'test-api-key-123';
  const TEST_URL = 'https://prism-gw.test.1stdigital.tech';
  const PRODUCTION_URL = 'https://prism-api.1stdigital.tech';

  // V2 Mock Data Helpers
  const createV2PaymentRequirements = () => ({
    scheme: 'eip3009',
    network: 'eip155:1',
    amount: '10000',
    asset: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    payTo: '0x1234567890abcdef',
    maxTimeoutSeconds: 60,
    extra: {
      name: 'USDC',
      version: '2'
    },
  });

  const createV2PaymentPayload = (overrides?: any) => ({
    x402Version: 2 as const,
    resource: {
      url: 'https://api.example.com/paid-content',
      description: 'Premium article access',
      mimeType: 'application/json',
    },
    accepted: createV2PaymentRequirements(),
    payload: {
      signature: '0x2d6a7588d6acca505cbf0d9a4a227e0c52c6c34008c8e8986a1283259764173608a2ce6496642e377d6da8dbbf5836e9bd15092f9ecab05ded3d6293af148b571c',
      authorization: {
        from: '0x857b06519E91e3A54538791bDbb0E22373e36b66',
        to: '0x1234567890abcdef',
        value: '10000',
        validAfter: '1740672089',
        validBefore: '1740672154',
        nonce: '0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480',
      }
    },
    extensions: {},
    ...overrides,
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('constructor', () => {
    it('should create client with default test environment', () => {
      const client = new PrismClient({
        apiKey: API_KEY,
      });

      expect(client).toBeInstanceOf(PrismClient);
      // @ts-ignore - accessing private property for test
      expect(client['client'].defaults.baseURL).toBe(TEST_URL);
    });

    it('should create client with production environment when baseUrl provided', () => {
      const client = new PrismClient({
        apiKey: API_KEY,
        baseUrl: PRODUCTION_URL,
      });

      // @ts-ignore - accessing private property for test
      expect(client['client'].defaults.baseURL).toBe(PRODUCTION_URL);
    });

    it('should create client with custom baseUrl', () => {
      const customUrl = 'https://custom-gateway.example.com';
      const client = new PrismClient({
        apiKey: API_KEY,
        baseUrl: customUrl,
      });

      // @ts-ignore - accessing private property for test
      expect(client['client'].defaults.baseURL).toBe(customUrl);
    });

    it('should set API key in headers', () => {
      const client = new PrismClient({
        apiKey: API_KEY,
      });

      // @ts-ignore - accessing private property for test
      const headers = client['client'].defaults.headers;
      expect(headers['X-API-Key']).toBe(API_KEY);
    });

    it('should default to protocol version 2', () => {
      const client = new PrismClient({
        apiKey: API_KEY,
      });

      // @ts-ignore - accessing private property for test
      expect(client['protocolVersion']).toBe(2);
    });

    it('should respect x402Version from config', () => {
      const client = new PrismClient({
        apiKey: API_KEY,
        x402Version: 1,
      });

      // @ts-ignore - accessing private property for test
      expect(client['protocolVersion']).toBe(1);
    });
  });

  describe('getAuthInfo', () => {
    const client = new PrismClient({
      apiKey: API_KEY,
    });

    it('should return auth info on successful request', async () => {
      const mockAuthInfo = {
        authenticated: true,
        userId: 'user-123',
        permissions: ['read', 'write'],
      };

      nock(TEST_URL)
        .get('/api/v2/auth-info')
        .reply(200, mockAuthInfo);

      const result = await client.getAuthInfo();

      expect(result).toEqual(mockAuthInfo);
    });

    it('should throw PrismGatewayError on 401 Unauthorized', async () => {
      const traceId = '0HNGT483NH6I8:00000001';
      const timestamp = '2024-01-01T12:00:00Z';

      nock(TEST_URL).get('/api/v2/auth-info').reply(401, {
        error: 'Invalid API key',
        traceId,
        timestamp,
      });

      try {
        await client.getAuthInfo();
      } catch (error: any) {
        expect(error.statusCode).toBe(401);
      }
    });

    it('should throw PrismGatewayError on 500 Internal Error', async () => {
      const traceId = '0HNGT483NH6I8:00000002';
      const timestamp = '2024-01-01T12:05:00Z';

      nock(TEST_URL).get('/api/v2/auth-info').reply(500, {
        error: 'Database connection failed',
        traceId,
        timestamp,
      });

      try {
        await client.getAuthInfo();
      } catch (error: any) {
        expect(error).toBeInstanceOf(PrismGatewayError);
        expect(error.statusCode).toBe(500);
        expect(error.traceId).toBe(traceId);
        expect(error.message).toContain('Database connection failed');
      }
    });

    it('should throw PrismNetworkError on timeout', async () => {
      nock(TEST_URL)
        .get('/api/v2/auth-info')
        .delayConnection(2000)
        .reply(200, {});

      // Mock timeout error
      nock(TEST_URL).get('/api/v2/auth-info').replyWithError({
        code: 'ECONNABORTED',
        message: 'timeout of 3000ms exceeded',
      });

      try {
        await client.getAuthInfo();
      } catch (error: any) {
        expect(error).toBeInstanceOf(PrismNetworkError);
        expect(error.statusCode).toBe(503);
        expect(error.code).toBe('NETWORK_ERROR');
      }
    });

    it('should throw PrismNetworkError on connection refused', async () => {
      nock(TEST_URL).get('/api/v2/auth-info').replyWithError({
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED 127.0.0.1:443',
      });

      try {
        await client.getAuthInfo();
      } catch (error: any) {
        expect(error).toBeInstanceOf(PrismNetworkError);
        expect(error.statusCode).toBe(503);
      }
    });
  });

  describe('getPaymentRequirements', () => {
    const client = new PrismClient({
      apiKey: API_KEY,
    });

    it('should return payment requirements on successful request', async () => {
      const request = {
        resourceUrl: 'https://api.example.com/paid-content',
        requestedAmount: 0.01,
        description: 'Premium article access',
        mimeType: 'application/json',
      };

      const mockRequirements = {
        x402Version: 2,
        error: 'PAYMENT-SIGNATURE header is required',
        resource: {
          url: request.resourceUrl,
          description: request.description,
          mimeType: request.mimeType,
        },
        accepts: [{
          scheme: 'eip3009',
          network: 'eip155:1',
          amount: '10000',
          asset: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
          payTo: '0x1234567890abcdef',
          maxTimeoutSeconds: 60,
          extra: {
            name: 'USDC',
            version: '2'
          },
        }],
        extensions: {},
      };

      nock(TEST_URL)
        .post('/api/v2/payment/requirements', request)
        .reply(200, mockRequirements);

      const result = await client.getPaymentRequirements(request);

      expect(result).toEqual(mockRequirements);
    });

    it('should throw PrismGatewayError on 400 Bad Request', async () => {
      const request = {
        resourceUrl: 'https://api.example.com/paid-content',
        requestedAmount: -5, // Invalid: negative amount
        description: 'Premium article access',
        mimeType: 'application/json',
      };

      nock(TEST_URL)
        .post('/api/v2/payment/requirements')
        .reply(400, {
          error: 'Invalid amount',
          details: { field: 'requestedAmount', reason: 'Must be positive' },
        });

      try {
        await client.getPaymentRequirements(request);
      } catch (error: any) {
        expect(error).toBeInstanceOf(PrismGatewayError);
        expect(error.statusCode).toBe(400);
        expect(error.message).toContain('Invalid amount');
      }
    });

    it('should throw PrismGatewayError on 401 Unauthorized', async () => {
      const request = {
        resourceUrl: 'https://api.example.com/paid-content',
        requestedAmount: 0.01,
        description: 'Premium article access',
        mimeType: 'application/json',
      };

      nock(TEST_URL)
        .post('/api/v2/payment/requirements')
        .reply(401, {
          error: 'Invalid API key',
          traceId: '0HNGT483NH6I8:00000003',
        });

      try {
        await client.getPaymentRequirements(request);
      } catch (error: any) {
        expect(error).toBeInstanceOf(PrismGatewayError);
        expect(error.statusCode).toBe(401);
      }
    });

    it('should throw PrismGatewayError on 500 Internal Error with traceId', async () => {
      const request = {
        resourceUrl: 'https://api.example.com/paid-content',
        requestedAmount: 0.01,
        description: 'Premium article access',
        mimeType: 'application/json',
      };

      const traceId = '0HNGT483NH6I8:00000004';
      const timestamp = '2024-01-01T12:10:00Z';

      nock(TEST_URL)
        .post('/api/v2/payment/requirements')
        .reply(500, {
          error: 'Database error',
          traceId,
          timestamp,
        });

      try {
        await client.getPaymentRequirements(request);
      } catch (error: any) {
        expect(error).toBeInstanceOf(PrismGatewayError);
        expect(error.statusCode).toBe(500);
        expect(error.traceId).toBe(traceId);
        expect(error.timestamp).toBe(timestamp);
      }
    });

    it('should throw PrismNetworkError on network failure', async () => {
      const request = {
        resourceUrl: 'https://api.example.com/paid-content',
        requestedAmount: 0.01,
        description: 'Premium article access',
        mimeType: 'application/json',
      };

      nock(TEST_URL)
        .post('/api/v2/payment/requirements')
        .replyWithError({
          code: 'ETIMEDOUT',
          message: 'Request timeout',
        });

      try {
        await client.getPaymentRequirements(request);
      } catch (error: any) {
        expect(error).toBeInstanceOf(PrismNetworkError);
        expect(error.statusCode).toBe(503);
      }
    });
  });

  describe('verifyPayment', () => {
    const client = new PrismClient({
      apiKey: API_KEY,
    });

    it('should return valid payment verification', async () => {
      const paymentRequirements = {
        scheme: 'eip3009',
        network: 'eip155:1',
        amount: '10000',
        asset: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        payTo: '0x1234567890abcdef',
        maxTimeoutSeconds: 60,
        extra: {
          name: 'USDC',
          version: '2'
        },
      };

      const paymentPayload = {
        x402Version: 2 as const,
        resource: {
          url: 'https://api.example.com/paid-content',
          description: 'Premium article access',
          mimeType: 'application/json',
        },
        accepted: paymentRequirements,
        payload: {
          signature: '0xsignature123',
          authorization: {
            from: '0x857b06519E91e3A54538791bDbb0E22373e36b66',
            to: '0x1234567890abcdef',
            value: '10000',
            validAfter: '0',
            validBefore: '999999999',
            nonce: '0xabc123',
          }
        },
        extensions: {},
      };

      const mockVerifyResponse = {
        isValid: true,
        payer: '0xabcdef1234567890',
      };

      nock(TEST_URL)
        .post('/api/v2/payment/verify', {
          paymentPayload,
          paymentRequirements,
        })
        .reply(200, mockVerifyResponse);

      const result = await client.verifyPayment(
        paymentPayload,
        paymentRequirements
      );

      expect(result).toEqual(mockVerifyResponse);
      expect(result.isValid).toBe(true);
      expect(result.payer).toBe('0xabcdef1234567890');
    });

    it('should return invalid payment verification', async () => {
      const paymentRequirements = createV2PaymentRequirements();
      const basePayload = createV2PaymentPayload();
      const paymentPayload = createV2PaymentPayload({
        payload: {
          signature: 'invalid-signature',
          authorization: basePayload.payload.authorization,
        }
      });

      const mockVerifyResponse = {
        isValid: false,
        error: 'Invalid signature',
      };

      nock(TEST_URL)
        .post('/api/v2/payment/verify')
        .reply(200, mockVerifyResponse);

      const result = await client.verifyPayment(
        paymentPayload,
        paymentRequirements
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });

    it('should throw PrismGatewayError on 400 Bad Request', async () => {
      const paymentRequirements = {} as any; // Incomplete requirements
      const paymentPayload = createV2PaymentPayload({ payload: {} });

      nock(TEST_URL)
        .post('/api/v2/payment/verify')
        .reply(400, {
          error: 'Missing required fields',
        });

      try {
        await client.verifyPayment(paymentPayload, paymentRequirements);
      } catch (error: any) {
        expect(error).toBeInstanceOf(PrismGatewayError);
        expect(error.statusCode).toBe(400);
      }
    });

    it('should throw PrismGatewayError on 500 Internal Error', async () => {
      const paymentRequirements = createV2PaymentRequirements();
      const paymentPayload = createV2PaymentPayload();

      const traceId = '0HNGT483NH6I8:00000005';

      nock(TEST_URL).post('/api/v2/payment/verify').reply(500, {
        error: 'Internal server error',
        traceId,
      });

      try {
        await client.verifyPayment(paymentPayload, paymentRequirements);
      } catch (error: any) {
        expect(error).toBeInstanceOf(PrismGatewayError);
        expect(error.statusCode).toBe(500);
        expect(error.traceId).toBe(traceId);
      }
    });

    it('should throw PrismNetworkError on network error', async () => {
      const paymentRequirements = createV2PaymentRequirements();
      const paymentPayload = createV2PaymentPayload();

      nock(TEST_URL).post('/api/v2/payment/verify').replyWithError({
        code: 'ECONNRESET',
        message: 'Connection reset',
      });

      try {
        await client.verifyPayment(paymentPayload, paymentRequirements);
      } catch (error: any) {
        expect(error).toBeInstanceOf(PrismNetworkError);
        expect(error.statusCode).toBe(503);
      }
    });
  });

  describe('settlePayment', () => {
    const client = new PrismClient({
      apiKey: API_KEY,
    });

    it('should return successful settlement', async () => {
      const paymentPayload = createV2PaymentPayload({
        payload: {
          signature: '0xsignature123',
          authorization: {
            from: '0xabcdef1234567890',
            to: '0x1234567890abcdef',
            value: 10000,
            validAfter: 0,
            validBefore: 999999999,
          }
        }
      });

      const paymentRequirements = createV2PaymentRequirements();

      const mockSettleResponse = {
        success: true,
        payer: '0xabcdef1234567890',
        transaction: '0xtxhash123456',
        network: '1',
      };

      nock(TEST_URL)
        .post('/api/v2/payment/settle', {
          paymentPayload,
          paymentRequirements,
        })
        .reply(200, mockSettleResponse);

      const result = await client.settlePayment(
        paymentPayload,
        paymentRequirements
      );

      expect(result).toEqual(mockSettleResponse);
      expect(result.success).toBe(true);
      expect(result.transaction).toBe('0xtxhash123456');
    });

    it('should return failed settlement', async () => {
      const paymentPayload = createV2PaymentPayload({
        payload: {
          signature: '0xinvalidsignature',
          authorization: {
            from: '0xabcdef1234567890',
            to: '0x1234567890abcdef',
            value: 10000,
            validAfter: 0,
            validBefore: 999999999,
          }
        }
      });

      const paymentRequirements = createV2PaymentRequirements();

      const mockSettleResponse = {
        success: false,
        errorReason: 'Insufficient funds',
      };

      nock(TEST_URL)
        .post('/api/v2/payment/settle')
        .reply(200, mockSettleResponse);

      const result = await client.settlePayment(
        paymentPayload,
        paymentRequirements
      );

      expect(result.success).toBe(false);
      expect(result.errorReason).toBe('Insufficient funds');
    });

    it('should throw PrismGatewayError on 400 Bad Request', async () => {
      const paymentPayload = {
        x402Version: 2,
        scheme: 'eip3009',
        network: 'eip155:1',
        payload: {},
      } as any; // Incomplete payload
      const paymentRequirements = createV2PaymentRequirements();

      nock(TEST_URL)
        .post('/api/v2/payment/settle')
        .reply(400, {
          error: 'Invalid payload',
        });

      try {
        await client.settlePayment(paymentPayload, paymentRequirements);
      } catch (error: any) {
        expect(error).toBeInstanceOf(PrismGatewayError);
        expect(error.statusCode).toBe(400);
      }
    });

    it('should throw PrismGatewayError on 500 Internal Error', async () => {
      const paymentPayload = createV2PaymentPayload({
        payload: {
          signature: '0xsignature123',
          authorization: {
            from: '0xabcdef1234567890',
            to: '0x1234567890abcdef',
            value: 10000,
            validAfter: 0,
            validBefore: 999999999,
          }
        }
      });

      const paymentRequirements = createV2PaymentRequirements();

      const traceId = '0HNGT483NH6I8:00000006';

      nock(TEST_URL).post('/api/v2/payment/settle').reply(500, {
        error: 'Blockchain node unavailable',
        traceId,
      });

      try {
        await client.settlePayment(paymentPayload, paymentRequirements);
      } catch (error: any) {
        expect(error).toBeInstanceOf(PrismGatewayError);
        expect(error.statusCode).toBe(500);
        expect(error.traceId).toBe(traceId);
      }
    });

    it('should throw PrismNetworkError on network error', async () => {
      const paymentPayload = createV2PaymentPayload({
        payload: {
          signature: '0xsignature123',
          authorization: {
            from: '0xabcdef1234567890',
            to: '0x1234567890abcdef',
            value: 10000,
            validAfter: 0,
            validBefore: 999999999,
          }
        }
      });

      const paymentRequirements = createV2PaymentRequirements();

      nock(TEST_URL).post('/api/v2/payment/settle').replyWithError({
        code: 'EAI_AGAIN',
        message: 'DNS lookup failed',
      });

      try {
        await client.settlePayment(paymentPayload, paymentRequirements);
      } catch (error: any) {
        expect(error).toBeInstanceOf(PrismNetworkError);
        expect(error.statusCode).toBe(503);
      }
    });
  });
});
